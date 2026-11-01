-- Auth's hard-delete cascades run as supabase_auth_admin, which intentionally
-- cannot query application execution tables. Trigger bodies are fixed to OLD's
-- account and cannot be invoked as RPCs. Avoid granting Auth broad table access.
alter function public.execution_plan_changed() security definer;
alter function public.execution_active_consistency() security definer;
-- Both existing functions already use an empty search_path and qualified tables.
revoke all on function public.execution_plan_changed(), public.execution_active_consistency() from public,anon,authenticated,service_role;
