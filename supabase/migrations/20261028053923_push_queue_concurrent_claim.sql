-- ON CONFLICT ... UPDATE locks even a row whose WHERE clause rejects the
-- update. Exclude already queued pairs before INSERT so a worker holding five
-- claims cannot block another worker while it seeds the remaining pairs.
create or replace function public.push_seed_deliveries(p_user uuid default null)
returns void language sql security invoker set search_path=pg_catalog,public
as $$
  insert into public.push_deliveries(reminder_id,installation_id,subscription_revision,next_attempt_at)
  select r.id,s.installation_id,s.revision,r.due_at
  from public.push_reminders r join public.push_subscriptions s on s.user_id=r.user_id and s.enabled
  where r.active and r.expires_at>clock_timestamp() and (p_user is null or r.user_id=p_user)
    and not exists(select 1 from public.push_deliveries old where old.reminder_id=r.id
      and old.installation_id=s.installation_id and old.displayed_at is not null)
    and not exists(select 1 from public.push_deliveries queued where queued.reminder_id=r.id
      and queued.installation_id=s.installation_id and queued.subscription_revision=s.revision
      and (queued.status<>'cancelled' or queued.displayed_at is not null or queued.attempts>=4))
  on conflict(reminder_id,installation_id,subscription_revision) do update
    set status='pending',next_attempt_at=excluded.next_attempt_at,lease_id=null,lease_until='-infinity',receipt_hash=null,last_error=null
    where push_deliveries.status='cancelled' and push_deliveries.displayed_at is null and push_deliveries.attempts<4;
$$;
