-- Custom CAS conflicts are not database serialization failures. PostgREST14
-- retries SQLSTATE40001 indefinitely; PT409 returns a conflict immediately.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.execution_commit(uuid,uuid,text,text,bigint,bigint,jsonb,uuid)'::regprocedure);
  if strpos(definition,'errcode=''40001''')=0 then raise exception 'Expected execution CAS definition'; end if;
  execute replace(definition,'errcode=''40001''','errcode=''PT409''');
end $$;
