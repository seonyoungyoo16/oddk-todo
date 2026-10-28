-- Run with a trusted admin AFTER maintenance-fixture.mjs prepare.
-- Set oddk.maintenance_fixture_user to that disposable fixture's UUID first.
-- Every temporary user, plan, claim and version edit rolls back together.
begin;
do $$
declare
  fixture uuid := current_setting('oddk.maintenance_fixture_user')::uuid;
  source jsonb; original_version bigint; lease jsonb; cursor_id uuid;
  token_hash text := repeat('a',64); result boolean; total integer; row_count integer;
  fresh_user uuid; candidate jsonb; current_version bigint;
begin
  select p.plan,p.version into source,original_version from public.account_plans p
  join auth.users u on u.id=p.user_id
  where p.user_id=fixture and u.email like 'oddk-verification-%@example.invalid'
    and u.raw_app_meta_data->>'oddk_test_run' like 'oddk-verification-%'
    and p.plan->'goalTree'->>'goal'='Maintenance QA';
  if source is null then raise exception 'Missing isolated maintenance fixture'; end if;
  -- Lock only this worker's state; never modify a real account.
  update public.task_maintenance_state set enabled=true, cursor_user_id=null,
    lease_id=null,lease_until='-infinity',ticket_hash=token_hash,ticket_until=clock_timestamp()+interval '2 minutes' where singleton;
  if public.task_maintenance_claim(repeat('b',64)) is not null then raise exception 'Wrong ticket accepted'; end if;
  lease:=public.task_maintenance_claim(token_hash);
  if lease is null or public.task_maintenance_claim(token_hash) is not null then raise exception 'Ticket replay'; end if;
  if public.task_maintenance_write(gen_random_uuid(),fixture,original_version,source) then raise exception 'Wrong lease accepted'; end if;
  if public.task_maintenance_write((lease->>'id')::uuid,fixture,original_version,jsonb_set(source,'{schemaVersion}','5')) then raise exception 'Schema downgrade'; end if;
  update public.account_plans set version=version+1 where user_id=fixture;
  candidate:=jsonb_set(source,'{maintenanceQa}','true');
  if public.task_maintenance_write((lease->>'id')::uuid,fixture,original_version,candidate) then raise exception 'Stale version overwrote plan'; end if;
  select version into current_version from public.account_plans where user_id=fixture and plan=source;
  if current_version<>original_version+1 then raise exception 'CAS changed source'; end if;
  if not public.task_maintenance_write((lease->>'id')::uuid,fixture,current_version,candidate) then raise exception 'Valid write refused'; end if;
  if not exists(select 1 from public.account_plans where user_id=fixture and plan=candidate and version=current_version+1) then raise exception 'Version/write mismatch'; end if;
  update public.task_maintenance_state set lease_until=clock_timestamp()-interval '1 second' where singleton;
  if public.task_maintenance_write((lease->>'id')::uuid,fixture,current_version+1,source) then raise exception 'Expired lease wrote'; end if;
  if public.task_maintenance_finish((lease->>'id')::uuid,null,'{}') then raise exception 'Expired finish accepted'; end if;
  update public.task_maintenance_state set lease_until=clock_timestamp()+interval '45 seconds' where singleton;

  -- Seven extra non-login test identities exist only in this rolled-back transaction.
  for i in 1..7 loop
    fresh_user:=gen_random_uuid();
    insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at)
      values(fresh_user,'authenticated','authenticated','oddk-maintenance-rollback-'||fresh_user||'@example.invalid','{"oddk_test_run":"maintenance-rollback"}',now(),now());
    insert into public.account_plans(user_id,plan) values(fresh_user,source);
  end loop;
  select count(*),max(user_id::text)::uuid into row_count,cursor_id from public.task_maintenance_batch((lease->>'id')::uuid);
  if row_count<>5 then raise exception 'Batch limit incorrect: %',row_count; end if;
  total:=row_count;
  if not public.task_maintenance_finish((lease->>'id')::uuid,cursor_id,'{}') then raise exception 'Finish failed'; end if;
  update public.task_maintenance_state set ticket_hash=token_hash,ticket_until=clock_timestamp()+interval '2 minutes' where singleton;
  lease:=public.task_maintenance_claim(token_hash);
  if lease->>'cursor'<>cursor_id::text then raise exception 'Cursor lost'; end if;
  select count(*),max(user_id::text)::uuid into row_count,cursor_id from public.task_maintenance_batch((lease->>'id')::uuid);
  total:=total+row_count;
  if row_count<>3 or total<>8 then raise exception 'Keyset pagination skipped/duplicated accounts: %',total; end if;
  if not public.task_maintenance_finish((lease->>'id')::uuid,cursor_id,'{}') then raise exception 'Finish2 failed'; end if;
  update public.task_maintenance_state set ticket_hash=token_hash,ticket_until=clock_timestamp()+interval '2 minutes' where singleton;
  lease:=public.task_maintenance_claim(token_hash);
  select count(*) into row_count from public.task_maintenance_batch((lease->>'id')::uuid);
  if row_count<>0 then raise exception 'End of scan not empty'; end if;
  if not public.task_maintenance_finish((lease->>'id')::uuid,null,'{}') then raise exception 'Reset failed'; end if;
  if (select cursor_user_id from public.task_maintenance_state where singleton) is not null then raise exception 'Cursor did not wrap'; end if;
  update public.task_maintenance_state set enabled=false,ticket_hash=token_hash,ticket_until=clock_timestamp()+interval '2 minutes' where singleton;
  if public.task_maintenance_claim(token_hash) is not null then raise exception 'Disabled scheduler claimed'; end if;
end;
$$;
rollback;
select 'PASS: single-use/expiry/disabled/lease/CAS/V6/5+3+0 keyset wrap; all test mutations rolled back' as result;
