-- Separate actual-time records. Browser roles never access these tables/RPCs.
create function public.execution_iso(p_value timestamptz) returns text
language sql immutable strict set search_path='' as $$
  select pg_catalog.to_char(p_value at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
create function public.execution_time(p_value text) returns timestamptz
language plpgsql immutable strict set search_path='' as $$
declare parsed timestamptz;
begin
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' or left(p_value,5)='0000-' then return null; end if;
  parsed:=p_value::timestamptz;
  if public.execution_iso(parsed)<>p_value then return null; end if;
  return parsed;
exception when others then return null;
end $$;
create function public.execution_date(p_value text) returns boolean
language plpgsql immutable strict set search_path='' as $$
begin
  return p_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and left(p_value,5)<>'0000-'
    and pg_catalog.to_char(p_value::date,'YYYY-MM-DD')=p_value;
exception when others then return false;
end $$;
create function public.execution_js_length(p_value text) returns integer
language sql immutable strict set search_path='' as $$
  select coalesce(sum(case when pg_catalog.ascii(part)>65535 then 2 else 1 end),0)::integer
  from pg_catalog.regexp_split_to_table(p_value,'') as chars(part) where part<>''
$$;

create function public.execution_record_valid(p_data jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  start_at timestamptz; end_at timestamptz; limit_at timestamptz; previous_at timestamptz;
  segment jsonb; segment_start timestamptz; segment_end timestamptz; seg_index integer:=0; seg_count integer;
  total_minutes numeric; work_minutes numeric; review boolean; reason text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_data))<>12 or not p_data ?& array[
    'schemaVersion','id','taskId','title','plannedDate','plannedWorkMinutes','plannedTotalMinutes',
    'startedAt','endedAt','finishReason','needsReview','segments'
  ] then return false; end if;
  if jsonb_typeof(p_data->'schemaVersion') is distinct from 'number' or p_data->'schemaVersion'<>'1'::jsonb
    or jsonb_typeof(p_data->'id') is distinct from 'string'
    or p_data->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or jsonb_typeof(p_data->'taskId') is distinct from 'string'
    or public.execution_js_length(p_data->>'taskId') not between 1 and 1000
    or jsonb_typeof(p_data->'title') is distinct from 'string'
    or public.execution_js_length(p_data->>'title') not between 1 and 120
    or pg_catalog.btrim(p_data->>'title',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
    or not (p_data->'plannedDate'='null'::jsonb or jsonb_typeof(p_data->'plannedDate')='string' and public.execution_date(p_data->>'plannedDate'))
  then return false; end if;
  if not (p_data->'plannedWorkMinutes'='null'::jsonb and p_data->'plannedTotalMinutes'='null'::jsonb) then
    if jsonb_typeof(p_data->'plannedWorkMinutes') is distinct from 'number' or jsonb_typeof(p_data->'plannedTotalMinutes') is distinct from 'number' then return false; end if;
    work_minutes:=(p_data->>'plannedWorkMinutes')::numeric; total_minutes:=(p_data->>'plannedTotalMinutes')::numeric;
    if total_minutes<>trunc(total_minutes) or total_minutes not between 2 and 240
      or work_minutes<>trunc(work_minutes) or work_minutes<1 or work_minutes>=total_minutes then return false; end if;
  end if;
  if jsonb_typeof(p_data->'startedAt') is distinct from 'string'
    or jsonb_typeof(p_data->'needsReview') is distinct from 'boolean'
    or jsonb_typeof(p_data->'segments') is distinct from 'array' then return false; end if;
  start_at:=public.execution_time(p_data->>'startedAt');
  if start_at is null then return false; end if;
  review:=(p_data->>'needsReview')::boolean; reason:=p_data->>'finishReason';
  limit_at:=least(start_at+interval '24 hours',public.execution_time('9999-12-31T23:59:59.999Z'));
  if p_data->'endedAt'='null'::jsonb then
    if p_data->'finishReason'<>'null'::jsonb or review then return false; end if;
    end_at:=limit_at;
  else
    if jsonb_typeof(p_data->'endedAt') is distinct from 'string'
      or jsonb_typeof(p_data->'finishReason') is distinct from 'string' then return false; end if;
    end_at:=public.execution_time(p_data->>'endedAt');
    if end_at is null or reason not in ('user','completed','removed','limit','manual')
      or (reason='limit')<>review or reason='limit' and end_at<>limit_at then return false; end if;
  end if;
  if end_at<start_at or end_at>limit_at then return false; end if;
  seg_count:=jsonb_array_length(p_data->'segments'); previous_at:=start_at;
  if seg_count not between 1 and 64 then return false; end if;
  for segment in select item.value from jsonb_array_elements(p_data->'segments') as item(value) loop
    seg_index:=seg_index+1;
    if jsonb_typeof(segment) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(segment))<>3 or not segment ?& array['kind','start','end']
      or jsonb_typeof(segment->'kind') is distinct from 'string' or segment->>'kind' not in ('work','break')
      or jsonb_typeof(segment->'start') is distinct from 'string' then return false; end if;
    segment_start:=public.execution_time(segment->>'start');
    if segment_start is null then return false; end if;
    if segment->'end'='null'::jsonb then
      if seg_index<>seg_count or p_data->'endedAt'<>'null'::jsonb then return false; end if;
      segment_end:=limit_at;
    else
      if jsonb_typeof(segment->'end') is distinct from 'string' then return false; end if;
      segment_end:=public.execution_time(segment->>'end');
      if segment_end is null then return false; end if;
    end if;
    if seg_index=1 and segment_start<>start_at or segment_start<previous_at
      or segment_start>end_at or segment_end<segment_start or segment_end>end_at then return false; end if;
    previous_at:=segment_end;
  end loop;
  return true;
exception when others then return false;
end $$;

create table public.execution_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  data jsonb not null,
  started_at timestamptz generated always as (public.execution_time(data->>'startedAt')) stored not null,
  ended_at timestamptz generated always as (public.execution_time(data->>'endedAt')) stored,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,id),
  constraint execution_record_bytes check(octet_length(data::text)<=32768),
  constraint execution_record_shape check(public.execution_record_valid(data)),
  constraint execution_record_id check(data->>'id'=id::text)
);
create unique index execution_one_open_per_user on public.execution_records(user_id) where ended_at is null;
create index execution_record_start on public.execution_records(user_id,started_at,id);
create index execution_record_end on public.execution_records(user_id,ended_at) where ended_at is not null;

create table public.execution_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check(version>=0 and version<9007199254740991),
  active_id uuid,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(user_id,active_id) references public.execution_records(user_id,id) deferrable initially deferred
);
create table public.execution_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  kind text not null check(kind in ('start','switch','pause','resume','break','stop','manual','correct')),
  applied_version bigint not null check(applied_version>=0 and applied_version<9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,operation_id)
);
create index execution_operation_retention on public.execution_operations(user_id,created_at);

create function public.execution_active_consistency() returns trigger
language plpgsql set search_path='' as $$
declare owner_id uuid; expected_id uuid; actual_id uuid;
begin
  owner_id:=coalesce(new.user_id,old.user_id);
  select s.active_id into expected_id from public.execution_states s where s.user_id=owner_id;
  select r.id into actual_id from public.execution_records r where r.user_id=owner_id and r.ended_at is null;
  if expected_id is distinct from actual_id then raise exception using errcode='23514',message='execution active pointer mismatch'; end if;
  return null;
end $$;
create constraint trigger execution_record_active_consistency
after insert or update or delete on public.execution_records deferrable initially deferred
for each row execute function public.execution_active_consistency();
create constraint trigger execution_state_active_consistency
after insert or update or delete on public.execution_states deferrable initially deferred
for each row execute function public.execution_active_consistency();

alter table public.execution_records enable row level security;
alter table public.execution_states enable row level security;
alter table public.execution_operations enable row level security;
revoke all on public.execution_records,public.execution_states,public.execution_operations from public,anon,authenticated,service_role;
grant select,insert,delete on public.execution_records,public.execution_states,public.execution_operations to service_role;
grant update(data,updated_at) on public.execution_records to service_role;
grant update(version,active_id,updated_at) on public.execution_states to service_role;
revoke all on function public.execution_iso(timestamptz),public.execution_time(text),public.execution_date(text),
  public.execution_js_length(text),public.execution_record_valid(jsonb),public.execution_active_consistency()
  from public,anon,authenticated;
grant execute on function public.execution_iso(timestamptz),public.execution_time(text),public.execution_date(text),
  public.execution_js_length(text),public.execution_record_valid(jsonb),public.execution_active_consistency()
  to service_role;
