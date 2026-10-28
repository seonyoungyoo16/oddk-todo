-- Synthetic non-login accounts only; every effect rolls back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); qa_record uuid:=gen_random_uuid();
  original jsonb:='{"schemaVersion":5,"goalTree":{"goal":"","groups":[]},"tasks":[],"start":"09:00","reviewsByDate":{}}';
  candidate jsonb; result jsonb; before_row jsonb; rejected boolean; today text:=to_char(clock_timestamp() at time zone 'Asia/Seoul','YYYY-MM-DD'); stamp text; record_data jsonb;
begin
  perform set_config('oddk.replan_owners',array[owner_id,other_id]::text,true);
  insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at)
    select id,'authenticated','authenticated','oddk-replan-rollback-'||id||'@example.invalid','{"oddk_test_run":"replan-rollback"}',now(),now() from unnest(array[owner_id,other_id]) id;
  insert into public.account_plans(user_id,plan) values(owner_id,original),(other_id,original);
  candidate:=original||'{"review":"Synthetic transaction proof"}'::jsonb;
  select to_jsonb(p) into before_row from public.account_plans p where user_id=owner_id;
  rejected:=false;
  begin perform public.replan_checked_commit(owner_id,0,0,today,null,candidate);
  exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected then raise exception 'Stale plan accepted'; end if;
  rejected:=false;
  begin perform public.replan_checked_commit(owner_id,1,1,today,null,candidate);
  exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected then raise exception 'Stale actual state accepted'; end if;
  rejected:=false;
  begin perform public.replan_checked_commit(owner_id,1,0,today,clock_timestamp()-interval '1 second',candidate);
  exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected then raise exception 'Expired start accepted'; end if;
  rejected:=false;
  begin perform public.replan_checked_commit(owner_id,1,0,to_char(current_date-2,'YYYY-MM-DD'),null,candidate);
  exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected then raise exception 'Wrong day accepted'; end if;
  if before_row is distinct from (select to_jsonb(p) from public.account_plans p where user_id=owner_id)
    or exists(select 1 from public.execution_states where user_id=owner_id) then raise exception 'Rejected commit changed plan or state'; end if;
  result:=public.replan_checked_commit(owner_id,1,0,today,null,candidate);
  if result->>'version'<>'2' or result->'plan' is distinct from candidate then raise exception 'Checked write failed'; end if;
  if (select plan from public.account_plans where user_id=other_id) is distinct from original then raise exception 'Other owner changed'; end if;
  select to_jsonb(p) into before_row from public.account_plans p where user_id=owner_id;
  result:=public.replan_checked_commit(owner_id,2,0,today,null,candidate);
  if result->>'version'<>'2' or before_row is distinct from (select to_jsonb(p) from public.account_plans p where user_id=owner_id) then raise exception 'No-op changed version/timestamp'; end if;
  stamp:=public.execution_iso(date_trunc('milliseconds',clock_timestamp()));
  record_data:=jsonb_build_object('schemaVersion',1,'id',qa_record,'taskId','synthetic','title','Synthetic timer','plannedDate',null,'plannedWorkMinutes',null,'plannedTotalMinutes',null,
    'startedAt',stamp,'endedAt',null,'finishReason',null,'needsReview',false,'segments',jsonb_build_array(jsonb_build_object('kind','work','start',stamp,'end',null)));
  insert into public.execution_records(user_id,id,data) values(owner_id,qa_record,record_data);
  update public.execution_states set active_id=qa_record,version=1 where user_id=owner_id;
  rejected:=false;
  begin perform public.replan_checked_commit(owner_id,2,1,today,null,original);
  exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected or before_row is distinct from (select to_jsonb(p) from public.account_plans p where user_id=owner_id)
    or (select data from public.execution_records where user_id=owner_id and id=qa_record) is distinct from record_data then raise exception 'Active timer not protected'; end if;
  if has_function_privilege('anon','public.replan_checked_commit(uuid,bigint,bigint,text,timestamptz,jsonb)','execute')
    or has_function_privilege('authenticated','public.replan_checked_commit(uuid,bigint,bigint,text,timestamptz,jsonb)','execute') then raise exception 'Public replan RPC'; end if;
end $$;
set local role authenticated;
do $$
declare rejected boolean:=false;
begin
  begin perform public.replan_checked_commit(null,1,0,'2026-10-29',null,'{}');
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Authenticated direct RPC allowed'; end if;
end $$;
reset role;
do $$
begin delete from auth.users where id=any(current_setting('oddk.replan_owners')::uuid[]); end $$;
set constraints all immediate;
select 'PASS: plan/actual CAS, expired/day-change rollback, atomic plan write, no-op timestamp, owner isolation, active timer preservation, RPC denial and cascade' as result;
rollback;
