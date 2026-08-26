-- Layer 1 security hardening.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef=true
  loop
    execute format('revoke execute on function %s from anon', r.fn);
    execute format('revoke execute on function %s from public', r.fn);
  end loop;
end $$;

revoke execute on function public.handle_new_auth_user() from authenticated, service_role;

create or replace function public.lookup_access_credential(
  p_organization_id uuid,
  p_token_hmac text
)
returns table(credential_id uuid, member_id uuid)
language sql
stable
security definer
set search_path=public
as $$
  select c.id, c.member_id
  from public.access_credentials c
  where public.has_org_role(
          p_organization_id,
          array['owner','admin','manager','reception','trainer']::public.app_role[]
        )
    and c.organization_id=p_organization_id
    and c.token_hmac=p_token_hmac
    and c.is_active=true
  limit 1;
$$;

create or replace function public.start_attendance_session(
  p_organization_id uuid,
  p_location_id uuid,
  p_member_id uuid,
  p_membership_id uuid default null,
  p_method text default 'manual',
  p_terminal_id uuid default null,
  p_credential_id uuid default null,
  p_overridden boolean default false,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_session_id uuid;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized for access operations'; end if;

  if p_method not in ('manual','credential','qr','barcode','member_number','phone') then
    raise exception 'invalid check-in method';
  end if;

  if p_overridden and coalesce(trim(p_override_reason),'')='' then
    raise exception 'override requires a reason';
  end if;

  if p_overridden and not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  ) then raise exception 'manager authorization required for access override'; end if;

  if not exists (
    select 1 from public.members m
    where m.id=p_member_id
      and m.organization_id=p_organization_id
      and m.archived_at is null
  ) then raise exception 'member does not belong to organization'; end if;

  if not exists (
    select 1 from public.locations l
    where l.id=p_location_id
      and l.organization_id=p_organization_id
      and l.is_active
  ) then raise exception 'invalid location'; end if;

  if p_membership_id is not null and not exists (
    select 1 from public.memberships ms
    where ms.id=p_membership_id
      and ms.organization_id=p_organization_id
      and ms.member_id=p_member_id
  ) then raise exception 'invalid membership'; end if;

  if p_terminal_id is not null and not exists (
    select 1 from public.access_terminals t
    where t.id=p_terminal_id
      and t.organization_id=p_organization_id
      and t.location_id=p_location_id
      and t.is_active
      and t.mode in ('check_in','toggle')
  ) then raise exception 'invalid check-in terminal'; end if;

  if p_credential_id is not null and not exists (
    select 1 from public.access_credentials c
    where c.id=p_credential_id
      and c.organization_id=p_organization_id
      and c.member_id=p_member_id
      and c.is_active
  ) then raise exception 'invalid credential'; end if;

  insert into public.attendance_sessions(
    organization_id, location_id, member_id, membership_id, check_in_method,
    check_in_terminal_id, checked_in_by, overridden, override_reason
  ) values (
    p_organization_id, p_location_id, p_member_id, p_membership_id, p_method,
    p_terminal_id, auth.uid(), p_overridden,
    case when p_overridden then p_override_reason else null end
  ) returning id into v_session_id;

  insert into public.access_events(
    organization_id, location_id, member_id, attendance_session_id, credential_id,
    terminal_id, direction, result, method, actor_user_id, reason_code
  ) values (
    p_organization_id, p_location_id, p_member_id, v_session_id, p_credential_id,
    p_terminal_id, 'in', 'allowed', p_method, auth.uid(),
    case when p_overridden then 'manager_override' else null end
  );

  return v_session_id;
end;
$$;

create or replace function public.close_attendance_session(
  p_organization_id uuid,
  p_member_id uuid,
  p_method text default 'manual',
  p_terminal_id uuid default null,
  p_credential_id uuid default null,
  p_forced boolean default false,
  p_forced_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_session public.attendance_sessions%rowtype;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized for access operations'; end if;

  if p_method not in ('manual','credential','qr','barcode','member_number','phone','auto_close') then
    raise exception 'invalid check-out method';
  end if;

  if p_forced and coalesce(trim(p_forced_reason),'')='' then
    raise exception 'forced close requires a reason';
  end if;

  if p_forced and not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  ) then raise exception 'manager authorization required for forced close'; end if;

  select * into v_session
  from public.attendance_sessions s
  where s.organization_id=p_organization_id
    and s.member_id=p_member_id
    and s.checked_out_at is null
  order by s.checked_in_at desc
  limit 1
  for update;

  if v_session.id is null then raise exception 'member has no open attendance session'; end if;

  if p_terminal_id is not null and not exists (
    select 1 from public.access_terminals t
    where t.id=p_terminal_id
      and t.organization_id=p_organization_id
      and t.location_id=v_session.location_id
      and t.is_active
      and t.mode in ('check_out','toggle')
  ) then raise exception 'invalid check-out terminal'; end if;

  if p_credential_id is not null and not exists (
    select 1 from public.access_credentials c
    where c.id=p_credential_id
      and c.organization_id=p_organization_id
      and c.member_id=p_member_id
      and c.is_active
  ) then raise exception 'invalid credential'; end if;

  update public.attendance_sessions
  set checked_out_at=now(),
      check_out_method=p_method,
      check_out_terminal_id=p_terminal_id,
      checked_out_by=auth.uid(),
      forced_closed=p_forced,
      forced_close_reason=case when p_forced then p_forced_reason else null end,
      updated_at=now()
  where id=v_session.id;

  insert into public.access_events(
    organization_id, location_id, member_id, attendance_session_id, credential_id,
    terminal_id, direction, result, method, actor_user_id, reason_code
  ) values (
    p_organization_id, v_session.location_id, p_member_id, v_session.id, p_credential_id,
    p_terminal_id, 'out', 'allowed', p_method, auth.uid(),
    case when p_forced then 'forced_close' else null end
  );

  return v_session.id;
end;
$$;

create or replace function public.process_member_access(
  p_organization_id uuid,
  p_location_id uuid,
  p_member_id uuid,
  p_mode public.access_terminal_mode default 'toggle',
  p_method text default 'manual',
  p_terminal_id uuid default null,
  p_credential_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_open public.attendance_sessions%rowtype;
  v_membership public.memberships%rowtype;
  v_session_id uuid;
  v_direction public.access_direction;
  v_duplicate_window integer := 8;
  v_recent_event timestamptz;
  v_today date;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized for access operations'; end if;

  v_today := public.organization_local_date(p_organization_id);
  if v_today is null then raise exception 'organization timezone could not be resolved'; end if;

  if not exists (
    select 1 from public.locations
    where id=p_location_id and organization_id=p_organization_id and is_active
  ) then raise exception 'invalid location'; end if;

  if not exists (
    select 1 from public.members
    where id=p_member_id and organization_id=p_organization_id and archived_at is null
  ) then raise exception 'invalid member'; end if;

  select * into v_open
  from public.attendance_sessions
  where organization_id=p_organization_id
    and member_id=p_member_id
    and checked_out_at is null
  order by checked_in_at desc
  limit 1;

  v_direction := case
    when p_mode='check_in' then 'in'::public.access_direction
    when p_mode='check_out' then 'out'::public.access_direction
    when v_open.id is null then 'in'::public.access_direction
    else 'out'::public.access_direction
  end;

  if p_terminal_id is not null then
    select duplicate_window_seconds into v_duplicate_window
    from public.access_terminals
    where id=p_terminal_id
      and organization_id=p_organization_id
      and location_id=p_location_id
      and is_active;
    if not found then raise exception 'invalid terminal'; end if;
  end if;

  if p_credential_id is not null and not exists (
    select 1 from public.access_credentials c
    where c.id=p_credential_id
      and c.organization_id=p_organization_id
      and c.member_id=p_member_id
      and c.is_active
  ) then raise exception 'invalid credential'; end if;

  select max(occurred_at) into v_recent_event
  from public.access_events
  where organization_id=p_organization_id
    and member_id=p_member_id
    and direction=v_direction
    and result='allowed';

  if v_recent_event is not null
     and v_recent_event > now()-make_interval(secs=>v_duplicate_window) then
    insert into public.access_events(
      organization_id, location_id, member_id, attendance_session_id, credential_id,
      terminal_id, direction, result, method, actor_user_id, reason_code
    ) values (
      p_organization_id,p_location_id,p_member_id,v_open.id,p_credential_id,
      p_terminal_id,v_direction,'ignored',p_method,auth.uid(),'duplicate_window'
    );
    return jsonb_build_object('result','ignored','action',v_direction,'message','Duplicate scan ignored');
  end if;

  if v_direction='out' then
    if v_open.id is null then
      insert into public.access_events(
        organization_id, location_id, member_id, credential_id, terminal_id,
        direction, result, method, actor_user_id, reason_code
      ) values (
        p_organization_id,p_location_id,p_member_id,p_credential_id,p_terminal_id,
        'out','denied',p_method,auth.uid(),'no_open_session'
      );
      return jsonb_build_object('result','denied','action','out','message','No open visit to check out');
    end if;

    update public.attendance_sessions
    set checked_out_at=now(),
        check_out_method=p_method,
        check_out_terminal_id=p_terminal_id,
        checked_out_by=auth.uid(),
        updated_at=now()
    where id=v_open.id;

    insert into public.access_events(
      organization_id, location_id, member_id, attendance_session_id, credential_id,
      terminal_id, direction, result, method, actor_user_id
    ) values (
      p_organization_id,p_location_id,p_member_id,v_open.id,p_credential_id,
      p_terminal_id,'out','allowed',p_method,auth.uid()
    );
    return jsonb_build_object('result','allowed','action','out','session_id',v_open.id,'message','Check-out recorded');
  end if;

  if v_open.id is not null then
    insert into public.access_events(
      organization_id, location_id, member_id, attendance_session_id, credential_id,
      terminal_id, direction, result, method, actor_user_id, reason_code
    ) values (
      p_organization_id,p_location_id,p_member_id,v_open.id,p_credential_id,
      p_terminal_id,'in','ignored',p_method,auth.uid(),'already_inside'
    );
    return jsonb_build_object('result','ignored','action','in','message','Member is already checked in');
  end if;

  select ms.* into v_membership
  from public.memberships ms
  where ms.organization_id=p_organization_id
    and ms.member_id=p_member_id
    and ms.status='active'
    and ms.starts_on<=v_today
    and (ms.ends_on is null or ms.ends_on>=v_today)
    and (ms.visits_remaining is null or ms.visits_remaining>0)
    and not exists (
      select 1 from public.membership_freezes mf
      where mf.membership_id=ms.id
        and v_today between mf.starts_on and mf.ends_on
    )
  order by coalesce(ms.ends_on,'9999-12-31'::date) desc
  limit 1
  for update;

  if v_membership.id is null then
    insert into public.access_events(
      organization_id, location_id, member_id, credential_id, terminal_id,
      direction, result, method, actor_user_id, reason_code
    ) values (
      p_organization_id,p_location_id,p_member_id,p_credential_id,p_terminal_id,
      'in','denied',p_method,auth.uid(),'no_valid_membership'
    );
    return jsonb_build_object('result','denied','action','in','message','No valid membership or membership is frozen');
  end if;

  insert into public.attendance_sessions(
    organization_id, location_id, member_id, membership_id, check_in_method,
    check_in_terminal_id, checked_in_by
  ) values (
    p_organization_id,p_location_id,p_member_id,v_membership.id,p_method,
    p_terminal_id,auth.uid()
  ) returning id into v_session_id;

  if v_membership.visits_remaining is not null then
    update public.memberships
    set visits_remaining=visits_remaining-1, updated_at=now()
    where id=v_membership.id;
  end if;

  insert into public.access_events(
    organization_id, location_id, member_id, attendance_session_id, credential_id,
    terminal_id, direction, result, method, actor_user_id
  ) values (
    p_organization_id,p_location_id,p_member_id,v_session_id,p_credential_id,
    p_terminal_id,'in','allowed',p_method,auth.uid()
  );

  return jsonb_build_object(
    'result','allowed',
    'action','in',
    'session_id',v_session_id,
    'membership_id',v_membership.id,
    'message','Check-in recorded'
  );
end;
$$;

grant execute on function public.lookup_access_credential(uuid,text) to authenticated, service_role;
grant execute on function public.start_attendance_session(uuid,uuid,uuid,uuid,text,uuid,uuid,boolean,text) to authenticated, service_role;
grant execute on function public.close_attendance_session(uuid,uuid,text,uuid,uuid,boolean,text) to authenticated, service_role;
grant execute on function public.process_member_access(uuid,uuid,uuid,public.access_terminal_mode,text,uuid,uuid) to authenticated, service_role;

grant execute on function public.assign_access_credential(uuid,uuid,public.access_credential_type,text,text,text) to authenticated, service_role;
grant execute on function public.book_class(uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public.complete_pt_session(uuid,uuid) to authenticated, service_role;
grant execute on function public.convert_lead_to_member(uuid,uuid) to authenticated, service_role;
grant execute on function public.create_organization(text,text,text,text,text) to authenticated, service_role;
grant execute on function public.enroll_membership(uuid,uuid,uuid,date,bigint,text,text) to authenticated, service_role;
grant execute on function public.freeze_membership(uuid,uuid,date,date,text) to authenticated, service_role;
grant execute on function public.has_org_role(uuid,public.app_role[]) to authenticated, service_role;
grant execute on function public.import_members(uuid,uuid,jsonb) to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.record_payment(uuid,uuid,uuid,uuid,bigint,text,text,text,text) to authenticated, service_role;
grant execute on function public.revoke_access_credential(uuid,uuid) to authenticated, service_role;
