-- Transactional synthetic fixture: no real account is changed, no data persists.
-- Runs database constraints/triggers as the migration executor. Auth Admin HTTP
-- deletion still needs a disposable account and is a separate acceptance check.
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  installation uuid := gen_random_uuid(); reminder uuid := gen_random_uuid();
  v_secret uuid; subject text := 'synthetic-' || gen_random_uuid()::text;
  stamp text := public.execution_iso(clock_timestamp() - interval '1 minute');
  secret_count bigint; user_count bigint; hash text := encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
begin
  select count(*) into secret_count from vault.secrets;
  select count(*) into user_count from auth.users;
  assert not has_table_privilege('anon','public.account_deletion_receipts','SELECT');
  assert not has_table_privilege('authenticated','public.account_apple_credentials','SELECT');
  assert not has_function_privilege('authenticated','public.account_apple_tokens(uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.account_apple_notification_users(text,bigint)','EXECUTE');
  insert into auth.users(id,aud,role) values(a,'authenticated','authenticated'),(b,'authenticated','authenticated');
  insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,last_sign_in_at)
    values(gen_random_uuid(),a,subject,'apple',jsonb_build_object('sub',subject),now()-interval '10 minutes',now()-interval '1 minute');
  assert (select count(*)=0 from public.account_apple_notification_users(subject,extract(epoch from now()-interval '2 minutes')::bigint));
  assert (select count(*)=1 from public.account_apple_notification_users(subject,extract(epoch from now())::bigint));
  -- Apple timestamps have second precision; a login within that same second
  -- must not make a valid revocation disappear due to subsecond DB precision.
  assert (select count(*)=1 from public.account_apple_notification_users(subject,floor(extract(epoch from now()-interval '1 minute'))::bigint));
  insert into public.account_plans(user_id,plan) values(a,'{"tasks":[],"start":"09:00"}'),(b,'{"tasks":[],"start":"09:00"}');
  insert into public.execution_records(user_id,id,data) values(a,r,jsonb_build_object(
    'schemaVersion',1,'id',r::text,'taskId','synthetic','title','Synthetic deletion fixture','plannedDate',null,
    'plannedWorkMinutes',null,'plannedTotalMinutes',null,'startedAt',stamp,'endedAt',null,'finishReason',null,'needsReview',false,
    'segments',jsonb_build_array(jsonb_build_object('kind','work','start',stamp,'end',null))));
  insert into public.execution_states(user_id,active_id) values(a,r);
  insert into public.execution_operations(user_id,operation_id,request_hash,kind,applied_version) values(a,gen_random_uuid(),hash,'start',1);
  insert into public.push_subscriptions(installation_id,user_id,binding_hash,revision,label) values(installation,a,hash,1,'Synthetic');
  insert into public.push_reminders(id,user_id,task_id,event_key,start_at,due_at,expires_at,refresh_id)
    values(reminder,a,'synthetic',hash,now(),now(),now()+interval '1 hour',gen_random_uuid());
  insert into public.push_deliveries(reminder_id,installation_id,subscription_revision,next_attempt_at) values(reminder,installation,1,now());
  perform public.account_apple_token_save(a,'synthetic-refresh-token-not-a-real-credential');
  perform public.account_apple_token_save(a,'synthetic-refresh-token-not-a-real-credential');
  assert (select count(*)=1 from public.account_apple_credentials where user_id=a);
  assert jsonb_array_length(public.account_apple_tokens(a))=1;
  select secret_id into v_secret from public.account_apple_credentials where user_id=a;
  insert into public.account_deletion_receipts(operation_hash,user_id) values(hash,a);
  delete from auth.users where id=a;
  set constraints all immediate;
  assert not exists(select 1 from public.account_plans where user_id=a);
  assert not exists(select 1 from public.execution_records where user_id=a);
  assert not exists(select 1 from public.execution_states where user_id=a);
  assert not exists(select 1 from public.execution_operations where user_id=a);
  assert not exists(select 1 from public.push_subscriptions where user_id=a);
  assert not exists(select 1 from public.push_reminders where user_id=a);
  assert not exists(select 1 from public.push_deliveries where installation_id=installation);
  assert not exists(select 1 from public.account_apple_credentials where user_id=a);
  assert not exists(select 1 from vault.secrets where id=v_secret);
  assert exists(select 1 from public.account_deletion_receipts where operation_hash=hash and user_id is null);
  assert exists(select 1 from public.account_plans where user_id=b);
  assert (select count(*)=secret_count from vault.secrets);
  assert (select count(*)=user_count+1 from auth.users);
end $$;
rollback;
