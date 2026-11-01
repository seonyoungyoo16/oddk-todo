-- Apple event_time is whole seconds; Auth timestamps include milliseconds.
create or replace function public.account_apple_notification_users(p_subject text, p_event_time bigint)
returns table(user_id uuid) language sql security definer set search_path = '' as $$
  select i.user_id from auth.identities i
  where i.provider='apple' and i.provider_id=p_subject
    and pg_catalog.date_trunc('second',i.created_at) <= pg_catalog.to_timestamp(p_event_time)
    and pg_catalog.date_trunc('second',coalesce(i.last_sign_in_at,i.created_at)) <= pg_catalog.to_timestamp(p_event_time);
$$;
revoke all on function public.account_apple_notification_users(text,bigint) from public,anon,authenticated;
grant execute on function public.account_apple_notification_users(text,bigint) to service_role;
