-- Called only after Apple's notification JWS, issuer and audience are verified.
-- Narrow definer read is needed because service_role has no general Auth-table API.
create function public.account_apple_notification_users(p_subject text, p_event_time bigint)
returns table(user_id uuid) language sql security definer set search_path = '' as $$
  select i.user_id from auth.identities i
  where i.provider='apple' and i.provider_id=p_subject
    and i.created_at <= pg_catalog.to_timestamp(p_event_time)
    and coalesce(i.last_sign_in_at,i.created_at) <= pg_catalog.to_timestamp(p_event_time);
$$;
revoke all on function public.account_apple_notification_users(text,bigint) from public,anon,authenticated;
grant execute on function public.account_apple_notification_users(text,bigint) to service_role;
