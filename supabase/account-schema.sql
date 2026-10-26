create table public.account_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and octet_length(plan::text) < 1000000),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.account_plans enable row level security;
revoke all on public.account_plans from anon;
grant select, insert, update on public.account_plans to authenticated;
grant all on public.account_plans to service_role;
create policy "Read own plan" on public.account_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own plan" on public.account_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own plan" on public.account_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
