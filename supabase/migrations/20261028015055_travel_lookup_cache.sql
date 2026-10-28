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
  budget_date date not null default current_date,
  used integer not null default 0 check (used between 0 and 200)
);
alter table public.travel_lookup_gate enable row level security;
revoke all on public.travel_lookup_gate from public, anon, authenticated;
grant select, update on public.travel_lookup_gate to service_role;
insert into public.travel_lookup_gate(provider) values ('photon'), ('osrm');

create function public.travel_claim_lookup(p_provider text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  claimed text;
  moment timestamptz := clock_timestamp();
  korean_date date := (moment at time zone 'Asia/Seoul')::date;
begin
  update public.travel_lookup_gate
  set next_at = moment + interval '1.2 seconds',
      budget_date = korean_date,
      used = case when budget_date = korean_date then used + 1 else 1 end
  where provider = p_provider
    and next_at <= moment
    and (budget_date <> korean_date or used < 200)
  returning provider into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.travel_claim_lookup(text) from public, anon, authenticated;
grant execute on function public.travel_claim_lookup(text) to service_role;
