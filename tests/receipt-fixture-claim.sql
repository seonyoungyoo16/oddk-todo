-- Caller opens a transaction and sets oddk.qa_receipt_setup from its ignored
-- fixture file. Return claims privately to that file, never to console/logs.
do $$
declare setup jsonb:=current_setting('oddk.qa_receipt_setup')::jsonb; qa_user uuid; qa_installation uuid;
  source jsonb; task jsonb; moment timestamptz:=date_trunc('minute',clock_timestamp())+interval '1 minute'; finish_time timestamptz;
  revision bigint; result jsonb; items jsonb;
begin
  qa_user:=(setup->>'userId')::uuid; qa_installation:=(setup->>'installationId')::uuid;
  select p.plan into source from public.account_plans p join auth.users u on u.id=p.user_id
  where p.user_id=qa_user and u.email like 'oddk-verification-%@example.invalid' and u.raw_app_meta_data->>'oddk_test_run' like 'oddk-verification-%'
    and p.plan->'goalTree'->>'goal'='Receipt QA';
  if source is null or jsonb_array_length(source->'tasks')<>1 or source->'tasks'->0->>'id'<>'receipt-task' then raise exception 'Expected isolated receipt fixture'; end if;
  if exists(select 1 from public.push_deliveries d join public.push_reminders r on r.id=d.reminder_id where r.user_id<>qa_user and d.status in ('pending','sending')) then raise exception 'Other pending deliveries exist'; end if;
  finish_time:=moment+interval '1 hour'; task:=source->'tasks'->0;
  task:=task||jsonb_build_object('plannedDate',to_char(moment at time zone 'Asia/Seoul','YYYY-MM-DD'),'startTime',to_char(moment at time zone 'Asia/Seoul','HH24:MI'),
    'endDate',to_char(finish_time at time zone 'Asia/Seoul','YYYY-MM-DD'),'endTime',to_char(finish_time at time zone 'Asia/Seoul','HH24:MI'),
    'endDayOffset',case when (moment at time zone 'Asia/Seoul')::date=(finish_time at time zone 'Asia/Seoul')::date then 0 else 1 end);
  update public.account_plans set plan=jsonb_set(source,'{tasks}',jsonb_build_array(task)),version=version+1,updated_at=clock_timestamp() where user_id=qa_user;
  select s.revision into revision from public.push_subscriptions s where s.installation_id=qa_installation and s.user_id=qa_user and s.binding_hash=setup->>'binding';
  if revision is null then raise exception 'Fixture device proof/owner changed'; end if;
  result:=public.push_device_register(qa_user,qa_installation,setup->>'binding',revision,'Receipt fixture',setup->'subscription'->>'endpoint',
    encode(extensions.digest(setup->'subscription'->>'endpoint','sha256'),'hex'),setup->'subscription'->'keys'->>'p256dh',setup->'subscription'->'keys'->>'auth');
  if result->>'ok'<>'true' then raise exception 'Fixture reconnect failed'; end if;
  update public.push_deliveries d set next_attempt_at=clock_timestamp()-interval '1 second' from public.push_reminders r
  where d.reminder_id=r.id and r.user_id=qa_user and d.status='pending';
  items:=public.push_delivery_claim(5);
  if jsonb_array_length(items)<>1 or items->0->>'userId'<>qa_user::text then raise exception 'Expected one private fixture claim'; end if;
  update public.push_deliveries set lease_until=clock_timestamp()+interval '2 minutes' where id=(items->0->>'id')::uuid;
  perform set_config('oddk.qa_receipt_claim',items::text,true);
end;
$$;
select current_setting('oddk.qa_receipt_claim')::jsonb as claims;
commit;
