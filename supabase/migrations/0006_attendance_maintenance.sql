-- Operational maintenance for forgotten check-outs.
-- Intended to be called by a trusted server/cron using the service role.

create or replace function public.auto_close_stale_attendance(
  p_organization_id uuid,
  p_max_hours integer default 12
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_count integer := 0;
begin
  if p_max_hours < 1 or p_max_hours > 48 then
    raise exception 'max visit hours must be between 1 and 48';
  end if;

  for v_session in
    select *
    from public.attendance_sessions
    where organization_id = p_organization_id
      and checked_out_at is null
      and checked_in_at <= now() - make_interval(hours => p_max_hours)
    for update skip locked
  loop
    update public.attendance_sessions
       set checked_out_at = v_session.checked_in_at + make_interval(hours => p_max_hours),
           check_out_method = 'auto_close',
           forced_closed = true,
           forced_close_reason = 'Automatically closed after maximum visit duration',
           updated_at = now()
     where id = v_session.id;

    insert into public.access_events (
      organization_id, location_id, member_id, attendance_session_id,
      direction, result, method, reason_code, occurred_at,
      metadata
    ) values (
      p_organization_id, v_session.location_id, v_session.member_id, v_session.id,
      'out', 'allowed', 'auto_close', 'stale_session_auto_close',
      v_session.checked_in_at + make_interval(hours => p_max_hours),
      jsonb_build_object('max_hours', p_max_hours)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.auto_close_stale_attendance(uuid,integer) from public, anon, authenticated;
grant execute on function public.auto_close_stale_attendance(uuid,integer) to service_role;
