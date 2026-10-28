-- Internal worker authorization only; every state mutation rolls back.
begin;
do $$
declare lease jsonb; expected uuid;
begin
  update public.push_worker_state set enabled=true,lease_id=null,lease_until='-infinity',ticket_hash=repeat('a',64),ticket_until=clock_timestamp()+interval '2 minutes' where singleton;
  if public.push_worker_claim(repeat('b',64)) is not null then raise exception 'Wrong ticket accepted'; end if;
  lease:=public.push_worker_claim(repeat('a',64)); expected:=(lease->>'id')::uuid;
  if expected is null or public.push_worker_claim(repeat('a',64)) is not null then raise exception 'Missing/replayed lease'; end if;
  if public.push_worker_deliveries(gen_random_uuid())<>'[]'::jsonb then raise exception 'Wrong worker claimed'; end if;
  if public.push_worker_current(gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) is not null then raise exception 'Wrong worker read'; end if;
  if public.push_worker_finish(gen_random_uuid(),'{}') then raise exception 'Wrong worker finished'; end if;
  update public.push_worker_state set enabled=false where singleton;
  if public.push_worker_deliveries(expected)<>'[]'::jsonb then raise exception 'Disabled worker claimed'; end if;
  update public.push_worker_state set enabled=true,lease_until=clock_timestamp()-interval '1 second' where singleton;
  if public.push_worker_deliveries(expected)<>'[]'::jsonb or public.push_worker_finish(expected,'{}') then raise exception 'Expired worker lease accepted'; end if;
  update public.push_worker_state set lease_until=clock_timestamp()+interval '45 seconds' where singleton;
  if not public.push_worker_finish(expected,'{"claimed":0}') then raise exception 'Valid finish refused'; end if;
  update public.push_worker_state set ticket_hash=repeat('a',64),ticket_until=clock_timestamp()-interval '1 second' where singleton;
  if public.push_worker_claim(repeat('a',64)) is not null then raise exception 'Expired ticket accepted'; end if;
end;
$$;
rollback;
select 'PASS: worker ticket/one-use/expiry/disable/lease/finalize guards; full rollback' as result;
