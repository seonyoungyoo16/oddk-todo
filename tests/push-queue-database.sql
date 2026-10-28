-- Self-contained admin verification. Only synthetic, non-login users exist
-- inside this transaction; no receipt/proof, private key or push is output.
begin;
do $$
declare
  owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid(); installation uuid:=gen_random_uuid(); another_installation uuid:=gen_random_uuid();
  moment timestamptz:=date_trunc('minute',clock_timestamp()); end_moment timestamptz;
  task jsonb; task2 jsonb; task3 jsonb; source jsonb; changed jsonb; answer jsonb; claims jsonb; claim jsonb; newer jsonb;
  receipt_hash text; original_receipt_hash text; queued_id uuid; qa_reminder_id uuid; public_key text;
  binding text:=repeat('c',64); endpoint text:='https://fcm.googleapis.com/fcm/send/oddk-QA-queue-no-network';
  accepted boolean;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at)
    values(owner_a,'authenticated','authenticated','oddk-queue-'||owner_a||'@example.invalid','{"oddk_test_run":"push-queue-rollback"}',now(),now()),
          (owner_b,'authenticated','authenticated','oddk-queue-'||owner_b||'@example.invalid','{"oddk_test_run":"push-queue-rollback"}',now(),now());
  end_moment:=moment+interval '60 minutes';
  task:=jsonb_build_object('id','queue-task','title','Private first title','notes','Keep out of provider messages','done',false,'priority','normal','minutes',60,'bufferMinutes',10,
    'plannedDate',to_char(moment at time zone 'Asia/Seoul','YYYY-MM-DD'),'startTime',to_char(moment at time zone 'Asia/Seoul','HH24:MI'),
    'endDate',to_char(end_moment at time zone 'Asia/Seoul','YYYY-MM-DD'),'endTime',to_char(end_moment at time zone 'Asia/Seoul','HH24:MI'),
    'endDayOffset',case when (moment at time zone 'Asia/Seoul')::date=(end_moment at time zone 'Asia/Seoul')::date then 0 else 1 end,'reminderMinutes',0);
  source:=jsonb_build_object('schemaVersion',6,'tasks',jsonb_build_array(task),'start','09:00','reviewsByDate','{}'::jsonb,'goalTree','{"goal":"Queue QA","groups":[]}'::jsonb);
  if (select start_at from public.push_project_reminders(source))<>moment then raise exception 'Korean start projection mismatch'; end if;
  changed:=jsonb_set(jsonb_set(task,'{plannedDate}','"2026-10-29"'),'{startTime}','"00:00"');
  changed:=jsonb_set(changed,'{reminderMinutes}','60.0'); changed:=jsonb_set(changed,'{minutes}','60.0');
  if (select due_at from public.push_project_reminders(jsonb_set(source,'{tasks}',jsonb_build_array(changed)))) is distinct from '2026-10-28 14:00:00+00'::timestamptz then raise exception 'Korean midnight/decimal integer projection'; end if;
  changed:=jsonb_set(task,'{plannedDate}','"2026-02-30"');
  if exists(select 1 from public.push_project_reminders(jsonb_set(source,'{tasks}',jsonb_build_array(changed)))) then raise exception 'Malformed date projected'; end if;
  insert into public.account_plans(user_id,plan) values(owner_a,source),(owner_b,jsonb_set(source,'{tasks}','[]'));
  select id into qa_reminder_id from public.push_reminders where user_id=owner_a;
  if qa_reminder_id is null then raise exception 'Plan trigger failed'; end if;
  select s.public_key into public_key from public.push_settings s where singleton;
  if public_key is null then raise exception 'Initialize VAPID public config first'; end if;
  answer:=public.push_device_register(owner_a,installation,binding,0,'Queue device',endpoint,encode(extensions.digest(endpoint,'sha256'),'hex'),public_key,'AAAAAAAAAAAAAAAAAAAAAA');
  if answer->>'ok'<>'true' or (select count(*) from public.push_deliveries d where d.reminder_id=qa_reminder_id)<>1 then raise exception 'Subscription did not seed'; end if;
  changed:=jsonb_set(source,'{tasks,0,title}','"Latest title"');
  update public.account_plans set plan=changed,version=version+1 where user_id=owner_a;
  perform set_config('TimeZone','Asia/Seoul',true); perform public.push_sync_reminders(owner_a,changed); perform set_config('TimeZone','UTC',true);
  if (select count(*) from public.push_reminders where user_id=owner_a)<>1 or (select count(*) from public.push_deliveries d where d.reminder_id=qa_reminder_id)<>1 then raise exception 'No-op/timezone duplicate'; end if;
  accepted:=false; begin perform public.push_delivery_claim(6); accepted:=true; exception when raise_exception then null; end;
  if accepted then raise exception 'Unbounded claim accepted'; end if;
  claims:=public.push_delivery_claim(5); if jsonb_array_length(claims)<>1 then raise exception 'Claim size'; end if;
  claim:=claims->0; queued_id:=(claim->>'id')::uuid;
  original_receipt_hash:=encode(extensions.digest(claim->>'receiptToken','sha256'),'hex');
  if jsonb_array_length(public.push_delivery_claim(5))<>0 then raise exception 'Lease double claim'; end if;
  if public.push_delivery_current(queued_id,gen_random_uuid()) is not null then raise exception 'Wrong lease read'; end if;
  if public.push_delivery_current(queued_id,(claim->>'lease')::uuid)->'plan'->'tasks'->0->>'title'<>'Latest title' then raise exception 'Stale plan snapshot'; end if;
  if public.push_delivery_receipt(queued_id,repeat('a',64),binding,'check') is not null or public.push_delivery_receipt(queued_id,original_receipt_hash,repeat('b',64),'check') is not null then raise exception 'Wrong receipt/proof accepted'; end if;
  if public.push_delivery_receipt(queued_id,original_receipt_hash,binding,'check') is null then raise exception 'Valid receipt refused'; end if;
  update public.account_plans set plan=jsonb_set(changed,'{tasks,0,done}','true') where user_id=owner_a;
  if public.push_delivery_current(queued_id,(claim->>'lease')::uuid) is not null or public.push_delivery_receipt(queued_id,original_receipt_hash,binding,'check') is not null then raise exception 'Completed task still readable'; end if;
  if public.push_delivery_finish(queued_id,(claim->>'lease')::uuid,'sent') then raise exception 'Cancelled lease finished'; end if;
  update public.account_plans set plan=changed where user_id=owner_a;
  newer:=public.push_delivery_claim(5)->0;
  if newer is null or newer->>'id'<>claim->>'id' or newer->>'receiptToken'=claim->>'receiptToken' then raise exception 'Undo did not safely rearm'; end if;
  if public.push_delivery_receipt(queued_id,original_receipt_hash,binding,'check') is not null then raise exception 'Old receipt resurrected'; end if;
  receipt_hash:=encode(extensions.digest(newer->>'receiptToken','sha256'),'hex');
  if not public.push_delivery_finish(queued_id,(newer->>'lease')::uuid,'retry',5) then raise exception 'Retry failed'; end if;
  if jsonb_array_length(public.push_delivery_claim(5))<>0 then raise exception 'Backoff ignored'; end if;
  if public.push_delivery_receipt(queued_id,receipt_hash,binding,'check') is null then raise exception 'Uncertain accepted push cannot validate during backoff'; end if;
  if public.push_delivery_receipt(queued_id,receipt_hash,binding,'ack') is null then raise exception 'Display acknowledgement failed'; end if;
  if public.push_delivery_receipt(queued_id,receipt_hash,binding,'check')->>'displayed'<>'true' then raise exception 'Repeated presentation not identified'; end if;
  if not public.push_delivery_finish(queued_id,(newer->>'lease')::uuid,'sent') or jsonb_array_length(public.push_delivery_claim(5))<>0 then raise exception 'Acknowledgement caused retry'; end if;

  task2:=jsonb_set(task,'{id}','"queue-task-2"');
  update public.account_plans set plan=jsonb_set(changed,'{tasks}',jsonb_build_array(task,task2)) where user_id=owner_a;
  claim:=public.push_delivery_claim(5)->0;
  if claim->>'taskId'<>'queue-task-2' then raise exception 'Acknowledged task duplicated'; end if;
  answer:=public.push_device_register(owner_b,installation,binding,1,'New owner',endpoint,encode(extensions.digest(endpoint,'sha256'),'hex'),public_key,'AAAAAAAAAAAAAAAAAAAAAA');
  if answer->'state'->>'revision'<>'2' then raise exception 'Ownership transfer'; end if;
  if public.push_delivery_current((claim->>'id')::uuid,(claim->>'lease')::uuid) is not null then raise exception 'Former account delivery readable'; end if;
  if public.push_delivery_finish((claim->>'id')::uuid,(claim->>'lease')::uuid,'gone') then raise exception 'Old gone result disabled new owner'; end if;
  if not exists(select 1 from public.push_subscriptions where installation_id=installation and user_id=owner_b and enabled and revision=2) then raise exception 'New owner changed'; end if;
  answer:=public.push_device_register(owner_a,installation,binding,2,'Restored owner',endpoint,encode(extensions.digest(endpoint,'sha256'),'hex'),public_key,'AAAAAAAAAAAAAAAAAAAAAA');
  claims:=public.push_delivery_claim(5);
  if jsonb_array_length(claims)<>1 or claims->0->>'taskId'<>'queue-task-2' then raise exception 'Rebind duplicated displayed task'; end if;
  claim:=claims->0;
  if not public.push_delivery_finish((claim->>'id')::uuid,(claim->>'lease')::uuid,'retry',5) then raise exception 'Retry setup'; end if;
  for i in 2..4 loop
    update public.push_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id=(claim->>'id')::uuid;
    newer:=public.push_delivery_claim(5)->0;
    if newer is null or public.push_delivery_finish((claim->>'id')::uuid,(claim->>'lease')::uuid,'sent') then raise exception 'Stale lease accepted'; end if;
    if not public.push_delivery_finish((newer->>'id')::uuid,(newer->>'lease')::uuid,'retry',5) then raise exception 'Retry transition'; end if;
    claim:=newer;
  end loop;
  if (select status from public.push_deliveries where id=(claim->>'id')::uuid)<>'failed' or jsonb_array_length(public.push_delivery_claim(5))<>0 then raise exception 'Attempt cap ignored'; end if;
  task3:=jsonb_set(task,'{id}','"queue-task-3"');
  update public.account_plans set plan=jsonb_set(changed,'{tasks}',jsonb_build_array(task3)) where user_id=owner_a;
  claim:=public.push_delivery_claim(5)->0;
  if claim is null or not public.push_delivery_finish((claim->>'id')::uuid,(claim->>'lease')::uuid,'gone') then raise exception 'Expired subscription handling'; end if;
  if exists(select 1 from public.push_subscriptions s where s.installation_id=installation and (s.enabled or s.endpoint is not null or s.p256dh is not null or s.auth_key is not null)) then raise exception 'Gone did not clear subscription'; end if;
  answer:=public.push_device_register(owner_a,another_installation,binding,0,'Expiry test',endpoint,encode(extensions.digest(endpoint,'sha256'),'hex'),public_key,'AAAAAAAAAAAAAAAAAAAAAA');
  update public.account_plans set plan=jsonb_set(changed,'{tasks}','[]') where user_id=owner_a;
  if jsonb_array_length(public.push_delivery_claim(5))<>0 then raise exception 'Deleted task claimed'; end if;
  update public.account_plans set plan=jsonb_set(changed,'{tasks}',jsonb_build_array(task3)) where user_id=owner_a;
  update public.push_reminders set due_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '1 second' where user_id=owner_a and task_id='queue-task-3';
  if jsonb_array_length(public.push_delivery_claim(5))<>0 then raise exception 'Expired job claimed'; end if;
  if exists(select 1 from public.push_deliveries d join public.push_reminders r on r.id=d.reminder_id where r.user_id=owner_a and r.task_id='queue-task-3' and d.status in ('pending','sending')) then raise exception 'Expired job not closed'; end if;
  delete from auth.users where id=owner_a;
  if exists(select 1 from public.push_reminders where user_id=owner_a) or exists(select 1 from public.push_subscriptions where user_id=owner_a) then raise exception 'User cascade incomplete'; end if;
end;
$$;
rollback;
select 'PASS: projection/KST/timezone/no-op; atomic claim/lease; latest plan/proof; complete/delete/undo cancellation; backoff/ack/dedupe; ownership/revision; retry cap/gone/expiry; cascade; full rollback; no network' as result;
