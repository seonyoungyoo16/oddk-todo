-- Replanning guards both plan and actual-time state under the same lock order.
create function public.replan_checked_commit(p_user uuid,p_plan_version bigint,p_execution_version bigint,
  p_date text,p_first_start timestamptz,p_plan jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare source public.account_plans%rowtype; actual public.execution_states%rowtype; server_now timestamptz;
begin
  select * into source from public.account_plans where user_id=p_user for update;
  if not found then raise exception using errcode='P0002',message='replan plan missing'; end if;
  insert into public.execution_states(user_id) values(p_user) on conflict(user_id) do nothing;
  select * into actual from public.execution_states where user_id=p_user for update;
  if source.version is distinct from p_plan_version or actual.version is distinct from p_execution_version or actual.active_id is not null then
    raise exception using errcode='PT409',message='replan plan or actual state changed'; end if;
  server_now:=clock_timestamp();
  if p_date is distinct from to_char(server_now at time zone 'Asia/Seoul','YYYY-MM-DD')
    or p_first_start is not null and (p_first_start<server_now
      or p_first_start<(p_date||'T00:00:00+09:00')::timestamptz
      or p_first_start>=(p_date||'T00:00:00+09:00')::timestamptz+interval '24 hours') then
    raise exception using errcode='PT409',message='replan preview expired'; end if;
  if jsonb_typeof(p_plan) is distinct from 'object' then raise exception using errcode='22023',message='invalid replan plan'; end if;
  if source.plan is distinct from p_plan then
    update public.account_plans set plan=p_plan,version=version+1,updated_at=server_now where user_id=p_user returning * into source;
  end if;
  return jsonb_build_object('plan',source.plan,'version',source.version,'updated_at',source.updated_at);
end $$;
revoke all on function public.replan_checked_commit(uuid,bigint,bigint,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.replan_checked_commit(uuid,bigint,bigint,text,timestamptz,jsonb) to service_role;
