-- Layer 4: transaction/concurrency hardening.
-- 1) Atomic per-organization member/receipt numbers.
-- 2) Serialize member access operations and suppress rapid duplicate scans before toggle direction.
-- 3) Allow safe rebooking of previously cancelled/no-show class bookings.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists private.organization_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_member_number bigint not null default 1 check (next_member_number > 0),
  next_receipt_number bigint not null default 1 check (next_receipt_number > 0),
  updated_at timestamptz not null default now()
);

revoke all on private.organization_counters from public, anon, authenticated;
grant all on private.organization_counters to service_role;

insert into private.organization_counters (
  organization_id,
  next_member_number,
  next_receipt_number
)
select
  o.id,
  coalesce((select max(m.member_number) from public.members m where m.organization_id=o.id), 0) + 1,
  coalesce((select max(p.receipt_number) from public.payments p where p.organization_id=o.id), 0) + 1
from public.organizations o
on conflict (organization_id) do update
set next_member_number = greatest(
      private.organization_counters.next_member_number,
      excluded.next_member_number
    ),
    next_receipt_number = greatest(
      private.organization_counters.next_receipt_number,
      excluded.next_receipt_number
    ),
    updated_at = now();

create or replace function private.allocate_member_number(p_organization_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number bigint;
begin
  insert into private.organization_counters (
    organization_id,
    next_member_number,
    next_receipt_number
  ) values (
    p_organization_id,
    2,
    1
  )
  on conflict (organization_id) do update
  set next_member_number = private.organization_counters.next_member_number + 1,
      updated_at = now()
  returning next_member_number - 1 into v_number;

  return v_number;
end;
$$;

create or replace function private.allocate_receipt_number(p_organization_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number bigint;
begin
  insert into private.organization_counters (
    organization_id,
    next_member_number,
    next_receipt_number
  ) values (
    p_organization_id,
    1,
    2
  )
  on conflict (organization_id) do update
  set next_receipt_number = private.organization_counters.next_receipt_number + 1,
      updated_at = now()
  returning next_receipt_number - 1 into v_number;

  return v_number;
end;
$$;

revoke all on function private.allocate_member_number(uuid) from public, anon, authenticated;
revoke all on function private.allocate_receipt_number(uuid) from public, anon, authenticated;
grant execute on function private.allocate_member_number(uuid) to service_role;
grant execute on function private.allocate_receipt_number(uuid) to service_role;

create or replace function private.assign_member_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_number is null then
    new.member_number := private.allocate_member_number(new.organization_id);
  end if;
  return new;
end;
$$;

create or replace function private.assign_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.receipt_number is null then
    new.receipt_number := private.allocate_receipt_number(new.organization_id);
  end if;
  return new;
end;
$$;

revoke all on function private.assign_member_number() from public, anon, authenticated;
revoke all on function private.assign_receipt_number() from public, anon, authenticated;
grant execute on function private.assign_member_number() to service_role;
grant execute on function private.assign_receipt_number() to service_role;

drop trigger if exists members_assign_member_number on public.members;
create trigger members_assign_member_number
before insert on public.members
for each row execute function private.assign_member_number();

drop trigger if exists payments_assign_receipt_number on public.payments;
create trigger payments_assign_receipt_number
before insert on public.payments
for each row execute function private.assign_receipt_number();

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
  v_recent_allowed timestamptz;
  v_today date;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then
    raise exception 'not authorized for access operations';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_member_id::text, 0)
  );

  v_today := public.organization_local_date(p_organization_id);
  if v_today is null then raise exception 'organization timezone could not be resolved'; end if;

  if not exists (
    select 1 from public.locations
    where id = p_location_id
      and organization_id = p_organization_id
      and is_active
  ) then
    raise exception 'invalid location';
  end if;

  if not exists (
    select 1 from public.members
    where id = p_member_id
      and organization_id = p_organization_id
      and archived_at is null
  ) then
    raise exception 'invalid member';
  end if;

  if p_terminal_id is not null then
    select duplicate_window_seconds into v_duplicate_window
    from public.access_terminals
    where id = p_terminal_id
      and organization_id = p_organization_id
      and location_id = p_location_id
      and is_active;

    if not found then
      raise exception 'invalid terminal';
    end if;
  end if;

  if p_credential_id is not null and not exists (
    select 1 from public.access_credentials c
    where c.id = p_credential_id
      and c.organization_id = p_organization_id
      and c.member_id = p_member_id
      and c.is_active
  ) then
    raise exception 'invalid credential';
  end if;

  select max(ae.occurred_at) into v_recent_allowed
  from public.access_events ae
  where ae.organization_id = p_organization_id
    and ae.member_id = p_member_id
    and ae.result = 'allowed'
    and (p_terminal_id is null or ae.terminal_id = p_terminal_id)
    and (p_credential_id is null or ae.credential_id = p_credential_id);

  if v_recent_allowed is not null
     and v_recent_allowed > now() - make_interval(secs => v_duplicate_window) then
    insert into public.access_events (
      organization_id, location_id, member_id, credential_id,
      terminal_id, direction, result, method, actor_user_id, reason_code
    ) values (
      p_organization_id, p_location_id, p_member_id, p_credential_id,
      p_terminal_id,
      case when p_mode = 'check_out' then 'out'::public.access_direction else 'in'::public.access_direction end,
      'ignored', p_method, auth.uid(), 'duplicate_window'
    );
    return jsonb_build_object('result','ignored','action',p_mode,'message','Duplicate scan ignored');
  end if;

  select * into v_open
  from public.attendance_sessions
  where organization_id = p_organization_id
    and member_id = p_member_id
    and checked_out_at is null
  order by checked_in_at desc
  limit 1;

  v_direction := case
    when p_mode = 'check_in' then 'in'::public.access_direction
    when p_mode = 'check_out' then 'out'::public.access_direction
    when v_open.id is null then 'in'::public.access_direction
    else 'out'::public.access_direction
  end;

  if v_direction = 'out' then
    if v_open.id is null then
      insert into public.access_events (
        organization_id, location_id, member_id, credential_id, terminal_id,
        direction, result, method, actor_user_id, reason_code
      ) values (
        p_organization_id, p_location_id, p_member_id, p_credential_id, p_terminal_id,
        'out', 'denied', p_method, auth.uid(), 'no_open_session'
      );
      return jsonb_build_object('result','denied','action','out','message','No open visit to check out');
    end if;

    update public.attendance_sessions
    set checked_out_at = now(),
        check_out_method = p_method,
        check_out_terminal_id = p_terminal_id,
        checked_out_by = auth.uid(),
        updated_at = now()
    where id = v_open.id;

    insert into public.access_events (
      organization_id, location_id, member_id, attendance_session_id, credential_id,
      terminal_id, direction, result, method, actor_user_id
    ) values (
      p_organization_id, p_location_id, p_member_id, v_open.id, p_credential_id,
      p_terminal_id, 'out', 'allowed', p_method, auth.uid()
    );

    return jsonb_build_object('result','allowed','action','out','session_id',v_open.id,'message','Check-out recorded');
  end if;

  if v_open.id is not null then
    insert into public.access_events (
      organization_id, location_id, member_id, attendance_session_id, credential_id,
      terminal_id, direction, result, method, actor_user_id, reason_code
    ) values (
      p_organization_id, p_location_id, p_member_id, v_open.id, p_credential_id,
      p_terminal_id, 'in', 'ignored', p_method, auth.uid(), 'already_inside'
    );
    return jsonb_build_object('result','ignored','action','in','message','Member is already checked in');
  end if;

  select ms.* into v_membership
  from public.memberships ms
  where ms.organization_id = p_organization_id
    and ms.member_id = p_member_id
    and ms.status = 'active'
    and ms.starts_on <= v_today
    and (ms.ends_on is null or ms.ends_on >= v_today)
    and (ms.visits_remaining is null or ms.visits_remaining > 0)
    and not exists (
      select 1 from public.membership_freezes mf
      where mf.membership_id = ms.id
        and v_today between mf.starts_on and mf.ends_on
    )
  order by coalesce(ms.ends_on, '9999-12-31'::date) desc
  limit 1
  for update;

  if v_membership.id is null then
    insert into public.access_events (
      organization_id, location_id, member_id, credential_id, terminal_id,
      direction, result, method, actor_user_id, reason_code
    ) values (
      p_organization_id, p_location_id, p_member_id, p_credential_id, p_terminal_id,
      'in', 'denied', p_method, auth.uid(), 'no_valid_membership'
    );
    return jsonb_build_object('result','denied','action','in','message','No valid membership or membership is frozen');
  end if;

  insert into public.attendance_sessions (
    organization_id, location_id, member_id, membership_id, check_in_method,
    check_in_terminal_id, checked_in_by
  ) values (
    p_organization_id, p_location_id, p_member_id, v_membership.id, p_method,
    p_terminal_id, auth.uid()
  ) returning id into v_session_id;

  if v_membership.visits_remaining is not null then
    update public.memberships
    set visits_remaining = visits_remaining - 1,
        updated_at = now()
    where id = v_membership.id;
  end if;

  insert into public.access_events (
    organization_id, location_id, member_id, attendance_session_id, credential_id,
    terminal_id, direction, result, method, actor_user_id
  ) values (
    p_organization_id, p_location_id, p_member_id, v_session_id, p_credential_id,
    p_terminal_id, 'in', 'allowed', p_method, auth.uid()
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

revoke execute on function public.process_member_access(uuid,uuid,uuid,public.access_terminal_mode,text,uuid,uuid) from public, anon;
grant execute on function public.process_member_access(uuid,uuid,uuid,public.access_terminal_mode,text,uuid,uuid) to authenticated, service_role;

create or replace function public.book_class(
  p_organization_id uuid,
  p_class_session_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.class_sessions%rowtype;
  v_existing public.class_bookings%rowtype;
  v_booked integer;
  v_status text;
  v_id uuid;
  v_is_coordinator boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  if not exists (
    select 1 from public.members
    where id=p_member_id
      and organization_id=p_organization_id
      and archived_at is null
  ) then raise exception 'invalid member'; end if;

  select * into v_session
  from public.class_sessions
  where id=p_class_session_id
    and organization_id=p_organization_id
    and status='scheduled'
  for update;
  if v_session.id is null then raise exception 'class session is not available'; end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  );
  if not v_is_coordinator and v_session.trainer_user_id <> auth.uid() then
    raise exception 'trainer may manage bookings only for assigned classes';
  end if;

  select * into v_existing
  from public.class_bookings
  where class_session_id=p_class_session_id
    and member_id=p_member_id
  for update;

  if v_existing.id is not null
     and v_existing.status in ('booked','waitlisted','attended') then
    raise exception 'member is already booked for this class';
  end if;

  select count(*) into v_booked
  from public.class_bookings
  where class_session_id=p_class_session_id
    and status in ('booked','attended');

  v_status := case when v_booked < v_session.capacity then 'booked' else 'waitlisted' end;

  if v_existing.id is not null then
    update public.class_bookings
    set status=v_status,
        booked_at=now(),
        updated_at=now()
    where id=v_existing.id
    returning id into v_id;
  else
    insert into public.class_bookings (
      organization_id,class_session_id,member_id,status
    ) values (
      p_organization_id,p_class_session_id,p_member_id,v_status
    ) returning id into v_id;
  end if;

  return jsonb_build_object('booking_id',v_id,'status',v_status);
end;
$$;

revoke execute on function public.book_class(uuid,uuid,uuid) from public, anon;
grant execute on function public.book_class(uuid,uuid,uuid) to authenticated, service_role;
