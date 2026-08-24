-- Membership lifecycle hardening: tenant-local dates, real freeze windows,
-- and balance-safe membership-linked payments.

create or replace function public.organization_local_date(p_organization_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone o.timezone)::date
  from public.organizations o
  where o.id = p_organization_id;
$$;
revoke all on function public.organization_local_date(uuid) from public, anon, authenticated;
grant execute on function public.organization_local_date(uuid) to service_role;

alter table public.membership_freezes
  add constraint membership_freezes_no_overlap
  exclude using gist (
    membership_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  );

create or replace function public.freeze_membership(
  p_organization_id uuid,
  p_membership_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  v_freeze_id uuid;
  v_days integer;
  v_today date;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception']::public.app_role[]) then
    raise exception 'not authorized';
  end if;
  v_today := public.organization_local_date(p_organization_id);
  if p_ends_on < p_starts_on then raise exception 'freeze end must be on or after start'; end if;
  if p_starts_on < v_today then raise exception 'a new freeze cannot start in the past'; end if;

  select * into v_membership from public.memberships
  where id=p_membership_id and organization_id=p_organization_id
  for update;
  if v_membership.id is null then raise exception 'membership not found'; end if;
  if v_membership.status <> 'active' then raise exception 'only active memberships can be frozen'; end if;
  if v_membership.ends_on is not null and p_starts_on > v_membership.ends_on then raise exception 'freeze cannot start after membership expiry'; end if;

  v_days := (p_ends_on - p_starts_on) + 1;
  insert into public.membership_freezes (organization_id,membership_id,starts_on,ends_on,reason,created_by)
  values (p_organization_id,p_membership_id,p_starts_on,p_ends_on,nullif(trim(p_reason),''),auth.uid())
  returning id into v_freeze_id;

  update public.memberships
     set ends_on = case when ends_on is null then null else ends_on + v_days end,
         frozen_until = greatest(coalesce(frozen_until,p_ends_on),p_ends_on),
         updated_at = now()
   where id=p_membership_id;

  insert into public.audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (p_organization_id,auth.uid(),'membership.frozen','membership',p_membership_id::text,
    jsonb_build_object('freeze_id',v_freeze_id,'starts_on',p_starts_on,'ends_on',p_ends_on,'extension_days',v_days));
  return v_freeze_id;
end;
$$;
revoke all on function public.freeze_membership(uuid,uuid,date,date,text) from public;
grant execute on function public.freeze_membership(uuid,uuid,date,date,text) to authenticated;

-- Replaces the original access decision with tenant-local date and freeze-range checks.
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
set search_path = public
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
  if not public.is_org_member(p_organization_id) then raise exception 'not authorized'; end if;
  v_today := public.organization_local_date(p_organization_id);
  if v_today is null then raise exception 'organization timezone could not be resolved'; end if;
  if not exists (select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and is_active) then raise exception 'invalid location'; end if;
  if not exists (select 1 from public.members where id=p_member_id and organization_id=p_organization_id and archived_at is null) then raise exception 'invalid member'; end if;

  select * into v_open from public.attendance_sessions
  where organization_id=p_organization_id and member_id=p_member_id and checked_out_at is null
  order by checked_in_at desc limit 1;

  v_direction := case
    when p_mode='check_in' then 'in'::public.access_direction
    when p_mode='check_out' then 'out'::public.access_direction
    when v_open.id is null then 'in'::public.access_direction
    else 'out'::public.access_direction end;

  if p_terminal_id is not null then
    select duplicate_window_seconds into v_duplicate_window from public.access_terminals
    where id=p_terminal_id and organization_id=p_organization_id and location_id=p_location_id and is_active;
  end if;

  select max(occurred_at) into v_recent_event from public.access_events
  where organization_id=p_organization_id and member_id=p_member_id and direction=v_direction and result='allowed';
  if v_recent_event is not null and v_recent_event > now() - make_interval(secs => v_duplicate_window) then
    insert into public.access_events (organization_id, location_id, member_id, attendance_session_id, credential_id, terminal_id, direction, result, method, actor_user_id, reason_code)
    values (p_organization_id,p_location_id,p_member_id,v_open.id,p_credential_id,p_terminal_id,v_direction,'ignored',p_method,auth.uid(),'duplicate_window');
    return jsonb_build_object('result','ignored','action',v_direction,'message','Duplicate scan ignored');
  end if;

  if v_direction='out' then
    if v_open.id is null then
      insert into public.access_events (organization_id, location_id, member_id, credential_id, terminal_id, direction, result, method, actor_user_id, reason_code)
      values (p_organization_id,p_location_id,p_member_id,p_credential_id,p_terminal_id,'out','denied',p_method,auth.uid(),'no_open_session');
      return jsonb_build_object('result','denied','action','out','message','No open visit to check out');
    end if;
    update public.attendance_sessions
      set checked_out_at=now(), check_out_method=p_method, check_out_terminal_id=p_terminal_id, checked_out_by=auth.uid(), updated_at=now()
      where id=v_open.id;
    insert into public.access_events (organization_id, location_id, member_id, attendance_session_id, credential_id, terminal_id, direction, result, method, actor_user_id)
      values (p_organization_id,p_location_id,p_member_id,v_open.id,p_credential_id,p_terminal_id,'out','allowed',p_method,auth.uid());
    return jsonb_build_object('result','allowed','action','out','session_id',v_open.id,'message','Check-out recorded');
  end if;

  if v_open.id is not null then
    insert into public.access_events (organization_id, location_id, member_id, attendance_session_id, credential_id, terminal_id, direction, result, method, actor_user_id, reason_code)
    values (p_organization_id,p_location_id,p_member_id,v_open.id,p_credential_id,p_terminal_id,'in','ignored',p_method,auth.uid(),'already_inside');
    return jsonb_build_object('result','ignored','action','in','message','Member is already checked in');
  end if;

  select ms.* into v_membership
  from public.memberships ms
  where ms.organization_id=p_organization_id and ms.member_id=p_member_id
    and ms.status='active'
    and ms.starts_on <= v_today
    and (ms.ends_on is null or ms.ends_on >= v_today)
    and (ms.visits_remaining is null or ms.visits_remaining > 0)
    and not exists (
      select 1 from public.membership_freezes mf
      where mf.membership_id=ms.id and v_today between mf.starts_on and mf.ends_on
    )
  order by coalesce(ms.ends_on, '9999-12-31'::date) desc
  limit 1 for update;

  if v_membership.id is null then
    insert into public.access_events (organization_id, location_id, member_id, credential_id, terminal_id, direction, result, method, actor_user_id, reason_code)
    values (p_organization_id,p_location_id,p_member_id,p_credential_id,p_terminal_id,'in','denied',p_method,auth.uid(),'no_valid_membership');
    return jsonb_build_object('result','denied','action','in','message','No valid membership or membership is frozen');
  end if;

  insert into public.attendance_sessions (organization_id, location_id, member_id, membership_id, check_in_method, check_in_terminal_id, checked_in_by)
  values (p_organization_id,p_location_id,p_member_id,v_membership.id,p_method,p_terminal_id,auth.uid())
  returning id into v_session_id;

  if v_membership.visits_remaining is not null then
    update public.memberships set visits_remaining=visits_remaining-1, updated_at=now() where id=v_membership.id;
  end if;

  insert into public.access_events (organization_id, location_id, member_id, attendance_session_id, credential_id, terminal_id, direction, result, method, actor_user_id)
  values (p_organization_id,p_location_id,p_member_id,v_session_id,p_credential_id,p_terminal_id,'in','allowed',p_method,auth.uid());

  return jsonb_build_object('result','allowed','action','in','session_id',v_session_id,'membership_id',v_membership.id,'message','Check-in recorded');
end;
$$;

-- Prevent accidental overpayment when a payment is explicitly applied to a membership.
create or replace function public.record_payment(
  p_organization_id uuid,
  p_location_id uuid,
  p_member_id uuid,
  p_membership_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_payment_method text,
  p_external_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_membership public.memberships%rowtype;
  v_paid bigint;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception','accountant']::public.app_role[]) then raise exception 'not authorized'; end if;
  if p_amount_minor <= 0 then raise exception 'payment amount must be greater than zero'; end if;

  if p_membership_id is not null then
    select * into v_membership from public.memberships
    where id=p_membership_id and organization_id=p_organization_id and member_id=p_member_id
    for update;
    if v_membership.id is null then raise exception 'membership does not match member'; end if;
    if upper(p_currency) <> upper(v_membership.currency) then raise exception 'membership payment currency must match membership currency'; end if;
    select coalesce(sum(amount_minor),0) into v_paid from public.payments
      where organization_id=p_organization_id and membership_id=p_membership_id and status='paid';
    if v_paid + p_amount_minor > v_membership.price_minor then raise exception 'payment exceeds remaining membership balance'; end if;
  end if;

  insert into public.payments (organization_id,location_id,member_id,membership_id,amount_minor,currency,payment_method,status,external_reference,note,created_by)
  values (p_organization_id,p_location_id,p_member_id,p_membership_id,p_amount_minor,upper(p_currency),p_payment_method,'paid',nullif(trim(p_external_reference),''),nullif(trim(p_note),''),auth.uid())
  returning id into v_id;
  insert into public.audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (p_organization_id,auth.uid(),'payment.recorded','payment',v_id::text,jsonb_build_object('member_id',p_member_id,'membership_id',p_membership_id,'amount_minor',p_amount_minor,'currency',upper(p_currency)));
  return v_id;
end;
$$;

create or replace function public.expire_stale_memberships(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_today date;
begin
  v_today := public.organization_local_date(p_organization_id);
  update public.memberships
     set status='expired', updated_at=now()
   where organization_id=p_organization_id
     and status='active'
     and ((ends_on is not null and ends_on < v_today) or visits_remaining = 0);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.expire_stale_memberships(uuid) from public, anon, authenticated;
grant execute on function public.expire_stale_memberships(uuid) to service_role;


-- Credential lookup is security-definer because raw HMACs are not exposed through table reads,
-- but the caller must still belong to the requested tenant.
create or replace function public.lookup_access_credential(p_organization_id uuid, p_token_hmac text)
returns table (credential_id uuid, member_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.member_id
  from public.access_credentials c
  where public.is_org_member(p_organization_id)
    and c.organization_id = p_organization_id
    and c.token_hmac = p_token_hmac
    and c.is_active = true
  limit 1;
$$;
revoke all on function public.lookup_access_credential(uuid,text) from public, anon;
grant execute on function public.lookup_access_credential(uuid,text) to authenticated;
