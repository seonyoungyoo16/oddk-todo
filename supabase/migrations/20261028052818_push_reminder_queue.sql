-- Logical reminders contain no title/notes. Device deliveries contain only
-- machine state and hashes; the encrypted push will carry a receipt, not text.
create table public.push_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  event_key text not null unique check(event_key ~ '^[a-f0-9]{64}$'),
  start_at timestamptz not null,
  due_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>due_at),
  active boolean not null default true,
  refresh_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index push_reminders_user on public.push_reminders(user_id);
create index push_reminders_active on public.push_reminders(user_id,due_at) where active;
create index push_reminders_expiry on public.push_reminders(expires_at);
alter table public.push_reminders enable row level security;
revoke all on public.push_reminders from public,anon,authenticated;
grant select,insert,update,delete on public.push_reminders to service_role;

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.push_reminders(id) on delete cascade,
  installation_id uuid not null references public.push_subscriptions(installation_id) on delete cascade,
  subscription_revision bigint not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','cancelled','expired','failed')),
  attempts smallint not null default 0 check(attempts between 0 and 4),
  next_attempt_at timestamptz not null,
  lease_id uuid,
  lease_until timestamptz not null default '-infinity',
  receipt_hash text check(receipt_hash ~ '^[a-f0-9]{64}$'),
  sent_at timestamptz,
  displayed_at timestamptz,
  last_error text check(last_error in ('subscription','temporary','permanent','invalid','expired','removed')),
  unique(reminder_id,installation_id,subscription_revision)
);
create index push_deliveries_installation on public.push_deliveries(installation_id);
create index push_deliveries_due on public.push_deliveries(next_attempt_at,id) where status in ('pending','sending');
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.push_deliveries to service_role;

create function public.push_project_reminders(p_plan jsonb)
returns table(task_id text,start_at timestamptz,due_at timestamptz,expires_at timestamptz)
language plpgsql stable security invoker set search_path=pg_catalog,public
as $$
declare item jsonb; start_value timestamptz; minutes_value integer; minutes_numeric numeric; lead_value integer;
begin
  if (p_plan->>'schemaVersion') is distinct from '6' then return; end if;
  for item in select value from jsonb_array_elements(case when jsonb_typeof(p_plan->'tasks')='array' then p_plan->'tasks' else '[]'::jsonb end)
    where jsonb_typeof(value)='object' and jsonb_typeof(value->'id')='string' and length(value->>'id')>0
      and value->'done'='false'::jsonb and value->'summaryOnly' is distinct from 'true'::jsonb
      and value->'reminderMinutes' in ('0'::jsonb,'5'::jsonb,'10'::jsonb,'15'::jsonb,'30'::jsonb,'60'::jsonb)
      and value->>'plannedDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and value->>'startTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and jsonb_typeof(value->'minutes')='number'
  loop
    -- Malformed direct-admin data must not break unrelated plan persistence.
    begin
      minutes_numeric:=(item->>'minutes')::numeric;
      if minutes_numeric<2 or minutes_numeric>240 or minutes_numeric<>trunc(minutes_numeric) then continue; end if;
      minutes_value:=minutes_numeric::integer; lead_value:=(item->>'reminderMinutes')::numeric::integer;
      start_value:=((item->>'plannedDate')::date + (item->>'startTime')::time) at time zone 'Asia/Seoul';
      task_id:=item->>'id'; start_at:=start_value;
      due_at:=start_value-make_interval(mins=>lead_value);
      expires_at:=least(start_value+interval '2 minutes',due_at+interval '5 minutes',start_value+make_interval(mins=>minutes_value));
      return next;
    exception when datetime_field_overflow or invalid_datetime_format or invalid_text_representation or numeric_value_out_of_range then continue;
    end;
  end loop;
end;
$$;
revoke all on function public.push_project_reminders(jsonb) from public,anon,authenticated;
grant execute on function public.push_project_reminders(jsonb) to service_role;

-- Seed/rearm valid device pairs. Called by triggers AND claim, so a concurrent
-- plan/subscription commit cannot leave an otherwise valid pair unscheduled.
create function public.push_seed_deliveries(p_user uuid default null)
returns void language sql security invoker set search_path=pg_catalog,public
as $$
  insert into public.push_deliveries(reminder_id,installation_id,subscription_revision,next_attempt_at)
  select r.id,s.installation_id,s.revision,r.due_at
  from public.push_reminders r join public.push_subscriptions s on s.user_id=r.user_id and s.enabled
  where r.active and r.expires_at>clock_timestamp() and (p_user is null or r.user_id=p_user)
  on conflict(reminder_id,installation_id,subscription_revision) do update
    set status='pending',next_attempt_at=excluded.next_attempt_at,lease_id=null,lease_until='-infinity',receipt_hash=null,last_error=null
    where push_deliveries.status='cancelled' and push_deliveries.displayed_at is null and push_deliveries.attempts<4;
$$;
revoke all on function public.push_seed_deliveries(uuid) from public,anon,authenticated;
grant execute on function public.push_seed_deliveries(uuid) to service_role;

create function public.push_sync_reminders(p_user uuid,p_plan jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog,public,extensions
as $$
declare refresh uuid:=gen_random_uuid();
begin
  insert into public.push_reminders(user_id,task_id,event_key,start_at,due_at,expires_at,refresh_id)
  select p_user,p.task_id,encode(extensions.digest(jsonb_build_array(p_user,p.task_id,extract(epoch from p.start_at),extract(epoch from p.due_at))::text,'sha256'),'hex'),p.start_at,p.due_at,p.expires_at,refresh
  from public.push_project_reminders(p_plan) p where p.expires_at>clock_timestamp()
  on conflict(event_key) do update set active=true,refresh_id=excluded.refresh_id;
  update public.push_reminders set active=false where user_id=p_user and active and refresh_id<>refresh;
  update public.push_deliveries d set status='cancelled',lease_id=null,lease_until='-infinity',receipt_hash=null,last_error='removed'
  from public.push_reminders r where d.reminder_id=r.id and r.user_id=p_user and not r.active and d.status in ('pending','sending');
  perform public.push_seed_deliveries(p_user);
end;
$$;
revoke all on function public.push_sync_reminders(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.push_sync_reminders(uuid,jsonb) to service_role;

create function public.push_plan_changed()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public
as $$
begin
  if TG_OP='DELETE' then perform public.push_sync_reminders(OLD.user_id,null); return OLD; end if;
  perform public.push_sync_reminders(NEW.user_id,NEW.plan); return NEW;
end;
$$;
revoke all on function public.push_plan_changed() from public,anon,authenticated;
create trigger push_plan_changed after insert or update of plan or delete on public.account_plans
for each row execute function public.push_plan_changed();

create function public.push_subscription_changed()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public
as $$
begin
  -- Deletion is already covered by the FK; a rebind invalidates the old revision.
  update public.push_deliveries set status='cancelled',lease_id=null,lease_until='-infinity',receipt_hash=null,last_error='subscription'
  where installation_id=NEW.installation_id and status in ('pending','sending')
    and (not NEW.enabled or subscription_revision<>NEW.revision);
  if NEW.enabled then perform public.push_seed_deliveries(NEW.user_id); end if;
  return NEW;
end;
$$;
revoke all on function public.push_subscription_changed() from public,anon,authenticated;
create trigger push_subscription_changed after insert or update on public.push_subscriptions
for each row execute function public.push_subscription_changed();

create function public.push_delivery_claim(p_limit integer default 5)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,extensions
as $$
declare result jsonb:='[]'::jsonb; candidate record; lease uuid; token text;
begin
  if p_limit is null or p_limit<1 or p_limit>5 then raise exception 'Delivery batch must be 1..5'; end if;
  delete from public.push_reminders where expires_at<clock_timestamp()-interval '7 days';
  update public.push_deliveries d set status='expired',lease_id=null,lease_until='-infinity',receipt_hash=null,last_error='expired'
  from public.push_reminders r where d.reminder_id=r.id and r.expires_at<=clock_timestamp() and d.status in ('pending','sending');
  update public.push_deliveries d set status='cancelled',lease_id=null,lease_until='-infinity',receipt_hash=null,last_error='removed'
  where d.status in ('pending','sending') and not exists(
    select 1 from public.push_reminders r join public.push_subscriptions s on s.installation_id=d.installation_id
    where r.id=d.reminder_id and r.active and s.enabled and s.user_id=r.user_id and s.revision=d.subscription_revision);
  perform public.push_seed_deliveries(null);
  for candidate in
    select d.id,r.id as reminder_id,r.user_id,r.task_id,r.start_at,r.due_at,r.expires_at,s.installation_id,s.revision
    from public.push_deliveries d join public.push_reminders r on r.id=d.reminder_id
      join public.push_subscriptions s on s.installation_id=d.installation_id and s.user_id=r.user_id and s.enabled and s.revision=d.subscription_revision
    where r.active and r.expires_at>clock_timestamp() and d.displayed_at is null and d.attempts<4
      and d.next_attempt_at<=clock_timestamp() and (d.status='pending' or d.status='sending' and d.lease_until<=clock_timestamp())
    order by d.next_attempt_at,d.id limit p_limit for update of d skip locked
  loop
    lease:=gen_random_uuid(); token:=encode(extensions.gen_random_bytes(32),'hex');
    update public.push_deliveries set status='sending',attempts=attempts+1,lease_id=lease,lease_until=clock_timestamp()+interval '35 seconds',
      receipt_hash=encode(extensions.digest(token,'sha256'),'hex') where id=candidate.id;
    result:=result||jsonb_build_array(jsonb_build_object('id',candidate.id,'lease',lease,'reminderId',candidate.reminder_id,
      'userId',candidate.user_id,'taskId',candidate.task_id,'startAt',candidate.start_at,'dueAt',candidate.due_at,'expiresAt',candidate.expires_at,
      'installationId',candidate.installation_id,'revision',candidate.revision,'receiptToken',token));
  end loop;
  return result;
end;
$$;
revoke all on function public.push_delivery_claim(integer) from public,anon,authenticated;
grant execute on function public.push_delivery_claim(integer) to service_role;

create function public.push_delivery_current(p_id uuid,p_lease uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$
  select jsonb_build_object('plan',a.plan,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key)))
  from public.push_deliveries d join public.push_reminders r on r.id=d.reminder_id
  join public.push_subscriptions s on s.installation_id=d.installation_id and s.user_id=r.user_id and s.revision=d.subscription_revision and s.enabled
  join public.account_plans a on a.user_id=r.user_id
  where d.id=p_id and d.lease_id=p_lease and d.status='sending' and d.lease_until>clock_timestamp() and r.active and r.expires_at>clock_timestamp();
$$;
revoke all on function public.push_delivery_current(uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_delivery_current(uuid,uuid) to service_role;

create function public.push_delivery_finish(p_id uuid,p_lease uuid,p_outcome text,p_retry_seconds integer default 30)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare item public.push_deliveries; reminder public.push_reminders;
begin
  select * into item from public.push_deliveries where id=p_id;
  if not found then return false; end if;
  if item.status='sent' and p_outcome='sent' then return true; end if;
  if item.displayed_at is not null and item.status='sent' then return true; end if;
  if item.lease_id is distinct from p_lease or item.status<>'sending' or item.lease_until<=clock_timestamp() then return false; end if;
  select * into reminder from public.push_reminders where id=item.reminder_id;
  if p_outcome='gone' then
    update public.push_subscriptions set enabled=false,endpoint=null,endpoint_hash=null,p256dh=null,auth_key=null,revision=revision+1,updated_at=clock_timestamp()
    where installation_id=item.installation_id and revision=item.subscription_revision and user_id=reminder.user_id and enabled;
    return found;
  end if;
  if p_outcome is null or p_outcome not in ('sent','retry','failed','invalid','removed') then return false; end if;
  update public.push_deliveries set
    status=case when not reminder.active then 'cancelled' when reminder.expires_at<=clock_timestamp() then 'expired'
      when p_outcome='removed' then 'cancelled' when p_outcome='sent' then 'sent' when p_outcome='retry' and attempts<4 then 'pending' else 'failed' end,
    next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(5,least(coalesce(p_retry_seconds,30),60))),
    sent_at=case when p_outcome='sent' then clock_timestamp() else sent_at end,
    last_error=case when p_outcome='retry' then 'temporary' when p_outcome='failed' then 'permanent' when p_outcome='invalid' then 'invalid' when p_outcome='removed' then 'removed' else null end,
    receipt_hash=case when p_outcome in ('sent','retry') and reminder.active and reminder.expires_at>clock_timestamp() then receipt_hash else null end,
    lease_id=null,lease_until='-infinity'
  where id=p_id and lease_id=p_lease and status='sending' and lease_until>clock_timestamp();
  return found;
end;
$$;
revoke all on function public.push_delivery_finish(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.push_delivery_finish(uuid,uuid,text,integer) to service_role;

-- Receipt/device hashes are provided by a later restricted HTTP endpoint. This
-- returns a plan only to service_role, which validates it before returning text.
create function public.push_delivery_receipt(p_id uuid,p_receipt_hash text,p_binding_hash text,p_action text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare result jsonb;
begin
  if p_action is null or p_action not in ('check','ack') or p_receipt_hash is null or p_binding_hash is null then return null; end if;
  select jsonb_build_object('plan',a.plan,'userId',r.user_id,'taskId',r.task_id,'startAt',r.start_at,'dueAt',r.due_at,'expiresAt',r.expires_at,
    'installationId',s.installation_id,'revision',s.revision) into result
  from public.push_deliveries d join public.push_reminders r on r.id=d.reminder_id
  join public.push_subscriptions s on s.installation_id=d.installation_id and s.user_id=r.user_id and s.revision=d.subscription_revision and s.enabled
  join public.account_plans a on a.user_id=r.user_id
  where d.id=p_id and d.receipt_hash=p_receipt_hash and s.binding_hash=p_binding_hash
    and d.status in ('pending','sending','sent') and r.active and r.expires_at>clock_timestamp();
  if result is null then return null; end if;
  if p_action='ack' then
    update public.push_deliveries set displayed_at=coalesce(displayed_at,clock_timestamp()),status='sent',sent_at=coalesce(sent_at,clock_timestamp()),lease_id=null,lease_until='-infinity'
    where id=p_id and receipt_hash=p_receipt_hash;
  end if;
  return result;
end;
$$;
revoke all on function public.push_delivery_receipt(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.push_delivery_receipt(uuid,text,text,text) to service_role;

-- Backfill existing valid V6 plans without changing their data or version.
do $$
declare item record;
begin
  for item in select user_id,plan from public.account_plans where plan->>'schemaVersion'='6' loop
    perform public.push_sync_reminders(item.user_id,item.plan);
  end loop;
end;
$$;
