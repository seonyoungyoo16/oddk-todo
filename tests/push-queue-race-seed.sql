-- Trusted admin only, while the sender has not been enabled. The initial empty
-- queue guard prevents consuming another plan's pending jobs during this test.
do $$
declare
  qa_user uuid:=gen_random_uuid(); moment timestamptz:=date_trunc('minute',clock_timestamp()); finish_time timestamptz;
  source jsonb; task jsonb; settings_key text; endpoint_value text; answer jsonb;
begin
  if exists(select 1 from public.push_deliveries where status in ('pending','sending')) then raise exception 'Use an isolated empty queue'; end if;
  if exists(select 1 from auth.users where raw_app_meta_data->>'oddk_test_run'='push-queue-race') then raise exception 'Clean prior race fixture first'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at)
    values(qa_user,'authenticated','authenticated','oddk-queue-race-'||qa_user||'@example.invalid','{"oddk_test_run":"push-queue-race"}',now(),now());
  finish_time:=moment+interval '1 hour';
  task:=jsonb_build_object('id','race-a','title','Synthetic queue race','notes','','done',false,'priority','normal','minutes',60,'bufferMinutes',10,
    'plannedDate',to_char(moment at time zone 'Asia/Seoul','YYYY-MM-DD'),'startTime',to_char(moment at time zone 'Asia/Seoul','HH24:MI'),
    'endDate',to_char(finish_time at time zone 'Asia/Seoul','YYYY-MM-DD'),'endTime',to_char(finish_time at time zone 'Asia/Seoul','HH24:MI'),
    'endDayOffset',case when (moment at time zone 'Asia/Seoul')::date=(finish_time at time zone 'Asia/Seoul')::date then 0 else 1 end,'reminderMinutes',0);
  source:=jsonb_build_object('schemaVersion',6,'tasks',jsonb_build_array(task,jsonb_set(task,'{id}','"race-b"')),'start','09:00','reviewsByDate','{}'::jsonb,'goalTree','{"goal":"Queue race","groups":[]}'::jsonb);
  insert into public.account_plans(user_id,plan) values(qa_user,source);
  select public_key into settings_key from public.push_settings where singleton;
  if settings_key is null then raise exception 'Initialize public VAPID first'; end if;
  for i in 1..5 loop
    endpoint_value:='https://fcm.googleapis.com/fcm/send/oddk-QA-race-'||gen_random_uuid();
    answer:=public.push_device_register(qa_user,gen_random_uuid(),repeat('c',64),0,'Synthetic race device',endpoint_value,encode(extensions.digest(endpoint_value,'sha256'),'hex'),settings_key,'AAAAAAAAAAAAAAAAAAAAAA');
    if answer->>'ok'<>'true' then raise exception 'Fixture subscription failed'; end if;
  end loop;
end;
$$;
select count(*) as pending_fixture_deliveries from public.push_deliveries d join public.push_reminders r on r.id=d.reminder_id join auth.users u on u.id=r.user_id where u.raw_app_meta_data->>'oddk_test_run'='push-queue-race' and d.status='pending';
