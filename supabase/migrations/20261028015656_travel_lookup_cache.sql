-- Public lookup data only. Browser roles cannot read or mutate the proxy cache.
create table public.travel_lookup_cache (
  cache_key text primary key check (cache_key ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('photon', 'osrm')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  fetched_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > fetched_at)
);
create index travel_lookup_cache_expiry on public.travel_lookup_cache(expires_at);
alter table public.travel_lookup_cache enable row level security;
revoke all on public.travel_lookup_cache from public, anon, authenticated;
grant select, insert, update, delete on public.travel_lookup_cache to service_role;

-- The one shared row per provider limits requests across every Edge instance.
create table public.travel_lookup_gate (
  provider text primary key check (provider in ('photon', 'osrm')),
  next_at timestamptz not null default '-infinity',
  lease_id uuid,
  budget_date date not null default current_date,
  used integer not null default 0 check (used between 0 and 200)
);
alter table public.travel_lookup_gate enable row level security;
revoke all on public.travel_lookup_gate from public, anon, authenticated;
grant select, update on public.travel_lookup_gate to service_role;
insert into public.travel_lookup_gate(provider) values ('photon'), ('osrm');

create function public.travel_claim_lookup(p_provider text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  claimed text;
  lease uuid := gen_random_uuid();
  moment timestamptz := clock_timestamp();
  korean_date date := (moment at time zone 'Asia/Seoul')::date;
begin
  update public.travel_lookup_gate
  set next_at = moment + interval '15 seconds',
      lease_id = lease,
      budget_date = korean_date,
      used = case when budget_date = korean_date then used + 1 else 1 end
  where provider = p_provider
    and next_at <= moment
    and (budget_date <> korean_date or used < 200)
  returning provider into claimed;
  return case when claimed is null then null else jsonb_build_object('id', lease, 'validUntil', moment + interval '2 seconds') end;
end;
$$;
revoke all on function public.travel_claim_lookup(text) from public, anon, authenticated;
grant execute on function public.travel_claim_lookup(text) to service_role;

-- Release only our lease; start the 1.2-second pause after the upstream call.
create function public.travel_finish_lookup(p_provider text, p_lease uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  update public.travel_lookup_gate
  set next_at = clock_timestamp() + interval '1.2 seconds', lease_id = null
  where provider = p_provider and lease_id = p_lease;
$$;
revoke all on function public.travel_finish_lookup(text, uuid) from public, anon, authenticated;
grant execute on function public.travel_finish_lookup(text, uuid) to service_role;
