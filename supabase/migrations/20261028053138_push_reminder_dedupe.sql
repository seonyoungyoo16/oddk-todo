-- Reconnecting an installation must not redisplay a reminder it acknowledged.
create or replace function public.push_seed_deliveries(p_user uuid default null)
returns void language sql security invoker set search_path=pg_catalog,public
as $$
  insert into public.push_deliveries(reminder_id,installation_id,subscription_revision,next_attempt_at)
  select r.id,s.installation_id,s.revision,r.due_at
  from public.push_reminders r join public.push_subscriptions s on s.user_id=r.user_id and s.enabled
  where r.active and r.expires_at>clock_timestamp() and (p_user is null or r.user_id=p_user)
    and not exists(select 1 from public.push_deliveries old where old.reminder_id=r.id
      and old.installation_id=s.installation_id and old.displayed_at is not null)
  on conflict(reminder_id,installation_id,subscription_revision) do update
    set status='pending',next_attempt_at=excluded.next_attempt_at,lease_id=null,lease_until='-infinity',receipt_hash=null,last_error=null
    where push_deliveries.status='cancelled' and push_deliveries.displayed_at is null and push_deliveries.attempts<4;
$$;

-- The HTTP receipt adapter uses 'displayed' to suppress duplicate presentation.
create or replace function public.push_delivery_receipt(p_id uuid,p_receipt_hash text,p_binding_hash text,p_action text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare result jsonb;
begin
  if p_action is null or p_action not in ('check','ack') or p_receipt_hash is null or p_binding_hash is null then return null; end if;
  select jsonb_build_object('plan',a.plan,'userId',r.user_id,'taskId',r.task_id,'startAt',r.start_at,'dueAt',r.due_at,'expiresAt',r.expires_at,
    'installationId',s.installation_id,'revision',s.revision,'displayed',d.displayed_at is not null) into result
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
