create table public.push_worker_state (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  project_url text check(project_url ~ '^https://[a-z]{20}\.supabase\.co$'),
  ticket_hash text check(ticket_hash ~ '^[a-f0-9]{64}$'),
  ticket_until timestamptz not null default '-infinity',
  lease_id uuid,
  lease_until timestamptz not null default '-infinity',
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_result jsonb not null default '{}',
  last_request_id bigint
);
insert into public.push_worker_state(singleton) values(true);
alter table public.push_worker_state enable row level security;
revoke all on public.push_worker_state from public,anon,authenticated;
grant select,update on public.push_worker_state to service_role;

create function public.push_worker_claim(p_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare result jsonb;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  update public.push_worker_state set ticket_hash=null,ticket_until='-infinity',lease_id=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '45 seconds',last_started_at=clock_timestamp()
  where singleton and enabled and ticket_hash=p_hash and ticket_until>clock_timestamp() and lease_until<=clock_timestamp()
  returning jsonb_build_object('id',lease_id,'until',lease_until) into result;
  if result is not null then
    delete from public.push_reminders where expires_at<clock_timestamp()-interval '7 days';
    perform public.push_seed_deliveries(null);
  end if;
  return result;
end;
$$;
revoke all on function public.push_worker_claim(text) from public,anon,authenticated;
grant execute on function public.push_worker_claim(text) to service_role;

create function public.push_worker_deliveries(p_worker uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
begin
  perform 1 from public.push_worker_state where singleton and enabled and lease_id=p_worker and lease_until>clock_timestamp() for update;
  if not found then return '[]'::jsonb; end if;
  return public.push_delivery_claim(5);
end;
$$;
revoke all on function public.push_worker_deliveries(uuid) from public,anon,authenticated;
grant execute on function public.push_worker_deliveries(uuid) to service_role;

create function public.push_worker_current(p_worker uuid,p_id uuid,p_lease uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public
as $$
  select public.push_delivery_current(p_id,p_lease) from public.push_worker_state
  where singleton and enabled and lease_id=p_worker and lease_until>clock_timestamp();
$$;
revoke all on function public.push_worker_current(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_worker_current(uuid,uuid,uuid) to service_role;

create function public.push_worker_finish(p_lease uuid,p_result jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public
as $$
begin
  if p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>1000 then return false; end if;
  update public.push_worker_state set lease_id=null,lease_until='-infinity',last_finished_at=clock_timestamp(),last_result=p_result
  where singleton and lease_id=p_lease and lease_until>clock_timestamp();
  return found;
end;
$$;
revoke all on function public.push_worker_finish(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.push_worker_finish(uuid,jsonb) to service_role;

create function public.push_worker_dispatch()
returns bigint language plpgsql security invoker set search_path=pg_catalog,public,extensions
as $$
declare target text; token text; request_id bigint;
begin
  select project_url into target from public.push_worker_state where singleton and enabled and project_url is not null
    and ticket_until<=clock_timestamp() and lease_until<=clock_timestamp() for update skip locked;
  if not found then return null; end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update public.push_worker_state set ticket_hash=encode(extensions.digest(token,'sha256'),'hex'),ticket_until=clock_timestamp()+interval '2 minutes' where singleton;
  select net.http_post(url:=target||'/functions/v1/push-worker',headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('ticket',token),timeout_milliseconds:=40000) into request_id;
  update public.push_worker_state set last_request_id=request_id where singleton;
  return request_id;
end;
$$;
revoke all on function public.push_worker_dispatch() from public,anon,authenticated,service_role;
select cron.schedule('oddk-push-worker','* * * * *','select public.push_worker_dispatch();');

-- Bind expected local owner/revision before the receipt can acknowledge display.
create function public.push_receipt_authorize(p_id uuid,p_receipt_hash text,p_binding_hash text,p_installation uuid,p_user uuid,p_revision bigint,p_action text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare result jsonb;
begin
  if p_action is null or p_action not in ('check','ack') then return null; end if;
  result:=public.push_delivery_receipt(p_id,p_receipt_hash,p_binding_hash,'check');
  if result is null or (result->>'userId') is distinct from p_user::text
    or (result->>'installationId') is distinct from p_installation::text
    or (result->>'revision') is distinct from p_revision::text then return null; end if;
  if p_action='ack' then result:=public.push_delivery_receipt(p_id,p_receipt_hash,p_binding_hash,'ack'); end if;
  return result;
end;
$$;
revoke all on function public.push_receipt_authorize(uuid,text,text,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.push_receipt_authorize(uuid,text,text,uuid,uuid,bigint,text) to service_role;
