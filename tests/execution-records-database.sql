-- New synthetic, non-login users only. The entire test transaction rolls back.
begin;
do $$
declare owners uuid[]:=array[gen_random_uuid(),gen_random_uuid()]; first_id uuid:=gen_random_uuid(); payload jsonb;
begin
  perform set_config('oddk.execution_owners',owners::text,true);
  perform set_config('oddk.execution_first',first_id::text,true);
  for i in 1..2 loop
    insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at)
      values(owners[i],'authenticated','authenticated','oddk-execution-rollback-'||owners[i]||'@example.invalid','{"oddk_test_run":"execution-records-rollback"}',now(),now());
    payload:=jsonb_build_object('schemaVersion',1,'id',first_id::text,'taskId','execution-fixture','title','Synthetic execution',
      'plannedDate','2026-10-29','plannedWorkMinutes',25,'plannedTotalMinutes',30,
      'startedAt','2026-10-29T00:00:00.000Z','endedAt',null,'finishReason',null,'needsReview',false,
      'segments',jsonb_build_array(jsonb_build_object('kind','work','start','2026-10-29T00:00:00.000Z','end',null)));
    if not public.execution_record_valid(payload) then raise exception 'Valid open shape rejected'; end if;
    insert into public.execution_states(user_id) values(owners[i]);
    insert into public.execution_records(user_id,id,data) values(owners[i],first_id,payload);
    update public.execution_states set active_id=first_id,version=1 where user_id=owners[i];
  end loop;
end $$;
set constraints all immediate;

set local role service_role;
do $$
declare owner_id uuid:=(current_setting('oddk.execution_owners')::uuid[])[1]; rejected boolean:=false;
begin
  update public.execution_records set data=jsonb_set(data,'{title}','"Synthetic service proof"'),updated_at=clock_timestamp() where user_id=owner_id;
  if not found then raise exception 'Service role could not update the record'; end if;
  begin
    update public.execution_records set id=id where user_id=owner_id;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Service could mutate the record key'; end if;
end $$;
reset role;
set local role authenticated;
do $$
declare rejected boolean:=false;
begin
  begin perform 1 from public.execution_records;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Authenticated direct read admitted'; end if;
end $$;
reset role;
set local role anon;
do $$
declare rejected boolean:=false;
begin
  begin perform public.execution_record_valid('{}'::jsonb);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Anonymous helper invocation admitted'; end if;
end $$;
reset role;

do $$
declare owners uuid[]:=current_setting('oddk.execution_owners')::uuid[]; first_id uuid:=current_setting('oddk.execution_first')::uuid;
  second_id uuid:=gen_random_uuid(); payload jsonb; before_data jsonb; rejected boolean; role_name text; object_name text;
begin
  select r.data into before_data from public.execution_records r where r.user_id=owners[1] and r.id=first_id;
  payload:=jsonb_set(before_data,'{id}',to_jsonb(second_id::text)); rejected:=false;
  begin
    insert into public.execution_records(user_id,id,data) values(owners[1],second_id,payload);
  exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'Second open record admitted'; end if;
  rejected:=false;
  begin
    update public.execution_states set active_id=null where user_id=owners[1];
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Orphaned active record admitted'; end if;
  payload:=jsonb_set(jsonb_set(jsonb_set(before_data,'{endedAt}','"2026-10-29T00:10:00.000Z"'),'{finishReason}','"user"'),'{segments,0,end}','"2026-10-29T00:10:00.000Z"');
  rejected:=false;
  begin
    update public.execution_records set data=payload where user_id=owners[1] and id=first_id;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Pointer to closed record admitted'; end if;
  if (select r.data from public.execution_records r where r.user_id=owners[1] and r.id=first_id) is distinct from before_data then raise exception 'Failed mutation changed record'; end if;
  rejected:=false;
  begin
    update public.execution_records set data=jsonb_set(before_data,'{segments,0,end}','"2026-10-28T23:59:00.000Z"') where user_id=owners[1] and id=first_id;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Negative interval admitted'; end if;
  foreach role_name in array array['anon','authenticated'] loop
    foreach object_name in array array['execution_records','execution_states','execution_operations'] loop
      if has_table_privilege(role_name,'public.'||object_name,'select,insert,update,delete') then raise exception 'Browser table privileges'; end if;
      if not (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=object_name) then raise exception 'Missing RLS'; end if;
    end loop;
    if has_function_privilege(role_name,'public.execution_record_valid(jsonb)','execute') then raise exception 'Public helper RPC execution'; end if;
  end loop;
  if has_column_privilege('service_role','public.execution_records','user_id','update') or has_column_privilege('service_role','public.execution_records','id','update')
    or has_column_privilege('service_role','public.execution_operations','request_hash','update') then raise exception 'Mutable owner/key/operation hash grant'; end if;
  if not has_column_privilege('service_role','public.execution_records','data','update') then raise exception 'Service data write missing'; end if;
end $$;

set constraints all deferred;
do $$
declare owners uuid[]:=current_setting('oddk.execution_owners')::uuid[]; first_id uuid:=current_setting('oddk.execution_first')::uuid; second_id uuid:=gen_random_uuid(); old_data jsonb; new_data jsonb;
begin
  perform set_config('oddk.execution_second',second_id::text,true);
  select r.data into old_data from public.execution_records r where r.user_id=owners[1] and r.id=first_id;
  new_data:=jsonb_set(jsonb_set(old_data,'{id}',to_jsonb(second_id::text)),'{startedAt}','"2026-10-29T00:10:00.000Z"');
  new_data:=jsonb_set(new_data,'{segments,0,start}','"2026-10-29T00:10:00.000Z"');
  old_data:=jsonb_set(jsonb_set(jsonb_set(old_data,'{endedAt}','"2026-10-29T00:10:00.000Z"'),'{finishReason}','"user"'),'{segments,0,end}','"2026-10-29T00:10:00.000Z"');
  update public.execution_records set data=old_data where user_id=owners[1] and id=first_id;
  insert into public.execution_records(user_id,id,data) values(owners[1],second_id,new_data);
  update public.execution_states set active_id=second_id,version=version+1 where user_id=owners[1];
end $$;
set constraints all immediate;
do $$
declare owners uuid[]:=current_setting('oddk.execution_owners')::uuid[]; second_id uuid:=current_setting('oddk.execution_second')::uuid; rejected boolean:=false;
begin
  begin
    update public.execution_states set active_id=second_id where user_id=owners[2];
  exception when foreign_key_violation or check_violation then rejected:=true; end;
  if not rejected then raise exception 'Cross-owner active pointer admitted'; end if;
  if (select count(*) from public.execution_records r where r.user_id=owners[1] and r.ended_at is null)<>1
    or (select count(*) from public.execution_records r where r.user_id=owners[1] and r.ended_at is not null)<>1 then raise exception 'Switch did not preserve old history'; end if;
  for i in 1..2 loop
    insert into public.execution_operations(user_id,operation_id,request_hash,kind,applied_version)
      values(owners[i],second_id,repeat('a',64),'start',1);
  end loop;
  rejected:=false;
  begin
    insert into public.execution_operations(user_id,operation_id,request_hash,kind,applied_version)
      values(owners[1],second_id,repeat('b',64),'start',2);
  exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'Duplicate operation admitted'; end if;
end $$;
set constraints all deferred;
do $$
declare owners uuid[]:=current_setting('oddk.execution_owners')::uuid[];
begin
  delete from auth.users where id=any(owners);
end $$;
set constraints all immediate;
select 'PASS: composite owner IDs, single open record, deferred pointer integrity, immutable failed writes, atomic switch/history, operation uniqueness, RLS/grants and account cleanup' as result;
rollback;
