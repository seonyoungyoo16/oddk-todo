-- Synthetic non-login users; all rows, queued reminders and auth users roll back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); manual_id uuid:=gen_random_uuid();
  ctx jsonb; result jsonb; initial_plan jsonb; saved_plan jsonb; old_data jsonb; new_data jsonb; manual_data jsonb; before_rows jsonb; rejected boolean; stamp text; from_day text;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at)
    select id,'authenticated','authenticated','oddk-execution-command-rollback-'||id||'@example.invalid','{"oddk_test_run":"execution-command-rollback"}',now(),now()
    from unnest(array[owner_id,other_id]) id;
  initial_plan:=jsonb_build_object('start','09:00','tasks',jsonb_build_array(
    jsonb_build_object('id','one','title','Synthetic one','minutes',30,'bufferMinutes',5,'plannedDate',null,'startTime',null,'done',false,'priority','normal'),
    jsonb_build_object('id','two','title','Synthetic two','minutes',null,'bufferMinutes',null,'plannedDate',null,'startTime',null,'done',false,'priority','normal')));
  insert into public.account_plans(user_id,plan) values(owner_id,initial_plan),(other_id,initial_plan);
  select to_jsonb(p) into saved_plan from public.account_plans p where user_id=owner_id;
  ctx:=public.execution_context(owner_id);
  if ctx->>'revision'<>'0' or ctx->'current'<>'null'::jsonb then raise exception 'Initial state'; end if;
  stamp:=ctx->>'now';
  old_data:=jsonb_build_object('schemaVersion',1,'id',first_id,'taskId','one','title','Synthetic one','plannedDate',null,
    'plannedWorkMinutes',25,'plannedTotalMinutes',30,'startedAt',stamp,'endedAt',null,'finishReason',null,'needsReview',false,
    'segments',jsonb_build_array(jsonb_build_object('kind','work','start',stamp,'end',null)));
  result:=public.execution_commit(owner_id,first_id,repeat('a',64),'start',0,(ctx->>'planVersion')::bigint,jsonb_build_array(old_data),first_id);
  if result->>'revision'<>'1' or result->'current' is distinct from old_data then raise exception 'Start commit'; end if;
  -- Replay precedes revision/plan-version validation and never adds another row.
  result:=public.execution_commit(owner_id,first_id,repeat('a',64),'start',0,-99,'[]',null);
  if result->>'replayed'<>'true' or result->>'revision'<>'1' then raise exception 'Lost response replay'; end if;
  rejected:=false;
  begin perform public.execution_commit(owner_id,first_id,repeat('b',64),'start',0,0,'[]',null);
  exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Operation hash reuse'; end if;
  rejected:=false;
  begin perform public.execution_commit(owner_id,gen_random_uuid(),repeat('c',64),'pause',0,0,'[]',first_id);
  exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected then raise exception 'Stale revision'; end if;
  ctx:=public.execution_context(owner_id,first_id);
  old_data:=ctx->'current';
  old_data:=jsonb_set(old_data,'{segments,0,end}',to_jsonb(ctx->>'now'));
  result:=public.execution_commit(owner_id,gen_random_uuid(),repeat('d',64),'pause',1,(ctx->>'planVersion')::bigint,jsonb_build_array(old_data),first_id);
  if result->>'revision'<>'2' then raise exception 'Pause'; end if;
  result:=public.execution_commit(owner_id,gen_random_uuid(),repeat('e',64),'pause',2,(ctx->>'planVersion')::bigint,'[]',first_id);
  if result->>'revision'<>'2' then raise exception 'No-op advanced revision'; end if;
  -- Both updates are one transaction; the old row remains closed history.
  ctx:=public.execution_context(owner_id);
  old_data:=public.execution_closed(ctx->'current',public.execution_time(ctx->>'now'),'user');
  stamp:=ctx->>'now';
  new_data:=jsonb_build_object('schemaVersion',1,'id',second_id,'taskId','two','title','Synthetic two','plannedDate',null,
    'plannedWorkMinutes',null,'plannedTotalMinutes',null,'startedAt',stamp,'endedAt',null,'finishReason',null,'needsReview',false,
    'segments',jsonb_build_array(jsonb_build_object('kind','work','start',stamp,'end',null)));
  result:=public.execution_commit(owner_id,second_id,repeat('f',64),'switch',2,(ctx->>'planVersion')::bigint,jsonb_build_array(old_data,new_data),second_id);
  if result->>'revision'<>'3' or (select ended_at is null from public.execution_records where user_id=owner_id and id=first_id) then raise exception 'Switch history'; end if;
  if saved_plan is distinct from (select to_jsonb(p) from public.account_plans p where user_id=owner_id) then raise exception 'Execution mutated plan'; end if;
  if (public.execution_context(other_id,second_id)->'target')<>'null'::jsonb then raise exception 'Foreign target leaked'; end if;
  -- Completing then undoing the task closes the timer once, with no auto-resume.
  update public.account_plans set plan=jsonb_set(plan,'{tasks,1,done}','true'),version=version+1 where user_id=owner_id;
  if (select active_id from public.execution_states where user_id=owner_id) is not null
    or (select data->>'finishReason' from public.execution_records where user_id=owner_id and id=second_id)<>'completed' then raise exception 'Completion did not close'; end if;
  update public.account_plans set plan=jsonb_set(plan,'{tasks,1,done}','false'),version=version+1 where user_id=owner_id;
  if (select active_id from public.execution_states where user_id=owner_id) is not null then raise exception 'Undo resumed timer'; end if;
  -- Closed manual history is independent of active state; intervals may touch but never overlap.
  ctx:=public.execution_context(owner_id);
  stamp:=public.execution_iso(public.execution_time(ctx->>'now')-interval '2 days');
  manual_data:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(new_data,'{id}',to_jsonb(manual_id::text)),'{startedAt}',to_jsonb(stamp)),'{endedAt}',to_jsonb(public.execution_iso(public.execution_time(stamp)+interval '10 minutes'))),'{finishReason}','"manual"');
  manual_data:=jsonb_set(manual_data,'{segments}',jsonb_build_array(jsonb_build_object('kind','work','start',stamp,'end',manual_data->>'endedAt')));
  result:=public.execution_commit(owner_id,manual_id,repeat('1',64),'manual',(ctx->>'revision')::bigint,(ctx->>'planVersion')::bigint,jsonb_build_array(manual_data),null);
  select jsonb_agg(data order by id) into before_rows from public.execution_records where user_id=owner_id;
  rejected:=false;
  begin
    new_data:=jsonb_set(manual_data,'{id}',to_jsonb(gen_random_uuid()::text));
    perform public.execution_commit(owner_id,(new_data->>'id')::uuid,repeat('2',64),'manual',(result->>'revision')::bigint,(ctx->>'planVersion')::bigint,jsonb_build_array(new_data),null);
  exception when exclusion_violation then rejected:=true; end;
  if not rejected then raise exception 'Cross-record overlap admitted'; end if;
  if before_rows is distinct from (select jsonb_agg(data order by id) from public.execution_records where user_id=owner_id) then raise exception 'Overlap partially committed'; end if;
  -- Existing immutable snapshot cannot be forged during correction.
  rejected:=false;
  begin
    perform public.execution_commit(owner_id,gen_random_uuid(),repeat('3',64),'correct',(result->>'revision')::bigint,(ctx->>'planVersion')::bigint,jsonb_build_array(jsonb_set(manual_data,'{title}','"Forged"')),null);
  exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Snapshot forged'; end if;
  from_day:=to_char(public.execution_time(stamp) at time zone 'Asia/Seoul','YYYY-MM-DD');
  result:=public.execution_history(owner_id,from_day,from_day,1);
  if result->'totals'->>'workMs'<>'600000' or result->'totals'->>'breakMs'<>'0' then raise exception 'History totals %',result; end if;
  if (public.execution_history(other_id,from_day,from_day,1)->'records')<>'[]'::jsonb then raise exception 'Foreign history'; end if;
  -- Force a synthetic abandoned open record, then verify status closes at the cap.
  ctx:=public.execution_context(owner_id);
  new_data:=jsonb_set(jsonb_set(manual_data,'{id}',to_jsonb(gen_random_uuid()::text)),'{startedAt}',to_jsonb(public.execution_iso(clock_timestamp()-interval '4 days')));
  new_data:=new_data||jsonb_build_object('endedAt',null,'finishReason',null,'segments',jsonb_build_array(jsonb_build_object('kind','work','start',new_data->>'startedAt','end',null)));
  insert into public.execution_records(user_id,id,data) values(owner_id,(new_data->>'id')::uuid,new_data);
  update public.execution_states set active_id=(new_data->>'id')::uuid where user_id=owner_id;
  result:=public.execution_context(owner_id);
  if result->'current'<>'null'::jsonb or (select data->>'finishReason' from public.execution_records where user_id=owner_id and id=(new_data->>'id')::uuid)<>'limit'
    or (select ended_at-started_at from public.execution_records where user_id=owner_id and id=(new_data->>'id')::uuid)<>interval '24 hours' then raise exception 'Abandoned cap'; end if;
  delete from auth.users where id in (owner_id,other_id);
end $$;
set constraints all immediate;
select 'PASS: start/replay/hash/CAS/no-op/switch/snapshot/plan invariant/owner isolation/completion undo/overlap rollback/history/24h/cascade' as result;
rollback;
