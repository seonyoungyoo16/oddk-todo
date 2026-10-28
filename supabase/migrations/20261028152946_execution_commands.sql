-- Service-only optimistic context and atomic actual-time commits.
-- Every path locks account_plans before execution_states.
create function public.execution_closed(p_data jsonb,p_now timestamptz,p_reason text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare cut_at timestamptz; cap_at timestamptz; result jsonb; segments jsonb;
begin
  if not public.execution_record_valid(p_data) or p_reason not in ('user','completed','removed','limit') then
    raise exception using errcode='22023',message='invalid execution close';
  end if;
  if p_data->'endedAt'<>'null'::jsonb then return p_data; end if;
  cap_at:=least(public.execution_time(p_data->>'startedAt')+interval '24 hours',public.execution_time('9999-12-31T23:59:59.999Z'));
  cut_at:=least(date_trunc('milliseconds',p_now),cap_at);
  select jsonb_agg(case when s->'end'='null'::jsonb then jsonb_set(s,'{end}',to_jsonb(public.execution_iso(cut_at))) else s end order by ordinal)
    into segments from jsonb_array_elements(p_data->'segments') with ordinality as item(s,ordinal);
  result:=p_data||jsonb_build_object('segments',segments,'endedAt',public.execution_iso(cut_at),
    'finishReason',case when cut_at=cap_at then 'limit' else p_reason end,'needsReview',cut_at=cap_at);
  if not public.execution_record_valid(result) then raise exception using errcode='22023',message='execution clock moved backwards'; end if;
  return result;
end $$;

create function public.execution_context(p_user uuid,p_target uuid default null,p_operation uuid default null) returns jsonb
language plpgsql set search_path='' as $$
declare plan_row public.account_plans%rowtype; state_row public.execution_states%rowtype;
  current_data jsonb; target_data jsonb; operation_data jsonb; server_now timestamptz;
begin
  select * into plan_row from public.account_plans where user_id=p_user for update;
  if not found then raise exception using errcode='P0002',message='execution plan missing'; end if;
  insert into public.execution_states(user_id) values(p_user) on conflict(user_id) do nothing;
  select * into state_row from public.execution_states where user_id=p_user for update;
  server_now:=date_trunc('milliseconds',clock_timestamp());
  select data into current_data from public.execution_records where user_id=p_user and id=state_row.active_id;
  if current_data is not null and server_now>=public.execution_time(current_data->>'startedAt')+interval '24 hours' then
    current_data:=public.execution_closed(current_data,server_now,'limit');
    update public.execution_records set data=current_data,updated_at=server_now where user_id=p_user and id=state_row.active_id;
    update public.execution_states set active_id=null,version=version+1,updated_at=server_now where user_id=p_user returning * into state_row;
    current_data:=null;
  end if;
  select data into target_data from public.execution_records where user_id=p_user and id=p_target;
  select jsonb_build_object('hash',request_hash,'version',applied_version) into operation_data
    from public.execution_operations where user_id=p_user and operation_id=p_operation;
  return jsonb_build_object('plan',plan_row.plan,'planVersion',plan_row.version,'revision',state_row.version,
    'current',current_data,'target',target_data,'now',public.execution_iso(server_now),'operation',operation_data);
end $$;

create function public.execution_commit(p_user uuid,p_operation uuid,p_hash text,p_kind text,p_revision bigint,
  p_plan_version bigint,p_records jsonb,p_active uuid) returns jsonb
language plpgsql set search_path='' as $$
declare plan_row public.account_plans%rowtype; state_row public.execution_states%rowtype; operation_row public.execution_operations%rowtype;
  changed jsonb; previous jsonb; source_task jsonb; changed_id uuid; server_now timestamptz; changed_count integer:=0;
  seen uuid[]:='{}'; old_active uuid; new_record boolean; output_state jsonb;
begin
  select * into plan_row from public.account_plans where user_id=p_user for update;
  if not found then raise exception using errcode='P0002',message='execution plan missing'; end if;
  insert into public.execution_states(user_id) values(p_user) on conflict(user_id) do nothing;
  select * into state_row from public.execution_states where user_id=p_user for update;
  -- A committed request remains replayable even after another device advanced state.
  select * into operation_row from public.execution_operations where user_id=p_user and operation_id=p_operation;
  if found then
    if operation_row.request_hash is distinct from p_hash or operation_row.kind is distinct from p_kind then
      raise exception using errcode='22023',message='execution operation reused';
    end if;
    select data into output_state from public.execution_records where user_id=p_user and id=state_row.active_id;
    return jsonb_build_object('revision',state_row.version,'current',output_state,'now',public.execution_iso(clock_timestamp()),'replayed',true);
  end if;
  if state_row.version is distinct from p_revision or plan_row.version is distinct from p_plan_version then
    raise exception using errcode='40001',message='execution state changed';
  end if;
  if p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_kind is null
    or p_kind not in ('start','switch','pause','resume','break','stop','manual','correct')
    or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>2 then
    raise exception using errcode='22023',message='invalid execution commit';
  end if;
  server_now:=date_trunc('milliseconds',clock_timestamp()); old_active:=state_row.active_id;
  for changed in select value from jsonb_array_elements(p_records) loop
    if not public.execution_record_valid(changed) then raise exception using errcode='22023',message='invalid execution record'; end if;
    changed_id:=(changed->>'id')::uuid;
    if changed_id=any(seen) then raise exception using errcode='22023',message='duplicate execution delta'; end if;
    seen:=array_append(seen,changed_id);
    select data into previous from public.execution_records where user_id=p_user and id=changed_id;
    new_record:=not found;
    if new_record then
      if changed_id<>p_operation or p_kind not in ('start','switch','manual') then
        raise exception using errcode='22023',message='unexpected execution create'; end if;
      if p_kind='manual' and (changed->>'finishReason' is distinct from 'manual' or changed->'endedAt'='null'::jsonb)
        or p_kind<>'manual' and (changed->'endedAt'<>'null'::jsonb or changed->'segments' is distinct from
          jsonb_build_array(jsonb_build_object('kind','work','start',changed->>'startedAt','end',null))) then
        raise exception using errcode='22023',message='unexpected execution initial phase'; end if;
      select value into source_task from jsonb_array_elements(plan_row.plan->'tasks') where value->>'id'=changed->>'taskId';
      if source_task is null or coalesce((source_task->>'summaryOnly')::boolean,false)
        or p_kind<>'manual' and (source_task->>'done')::boolean
        or changed->'title' is distinct from source_task->'title'
        or changed->'plannedDate' is distinct from coalesce(source_task->'plannedDate','null'::jsonb)
        or changed->'plannedTotalMinutes' is distinct from source_task->'minutes'
        or changed->'plannedWorkMinutes' is distinct from coalesce(to_jsonb((source_task->>'minutes')::integer-(source_task->>'bufferMinutes')::integer),'null'::jsonb)
      then raise exception using errcode='22023',message='execution snapshot changed'; end if;
    else
      if (changed - array['startedAt','endedAt','finishReason','needsReview','segments'])
        is distinct from (previous - array['startedAt','endedAt','finishReason','needsReview','segments']) then
        raise exception using errcode='22023',message='execution snapshot immutable'; end if;
      if p_kind='correct' then
        if previous->'endedAt'='null'::jsonb or changed->>'finishReason' is distinct from 'manual' or changed->'endedAt'='null'::jsonb then raise exception using errcode='22023',message='execution must be closed for correction'; end if;
      elsif changed_id is distinct from old_active or previous->'endedAt'<>'null'::jsonb
        or changed->'startedAt' is distinct from previous->'startedAt' then
        raise exception using errcode='22023',message='unexpected execution update';
      end if;
    end if;
    if public.execution_time(changed->>'startedAt')>server_now or public.execution_time(changed->>'endedAt')>server_now
      or exists(select 1 from jsonb_array_elements(changed->'segments') s where public.execution_time(s->>'start')>server_now or public.execution_time(s->>'end')>server_now) then
      raise exception using errcode='22023',message='execution future interval'; end if;
    if new_record then
      insert into public.execution_records(user_id,id,data,updated_at) values(p_user,changed_id,changed,server_now);
      changed_count:=changed_count+1;
    elsif changed is distinct from previous then
      update public.execution_records set data=changed,updated_at=server_now where user_id=p_user and id=changed_id;
      changed_count:=changed_count+1;
    end if;
  end loop;
  -- Include open work/break through its 24-hour cap. Paused gaps are not occupied.
  if exists(
    select 1 from public.execution_records a join public.execution_records b on b.user_id=a.user_id and a.id<b.id
    cross join lateral jsonb_array_elements(a.data->'segments') sa
    cross join lateral jsonb_array_elements(b.data->'segments') sb
    where a.user_id=p_user and (a.id=any(seen) or b.id=any(seen))
      and a.started_at<coalesce(b.ended_at,b.started_at+interval '24 hours')
      and b.started_at<coalesce(a.ended_at,a.started_at+interval '24 hours')
      and tstzrange(public.execution_time(sa->>'start'),coalesce(public.execution_time(sa->>'end'),a.started_at+interval '24 hours'),'[)')
       && tstzrange(public.execution_time(sb->>'start'),coalesce(public.execution_time(sb->>'end'),b.started_at+interval '24 hours'),'[)')
  ) then raise exception using errcode='23P01',message='execution intervals overlap'; end if;
  if p_active is distinct from (select id from public.execution_records where user_id=p_user and ended_at is null) then
    raise exception using errcode='22023',message='execution active mismatch'; end if;
  if changed_count>0 or p_active is distinct from old_active then
    update public.execution_states set active_id=p_active,version=version+1,updated_at=server_now where user_id=p_user returning * into state_row;
  end if;
  insert into public.execution_operations(user_id,operation_id,request_hash,kind,applied_version)
    values(p_user,p_operation,p_hash,p_kind,state_row.version);
  select data into output_state from public.execution_records where user_id=p_user and id=state_row.active_id;
  return jsonb_build_object('revision',state_row.version,'current',output_state,'now',public.execution_iso(server_now),'replayed',false);
end $$;

create function public.execution_plan_changed() returns trigger
language plpgsql set search_path='' as $$
declare state_row public.execution_states%rowtype; current_data jsonb; task_data jsonb; server_now timestamptz;
begin
  -- The triggering UPDATE/DELETE already owns the plan row lock.
  select * into state_row from public.execution_states where user_id=old.user_id for update;
  if not found or state_row.active_id is null then return null; end if;
  select data into current_data from public.execution_records where user_id=old.user_id and id=state_row.active_id;
  if tg_op='UPDATE' then
    select value into task_data from jsonb_array_elements(new.plan->'tasks') where value->>'id'=current_data->>'taskId';
  end if;
  if task_data is not null and not coalesce((task_data->>'done')::boolean,false) and not coalesce((task_data->>'summaryOnly')::boolean,false) then return null; end if;
  server_now:=date_trunc('milliseconds',clock_timestamp());
  current_data:=public.execution_closed(current_data,server_now,case when task_data is null then 'removed' else 'completed' end);
  update public.execution_records set data=current_data,updated_at=server_now where user_id=old.user_id and id=state_row.active_id;
  update public.execution_states set active_id=null,version=version+1,updated_at=server_now where user_id=old.user_id;
  return null;
end $$;
create trigger execution_plan_close after update of plan or delete on public.account_plans
for each row execute function public.execution_plan_changed();

create function public.execution_history(p_user uuid,p_from text,p_to text,p_limit integer,p_cursor_time text default null,p_cursor_id uuid default null) returns jsonb
language plpgsql stable set search_path='' as $$
declare from_at timestamptz; to_at timestamptz; server_now timestamptz:=date_trunc('milliseconds',statement_timestamp()); result jsonb; totals jsonb;
begin
  if not coalesce(public.execution_date(p_from),false) or not coalesce(public.execution_date(p_to),false)
    or p_to::date<p_from::date or p_to::date-p_from::date>=366 or p_limit is null or p_limit not between 1 and 100
    or (p_cursor_time is null)<>(p_cursor_id is null) or p_cursor_time is not null and public.execution_time(p_cursor_time) is null then
    raise exception using errcode='22023',message='invalid execution history range'; end if;
  from_at:=(p_from||'T00:00:00+09:00')::timestamptz;
  to_at:=(p_to||'T00:00:00+09:00')::timestamptz+interval '24 hours';
  select coalesce(jsonb_agg(data order by started_at desc,id desc),'[]'::jsonb) into result from (
    select data,started_at,id from public.execution_records where user_id=p_user and started_at<to_at
      and coalesce(ended_at,started_at+interval '24 hours')>=from_at
      and (p_cursor_time is null or (started_at,id)<(public.execution_time(p_cursor_time),p_cursor_id))
      order by started_at desc,id desc limit p_limit+1
  ) page;
  select jsonb_build_object('workMs',coalesce(sum(duration) filter(where kind='work'),0),'breakMs',coalesce(sum(duration) filter(where kind='break'),0)) into totals from (
    select s->>'kind' kind,greatest(0,extract(epoch from (
      least(coalesce(public.execution_time(s->>'end'),least(server_now,r.started_at+interval '24 hours')),to_at)
      -greatest(public.execution_time(s->>'start'),from_at)))*1000)::bigint duration
    from public.execution_records r cross join lateral jsonb_array_elements(r.data->'segments') s
    where r.user_id=p_user and r.started_at<to_at and coalesce(r.ended_at,r.started_at+interval '24 hours')>=from_at
  ) intervals;
  return jsonb_build_object('records',result,'totals',totals,'now',public.execution_iso(server_now));
end $$;

revoke all on function public.execution_closed(jsonb,timestamptz,text),public.execution_context(uuid,uuid,uuid),
  public.execution_commit(uuid,uuid,text,text,bigint,bigint,jsonb,uuid),public.execution_plan_changed(),
  public.execution_history(uuid,text,text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.execution_closed(jsonb,timestamptz,text),public.execution_context(uuid,uuid,uuid),
  public.execution_commit(uuid,uuid,text,text,bigint,bigint,jsonb,uuid),public.execution_plan_changed(),
  public.execution_history(uuid,text,text,integer,text,uuid) to service_role;
