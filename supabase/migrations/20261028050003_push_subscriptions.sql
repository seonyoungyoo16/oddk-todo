-- Server-owned Web Push device bindings. No browser table/RPC access.
create table public.push_settings (
  singleton boolean primary key default true check (singleton),
  public_key text check (public_key ~ '^[A-Za-z0-9_-]{87}$'),
  private_secret_id uuid,
  check ((public_key is null) = (private_secret_id is null))
);
insert into public.push_settings(singleton) values (true);
alter table public.push_settings enable row level security;
revoke all on public.push_settings from public, anon, authenticated;
grant select, update on public.push_settings to service_role;

create table public.push_subscriptions (
  installation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  binding_hash text not null check (binding_hash ~ '^[a-f0-9]{64}$'),
  revision bigint not null check (revision between 1 and 9007199254740990),
  label text not null check (length(label) between 1 and 60),
  enabled boolean not null default false,
  endpoint text check (length(endpoint) between 40 and 2048),
  endpoint_hash text unique check (endpoint_hash ~ '^[a-f0-9]{64}$'),
  p256dh text check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_key text check (auth_key ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((enabled and endpoint is not null and endpoint_hash is not null and p256dh is not null and auth_key is not null)
    or (not enabled and endpoint is null and endpoint_hash is null and p256dh is null and auth_key is null))
);
create index push_subscriptions_user on public.push_subscriptions(user_id);
create index push_subscriptions_active on public.push_subscriptions(user_id,installation_id) where enabled;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create function public.push_vapid_ensure(p_public text,p_private text)
returns text language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare current_key text; secret_id uuid;
begin
  if p_public is null or p_public !~ '^[A-Za-z0-9_-]{87}$' or p_private is null or p_private !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid VAPID keys'; end if;
  select public_key into current_key from public.push_settings where singleton for update;
  if current_key is not null then return current_key; end if;
  select vault.create_secret(p_private,'oddk_web_push_vapid','oddk Web Push signing key; server only') into secret_id;
  update public.push_settings set public_key=p_public,private_secret_id=secret_id where singleton;
  return p_public;
end;
$$;
revoke all on function public.push_vapid_ensure(text,text) from public,anon,authenticated;
grant execute on function public.push_vapid_ensure(text,text) to service_role;

-- Machine-only signing key access. The HTTP subscription API never calls this.
create function public.push_vapid_get()
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$
  select jsonb_build_object('publicKey',s.public_key,'privateKey',v.decrypted_secret)
  from public.push_settings s join vault.decrypted_secrets v on v.id=s.private_secret_id where s.singleton;
$$;
revoke all on function public.push_vapid_get() from public,anon,authenticated;
grant execute on function public.push_vapid_get() to service_role;

create function public.push_device_status(p_user uuid,p_installation uuid,p_binding text)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare device public.push_subscriptions;
begin
  select * into device from public.push_subscriptions where installation_id=p_installation;
  if not found then return jsonb_build_object('ok',true,'state',jsonb_build_object('revision',0,'enabled',false,'owned',false,'label',null)); end if;
  if device.binding_hash is distinct from p_binding then return '{"ok":false,"error":"binding"}'::jsonb; end if;
  return jsonb_build_object('ok',true,'state',jsonb_build_object('revision',device.revision,
    'enabled',device.enabled and device.user_id=p_user,'owned',device.user_id=p_user,
    'label',case when device.user_id=p_user then device.label else null end));
end;
$$;
revoke all on function public.push_device_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.push_device_status(uuid,uuid,text) to service_role;

create function public.push_device_register(p_user uuid,p_installation uuid,p_binding text,p_revision bigint,
  p_label text,p_endpoint text,p_endpoint_hash text,p_p256dh text,p_auth text)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, extensions
as $$
declare device public.push_subscriptions; exists_device boolean;
begin
  -- The short shared configuration-row lock serializes device mutations/caps.
  perform 1 from public.push_settings where singleton for update;
  if p_user is null or p_installation is null or p_binding is null or p_binding !~ '^[a-f0-9]{64}$'
    or p_revision is null or p_revision<0 or p_revision>=9007199254740990
    or p_label is null or length(trim(p_label)) not between 1 and 60
    or p_endpoint is null or p_endpoint_hash is distinct from encode(extensions.digest(p_endpoint,'sha256'),'hex')
    or length(p_endpoint) not between 40 and 2048 or p_p256dh is null or p_auth is null then raise exception 'Invalid push binding'; end if;
  -- Retain recent disabled tombstones so delayed registration cannot resurrect them.
  delete from public.push_subscriptions where user_id=p_user and not enabled and updated_at<clock_timestamp()-interval '30 days';
  select * into device from public.push_subscriptions where installation_id=p_installation;
  exists_device:=found;
  if exists_device and device.binding_hash<>p_binding then return '{"ok":false,"error":"binding"}'::jsonb; end if;
  if p_revision<>coalesce(device.revision,0) then return '{"ok":false,"error":"stale"}'::jsonb; end if;
  if exists(select 1 from public.push_subscriptions where endpoint_hash=p_endpoint_hash and installation_id<>p_installation) then return '{"ok":false,"error":"endpoint"}'::jsonb; end if;
  if (not exists_device or device.user_id<>p_user or not device.enabled) and
    (select count(*) from public.push_subscriptions where user_id=p_user and enabled)>=5 then return '{"ok":false,"error":"limit"}'::jsonb; end if;
  if (not exists_device or device.user_id<>p_user) and
    (select count(*) from public.push_subscriptions where user_id=p_user)>=20 then return '{"ok":false,"error":"history"}'::jsonb; end if;
  if exists_device and device.user_id=p_user and device.enabled and device.endpoint=p_endpoint
    and device.p256dh=p_p256dh and device.auth_key=p_auth and device.label=trim(p_label) then
    return public.push_device_status(p_user,p_installation,p_binding);
  end if;
  insert into public.push_subscriptions(installation_id,user_id,binding_hash,revision,label,enabled,endpoint,endpoint_hash,p256dh,auth_key)
  values(p_installation,p_user,p_binding,p_revision+1,trim(p_label),true,p_endpoint,p_endpoint_hash,p_p256dh,p_auth)
  on conflict(installation_id) do update set user_id=excluded.user_id,revision=excluded.revision,label=excluded.label,
    enabled=true,endpoint=excluded.endpoint,endpoint_hash=excluded.endpoint_hash,p256dh=excluded.p256dh,auth_key=excluded.auth_key,updated_at=clock_timestamp();
  return public.push_device_status(p_user,p_installation,p_binding);
end;
$$;
revoke all on function public.push_device_register(uuid,uuid,text,bigint,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.push_device_register(uuid,uuid,text,bigint,text,text,text,text,text) to service_role;

create function public.push_device_disable(p_user uuid,p_installation uuid,p_binding text,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare device public.push_subscriptions;
begin
  perform 1 from public.push_settings where singleton for update;
  if p_user is null or p_installation is null or p_binding is null or p_binding !~ '^[a-f0-9]{64}$'
    or p_revision is null or p_revision<0 or p_revision>=9007199254740990 then raise exception 'Invalid push binding'; end if;
  delete from public.push_subscriptions where user_id=p_user and not enabled and updated_at<clock_timestamp()-interval '30 days';
  select * into device from public.push_subscriptions where installation_id=p_installation;
  if found then
    if device.user_id<>p_user or device.binding_hash<>p_binding then return '{"ok":false,"error":"binding"}'::jsonb; end if;
    if device.revision<>p_revision then return '{"ok":false,"error":"stale"}'::jsonb; end if;
    if device.enabled then
      update public.push_subscriptions set enabled=false,endpoint=null,endpoint_hash=null,p256dh=null,auth_key=null,revision=revision+1,updated_at=clock_timestamp()
      where installation_id=p_installation;
    end if;
  else
    if p_revision<>0 then return '{"ok":false,"error":"stale"}'::jsonb; end if;
    if (select count(*) from public.push_subscriptions where user_id=p_user)>=20 then return '{"ok":false,"error":"history"}'::jsonb; end if;
    insert into public.push_subscriptions(installation_id,user_id,binding_hash,revision,label,enabled)
    values(p_installation,p_user,p_binding,1,'이 브라우저',false);
  end if;
  return public.push_device_status(p_user,p_installation,p_binding);
end;
$$;
revoke all on function public.push_device_disable(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.push_device_disable(uuid,uuid,text,bigint) to service_role;
