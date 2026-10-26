create table public.account_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) < 1000000),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.account_plans enable row level security;
revoke all on public.account_plans from public, anon, authenticated;
grant select on public.account_plans to authenticated;
grant all on public.account_plans to service_role;
create policy "Read own plan" on public.account_plans for select to authenticated using ((select auth.uid()) = user_id);
