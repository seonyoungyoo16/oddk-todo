-- Verify BEFORE deleting the one race fixture; no receipt/lease secrets output.
do $$
declare first jsonb; second jsonb; distinct_count integer;
begin
  select raw_app_meta_data->'queueRaceFirst',raw_app_meta_data->'queueRaceSecond' into first,second
  from auth.users where raw_app_meta_data->>'oddk_test_run'='push-queue-race';
  if first is null or second is null then raise exception 'Specific scheduled race jobs have not both completed'; end if;
  if jsonb_array_length(first->'ids')<>5 or jsonb_array_length(second->'ids')<>5 then raise exception 'Both sessions must claim five'; end if;
  select count(distinct value) into distinct_count from jsonb_array_elements((first->'ids')||(second->'ids'));
  if distinct_count<>10 then raise exception 'Duplicate delivery claims'; end if;
  if greatest((first->>'claimed')::timestamptz,(second->>'claimed')::timestamptz)>=least((first->>'finished')::timestamptz,(second->>'finished')::timestamptz) then raise exception 'Claims serialized behind held locks; not a concurrent proof'; end if;
  if exists(select 1 from cron.job where jobname in ('oddk-qa-push-first','oddk-qa-push-second')) then raise exception 'One-shot jobs remain'; end if;
end;
$$;
select 'PASS: two real pg_cron sessions each claimed five disjoint deliveries before either released its six-second lock; one-shot jobs removed' as result;
