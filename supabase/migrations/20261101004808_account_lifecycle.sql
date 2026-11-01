-- Service-only: browser clients cannot inspect deletion receipts or Apple tokens.
create table public.account_deletion_receipts (
  operation_hash text primary key check (operation_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index account_deletion_receipts_user_idx on public.account_deletion_receipts(user_id);
alter table public.account_deletion_receipts enable row level security;
revoke all on public.account_deletion_receipts from public, anon, authenticated;
grant all on public.account_deletion_receipts to service_role;

create table public.account_apple_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  secret_id uuid not null unique references vault.secrets(id),
  created_at timestamptz not null default now(),
  primary key (user_id, token_hash)
);
alter table public.account_apple_credentials enable row level security;
revoke all on public.account_apple_credentials from public, anon, authenticated;
grant all on public.account_apple_credentials to service_role;

create function public.account_apple_token_save(p_user uuid, p_token text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_hash text; v_secret uuid;
begin
  if length(p_token) < 16 or length(p_token) > 8192 then raise exception 'invalid token'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 219));
  v_hash := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');
  if exists(select 1 from public.account_apple_credentials where user_id=p_user and token_hash=v_hash) then return; end if;
  select vault.create_secret(p_token) into v_secret;
  insert into public.account_apple_credentials(user_id,token_hash,secret_id) values(p_user,v_hash,v_secret);
end; $$;
create function public.account_apple_tokens(p_user uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(v.decrypted_secret), '[]'::jsonb)
  from public.account_apple_credentials c join vault.decrypted_secrets v on v.id=c.secret_id where c.user_id=p_user;
$$;
-- Auth's cascade runs as supabase_auth_admin, which has no Vault DELETE grant.
-- This internal trigger can only remove the secret attached to the deleted row.
create function public.account_apple_secret_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin delete from vault.secrets where id=old.secret_id; return old; end; $$;
create trigger account_apple_secret_cleanup after delete on public.account_apple_credentials
for each row execute function public.account_apple_secret_cleanup();
revoke all on function public.account_apple_token_save(uuid,text), public.account_apple_tokens(uuid), public.account_apple_secret_cleanup() from public,anon,authenticated;
grant execute on function public.account_apple_token_save(uuid,text), public.account_apple_tokens(uuid) to service_role;

-- Receipts contain only a random request hash after deletion. Remove within 8 days.
select cron.schedule('account-deletion-receipts-cleanup', '17 3 * * *',
  $$delete from public.account_deletion_receipts where created_at < now() - interval '7 days'$$);
