-- App-closed recurrence preparation. Start disabled until the Edge is verified.
-- A short-lived, one-use dispatch ticket replaces a long-lived HTTP credential.
-- Only postgres/cron can mint tickets; browsers cannot access this state/RPCs.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table public.task_maintenance_state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  project_url text check (project_url ~ '^https://[a-z]{20}\.supabase\.co$'),
  cursor_user_id uuid,
  ticket_hash text check (ticket_hash ~ '^[a-f0-9]{64}$'),
  ticket_until timestamptz not null default '-infinity',
  lease_id uuid,
  lease_until timestamptz not null default '-infinity',
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  last_request_id bigint
);
insert into public.task_maintenance_state(singleton) values (true);
alter table public.task_maintenance_state enable row level security;
revoke all on public.task_maintenance_state from public, anon, authenticated;
grant select, update on public.task_maintenance_state to service_role;

-- Bounded, keyset scans avoid starting with the same accounts each minute.
create index account_plans_repeat_scan on public.account_plans(user_id)
  where plan->>'schemaVersion' = '6';

create function public.task_maintenance_claim(p_hash text)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare result jsonb;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  update public.task_maintenance_state
  set ticket_hash = null, ticket_until = '-infinity',
      lease_id = gen_random_uuid(), lease_until = clock_timestamp() + interval '45 seconds',
      last_started_at = clock_timestamp()
  where singleton and enabled and ticket_hash = p_hash
    and ticket_until > clock_timestamp() and lease_until <= clock_timestamp()
  returning jsonb_build_object('id',lease_id,'until',lease_until,'cursor',cursor_user_id) into result;
  return result;
end;
$$;
revoke all on function public.task_maintenance_claim(text) from public, anon, authenticated;
grant execute on function public.task_maintenance_claim(text) to service_role;

create function public.task_maintenance_batch(p_lease uuid)
returns table(user_id uuid, plan jsonb, version bigint)
language sql security invoker set search_path = pg_catalog, public
as $$
  select p.user_id, p.plan, p.version
  from public.task_maintenance_state s
  join public.account_plans p on s.cursor_user_id is null or p.user_id > s.cursor_user_id
  where s.singleton and s.enabled and s.lease_id = p_lease and s.lease_until > clock_timestamp()
    and p.plan->>'schemaVersion' = '6'
    and jsonb_array_length(case when jsonb_typeof(p.plan->'recurrences') = 'array'
      then p.plan->'recurrences' else '[]'::jsonb end) > 0
  order by p.user_id limit 5;
$$;
revoke all on function public.task_maintenance_batch(uuid) from public, anon, authenticated;
grant execute on function public.task_maintenance_batch(uuid) to service_role;

create function public.task_maintenance_write(p_lease uuid, p_user uuid, p_version bigint, p_plan jsonb)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare changed uuid;
begin
  -- Pin the lease while writing. A replacement worker cannot overlap this write.
  perform 1 from public.task_maintenance_state where singleton and enabled
    and lease_id = p_lease and lease_until > clock_timestamp() for update;
  if not found or (p_plan->>'schemaVersion') is distinct from '6' or p_version is null or p_version < 1 then return false; end if;
  update public.account_plans set plan = p_plan, version = p_version + 1, updated_at = clock_timestamp()
  where user_id = p_user and version = p_version and plan->>'schemaVersion' = '6'
  returning user_id into changed;
  return changed is not null;
end;
$$;
revoke all on function public.task_maintenance_write(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.task_maintenance_write(uuid,uuid,bigint,jsonb) to service_role;

create function public.task_maintenance_finish(p_lease uuid, p_cursor uuid, p_result jsonb)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare changed boolean;
begin
  if jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text) > 1000 then return false; end if;
  update public.task_maintenance_state
  set cursor_user_id = p_cursor, lease_id = null, lease_until = '-infinity',
      last_finished_at = clock_timestamp(), last_result = p_result
  where singleton and lease_id = p_lease and lease_until > clock_timestamp()
  returning true into changed;
  return coalesce(changed,false);
end;
$$;
revoke all on function public.task_maintenance_finish(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.task_maintenance_finish(uuid,uuid,jsonb) to service_role;

create function public.task_maintenance_dispatch()
returns bigint language plpgsql security invoker set search_path = pg_catalog, public, extensions
as $$
declare token text; target text; request_id bigint;
begin
  select project_url into target from public.task_maintenance_state
  where singleton and enabled and project_url is not null
    and lease_until <= clock_timestamp() and ticket_until <= clock_timestamp()
  for update skip locked;
  if not found then return null; end if;
  token := encode(extensions.gen_random_bytes(32),'hex');
  update public.task_maintenance_state set ticket_hash = encode(extensions.digest(token,'sha256'),'hex'),
    ticket_until = clock_timestamp() + interval '2 minutes' where singleton;
  select net.http_post(url := target || '/functions/v1/task-maintenance',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('ticket',token), timeout_milliseconds := 40000) into request_id;
  update public.task_maintenance_state set last_request_id = request_id where singleton;
  return request_id;
end;
$$;
revoke all on function public.task_maintenance_dispatch() from public, anon, authenticated, service_role;

-- No secrets in cron command/history; short-lived ticket body exists in pg_net's
-- transient request queue. A database administrator already controls this job.
select cron.schedule('oddk-task-maintenance','* * * * *','select public.task_maintenance_dispatch();');
