-- Auth hard-deletes also fire the plan's reminder trigger. Auth must not gain
-- direct access to reminder RPCs or tables. This fixed-row trigger owns the work.
create or replace function public.push_plan_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP='DELETE' then perform public.push_sync_reminders(OLD.user_id,null); return OLD; end if;
  perform public.push_sync_reminders(NEW.user_id,NEW.plan); return NEW;
end;
$$;
revoke all on function public.push_plan_changed() from public,anon,authenticated,service_role;
