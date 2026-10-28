-- Use only after push-queue-race-seed.sql, before the real sender is enabled.
-- Two pg_cron sessions hold their five claims for six seconds. Safe metadata
-- is stored on the one synthetic fixture identity. Each job removes itself.
do $$
declare fixture record; task jsonb; moment timestamptz:=date_trunc('minute',clock_timestamp())+interval '1 minute'; finish_time timestamptz;
begin
  if (select count(*) from auth.users where raw_app_meta_data->>'oddk_test_run'='push-queue-race')<>1 then raise exception 'Expected one synthetic race fixture'; end if;
  if exists(select 1 from cron.job where jobname in ('oddk-qa-push-first','oddk-qa-push-second')) then raise exception 'Prior race jobs remain'; end if;
  select p.user_id,p.plan into fixture from public.account_plans p join auth.users u on u.id=p.user_id where u.raw_app_meta_data->>'oddk_test_run'='push-queue-race';
  finish_time:=moment+interval '1 hour'; task:=fixture.plan->'tasks'->0;
  task:=task||jsonb_build_object('plannedDate',to_char(moment at time zone 'Asia/Seoul','YYYY-MM-DD'),'startTime',to_char(moment at time zone 'Asia/Seoul','HH24:MI'),
    'endDate',to_char(finish_time at time zone 'Asia/Seoul','YYYY-MM-DD'),'endTime',to_char(finish_time at time zone 'Asia/Seoul','HH24:MI'),
    'endDayOffset',case when (moment at time zone 'Asia/Seoul')::date=(finish_time at time zone 'Asia/Seoul')::date then 0 else 1 end);
  update public.account_plans set plan=jsonb_set(fixture.plan,'{tasks}',jsonb_build_array(task,jsonb_set(task,'{id}','"race-b"'))) where user_id=fixture.user_id;
end;
$$;
select cron.schedule('oddk-qa-push-first','* * * * *',$command$
do $job$
declare started timestamptz:=clock_timestamp(); claimed_at timestamptz; items jsonb;
begin
  items:=public.push_delivery_claim(5); claimed_at:=clock_timestamp();
  perform pg_sleep(6);
  update auth.users set raw_app_meta_data=raw_app_meta_data||jsonb_build_object('queueRaceFirst',jsonb_build_object('started',started,'claimed',claimed_at,'finished',clock_timestamp(),'ids',(select jsonb_agg(value->>'id') from jsonb_array_elements(items))))
  where raw_app_meta_data->>'oddk_test_run'='push-queue-race';
  perform cron.unschedule('oddk-qa-push-first');
end;
$job$;
$command$) as first_job;
select cron.schedule('oddk-qa-push-second','* * * * *',$command$
do $job$
declare started timestamptz:=clock_timestamp(); claimed_at timestamptz; items jsonb;
begin
  items:=public.push_delivery_claim(5); claimed_at:=clock_timestamp();
  perform pg_sleep(6);
  update auth.users set raw_app_meta_data=raw_app_meta_data||jsonb_build_object('queueRaceSecond',jsonb_build_object('started',started,'claimed',claimed_at,'finished',clock_timestamp(),'ids',(select jsonb_agg(value->>'id') from jsonb_array_elements(items))))
  where raw_app_meta_data->>'oddk_test_run'='push-queue-race';
  perform cron.unschedule('oddk-qa-push-second');
end;
$job$;
$command$) as second_job;
