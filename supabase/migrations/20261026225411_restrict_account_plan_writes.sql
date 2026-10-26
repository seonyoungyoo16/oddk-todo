-- Data writes must pass Edge validation and compare-and-swap.
-- Retain owner-only reads and the existing server service-role access.
revoke all on public.account_plans from public, anon, authenticated;
grant select on public.account_plans to authenticated;
grant all on public.account_plans to service_role;
drop policy if exists "Create own plan" on public.account_plans;
drop policy if exists "Update own plan" on public.account_plans;
