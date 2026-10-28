-- Admin-only, after public VAPID configuration has been initialized.
-- Self-contained, non-login synthetic identities; all changes roll back.
begin;
do $$
declare
  qa_owners uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  old_device uuid; foreign_device uuid:=gen_random_uuid(); fresh_device uuid:=gen_random_uuid();
  answer jsonb; qa_endpoint text:='https://fcm.googleapis.com/fcm/send/oddk-QA-database-rollback';
  qa_public_key text;
begin
  for i in 1..2 loop
    insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at)
      values(qa_owners[i],'authenticated','authenticated','oddk-push-rollback-'||qa_owners[i]||'@example.invalid','{"oddk_test_run":"push-rollback"}',now(),now());
  end loop;
  for i in 1..20 loop
    insert into public.push_subscriptions(installation_id,user_id,binding_hash,revision,label,enabled)
      values(gen_random_uuid(),qa_owners[1],repeat('a',64),1,'Recent disabled',false);
  end loop;
  select installation_id into old_device from public.push_subscriptions where user_id=qa_owners[1] limit 1;
  update public.push_subscriptions set updated_at=clock_timestamp()-interval '31 days' where installation_id=old_device;
  insert into public.push_subscriptions(installation_id,user_id,binding_hash,revision,label,enabled,updated_at)
    values(foreign_device,qa_owners[2],repeat('b',64),1,'Other owner',false,clock_timestamp()-interval '31 days');
  select s.public_key into qa_public_key from public.push_settings s where singleton;
  if qa_public_key is null then raise exception 'Initialize VAPID public configuration first'; end if;
  answer:=public.push_device_register(qa_owners[1],fresh_device,repeat('c',64),0,'Fresh',qa_endpoint,
    encode(extensions.digest(qa_endpoint,'sha256'),'hex'),qa_public_key,'AAAAAAAAAAAAAAAAAAAAAA');
  if answer->>'ok'<>'true' then raise exception 'Expired history did not release a slot'; end if;
  if exists(select 1 from public.push_subscriptions where installation_id=old_device) then raise exception 'Expired history kept'; end if;
  if not exists(select 1 from public.push_subscriptions where installation_id=foreign_device and user_id=qa_owners[2]) then raise exception 'Another owner history deleted'; end if;
  if (select count(*) from public.push_subscriptions where user_id=qa_owners[1])<>20 then raise exception 'Recent history not preserved'; end if;
  answer:=public.push_device_revoke(qa_owners[2],fresh_device,1);
  if answer->>'ok'<>'false' then raise exception 'Foreign owner revoked'; end if;
  if not exists(select 1 from public.push_subscriptions where installation_id=fresh_device and enabled) then raise exception 'Foreign revoke changed row'; end if;
  answer:=public.push_device_revoke(qa_owners[1],fresh_device,1);
  if answer->>'ok'<>'true' or answer->'state'->>'revision'<>'2' then raise exception 'Owner revoke failed'; end if;
  if exists(select 1 from public.push_subscriptions where installation_id=fresh_device
    and (enabled or endpoint is not null or endpoint_hash is not null or p256dh is not null or auth_key is not null)) then raise exception 'Disabled secrets retained'; end if;
  answer:=public.push_device_register(qa_owners[1],fresh_device,repeat('c',64),1,'Stale',qa_endpoint,
    encode(extensions.digest(qa_endpoint,'sha256'),'hex'),qa_public_key,'AAAAAAAAAAAAAAAAAAAAAA');
  if answer->>'error'<>'stale' then raise exception 'Stale registration revived device'; end if;
end;
$$;
rollback;
select 'PASS: 30-day disabled history cleanup is owner-scoped; recent history/cap preserved; foreign revoke rejected; owner revoke clears endpoint/keys and rejects stale registration; all mutations rolled back' as result;
