-- Account owners may inspect safe summaries and revoke lost devices via Edge.
-- No endpoint, encryption key, device proof or foreign-account label is returned.
create function public.push_device_list(p_user uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('installationId',installation_id,'revision',revision,
    'label',label,'enabled',enabled,'updatedAt',updated_at) order by updated_at desc,installation_id),'[]'::jsonb)
  from public.push_subscriptions where user_id=p_user;
$$;
revoke all on function public.push_device_list(uuid) from public,anon,authenticated;
grant execute on function public.push_device_list(uuid) to service_role;

create function public.push_device_revoke(p_user uuid,p_installation uuid,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare device public.push_subscriptions;
begin
  perform 1 from public.push_settings where singleton for update;
  select * into device from public.push_subscriptions where installation_id=p_installation and user_id=p_user;
  if not found or p_revision is null or device.revision<>p_revision then return '{"ok":false,"error":"stale"}'::jsonb; end if;
  if device.enabled then
    update public.push_subscriptions set enabled=false,endpoint=null,endpoint_hash=null,p256dh=null,auth_key=null,
      revision=revision+1,updated_at=clock_timestamp() where installation_id=p_installation and user_id=p_user;
  end if;
  return public.push_device_status(p_user,p_installation,device.binding_hash);
end;
$$;
revoke all on function public.push_device_revoke(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.push_device_revoke(uuid,uuid,bigint) to service_role;
