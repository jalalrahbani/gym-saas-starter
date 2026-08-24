-- Operational core: onboarding, class scheduling, atomic memberships/payments,
-- access processing, staff invitations support, and audit-safe workflows.

-- Keep profile creation synchronized with Auth without exposing auth.users to the client.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Group-class module.
create table public.group_classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  description text,
  capacity integer not null default 12 check (capacity > 0 and capacity <= 500),
  duration_minutes integer not null default 60 check (duration_minutes between 10 and 360),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_id uuid not null references public.group_classes(id) on delete restrict,
  location_id uuid references public.locations(id) on delete set null,
  trainer_user_id uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0 and capacity <= 500),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.class_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'booked' check (status in ('booked','attended','cancelled','no_show','waitlisted')),
  booked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_session_id, member_id)
);

create index class_sessions_org_starts_idx on public.class_sessions (organization_id, starts_at);
create index class_bookings_org_session_idx on public.class_bookings (organization_id, class_session_id, status);

alter table public.group_classes enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_bookings enable row level security;

revoke all on table public.group_classes, public.class_sessions, public.class_bookings from anon;
revoke all on table public.group_classes, public.class_sessions, public.class_bookings from authenticated;
grant select, insert, update on public.group_classes, public.class_sessions, public.class_bookings to authenticated;

create policy group_classes_select on public.group_classes for select to authenticated
  using (public.is_org_member(organization_id));
create policy group_classes_write on public.group_classes for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']::public.app_role[]));

create policy class_sessions_select on public.class_sessions for select to authenticated
  using (public.is_org_member(organization_id));
create policy class_sessions_write on public.class_sessions for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager','reception','trainer']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','reception','trainer']::public.app_role[]));

create policy class_bookings_select on public.class_bookings for select to authenticated
  using (public.is_org_member(organization_id));
create policy class_bookings_write on public.class_bookings for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager','reception','trainer']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','reception','trainer']::public.app_role[]));

-- Create the first organization/location/owner membership in one transaction.
create or replace function public.create_organization(
  p_name text,
  p_country_code text default 'LB',
  p_timezone text default 'Asia/Beirut',
  p_base_currency text default 'USD',
  p_location_name text default 'Main Branch'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_location_id uuid;
  v_slug text;
  v_suffix integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'organization name is required';
  end if;
  if exists (select 1 from public.organization_members where user_id = v_user_id and is_active) then
    raise exception 'user already belongs to an organization';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'gym'; end if;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || v_suffix::text;
  end loop;

  insert into public.organizations (name, slug, country_code, timezone, base_currency)
  values (trim(p_name), v_slug, upper(trim(p_country_code)), p_timezone, upper(trim(p_base_currency)))
  returning id into v_org_id;

  insert into public.locations (organization_id, name, timezone)
  values (v_org_id, coalesce(nullif(trim(p_location_name), ''), 'Main Branch'), p_timezone)
  returning id into v_location_id;

  insert into public.organization_members (organization_id, user_id, role, location_id)
  values (v_org_id, v_user_id, 'owner', v_location_id);

  insert into public.saas_subscriptions (organization_id, plan_code, status, trial_ends_at)
  values (v_org_id, 'trial', 'trialing', now() + interval '14 days');

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (v_org_id, v_user_id, 'organization.created', 'organization', v_org_id::text,
          jsonb_build_object('name', trim(p_name), 'location_id', v_location_id));

  return v_org_id;
end;
$$;

revoke all on function public.create_organization(text,text,text,text,text) from public;
grant execute on function public.create_organization(text,text,text,text,text) to authenticated;

-- Atomic membership enrollment / renewal with optional initial payment.
create or replace function public.enroll_membership(
  p_organization_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_starts_on date,
  p_amount_paid_minor bigint default 0,
  p_payment_method text default 'cash',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans%rowtype;
  v_membership_id uuid;
  v_payment_id uuid;
  v_ends_on date;
  v_user_id uuid := auth.uid();
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception','accountant']::public.app_role[]) then
    raise exception 'not authorized';
  end if;
  if p_amount_paid_minor < 0 then raise exception 'payment cannot be negative'; end if;
  if not exists (select 1 from public.members where id = p_member_id and organization_id = p_organization_id and archived_at is null) then
    raise exception 'invalid member';
  end if;

  select * into v_plan from public.membership_plans
  where id = p_plan_id and organization_id = p_organization_id and is_active;
  if v_plan.id is null then raise exception 'invalid membership plan'; end if;
  if p_amount_paid_minor > v_plan.price_minor then raise exception 'initial payment exceeds membership price'; end if;

  v_ends_on := case when v_plan.duration_days is null then null
                    else p_starts_on + (v_plan.duration_days - 1) end;

  insert into public.memberships (
    organization_id, member_id, plan_id, location_id, status, starts_on, ends_on,
    visits_remaining, price_minor, currency, created_by
  ) values (
    p_organization_id, p_member_id, p_plan_id, v_plan.location_id, 'active', p_starts_on, v_ends_on,
    v_plan.included_visits, v_plan.price_minor, v_plan.currency, v_user_id
  ) returning id into v_membership_id;

  if p_amount_paid_minor > 0 then
    insert into public.payments (
      organization_id, location_id, member_id, membership_id, amount_minor, currency,
      payment_method, status, note, created_by
    ) values (
      p_organization_id, v_plan.location_id, p_member_id, v_membership_id, p_amount_paid_minor,
      v_plan.currency, p_payment_method, 'paid', p_note, v_user_id
    ) returning id into v_payment_id;
  end if;

  update public.members set status = 'active', updated_at = now() where id = p_member_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_organization_id, v_user_id, 'membership.enrolled', 'membership', v_membership_id::text,
          jsonb_build_object('member_id', p_member_id, 'plan_id', p_plan_id, 'payment_id', v_payment_id));

  return jsonb_build_object('membership_id', v_membership_id, 'payment_id', v_payment_id);
end;
$$;

revoke all on function public.enroll_membership(uuid,uuid,uuid,date,bigint,text,text) from public;
grant execute on function public.enroll_membership(uuid,uuid,uuid,date,bigint,text,text) to authenticated;

-- Complete a PT session and deduct exactly one package credit atomically.
create or replace function public.complete_pt_session(p_organization_id uuid, p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.pt_sessions%rowtype;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception','trainer']::public.app_role[]) then
    raise exception 'not authorized';
  end if;
  select * into v_session from public.pt_sessions
  where id = p_session_id and organization_id = p_organization_id for update;
  if v_session.id is null then raise exception 'session not found'; end if;
  if v_session.status = 'completed' then return; end if;
  if v_session.status <> 'scheduled' then raise exception 'only scheduled sessions can be completed'; end if;

  if v_session.pt_package_id is not null then
    update public.pt_packages
      set sessions_remaining = sessions_remaining - 1
    where id = v_session.pt_package_id
      and organization_id = p_organization_id
      and sessions_remaining > 0;
    if not found then raise exception 'PT package has no remaining sessions'; end if;
  end if;

  update public.pt_sessions set status = 'completed' where id = p_session_id;
end;
$$;

revoke all on function public.complete_pt_session(uuid,uuid) from public;
grant execute on function public.complete_pt_session(uuid,uuid) to authenticated;

-- Secure lookup/assignment helpers keep raw access credentials outside Data API reads.
create or replace function public.lookup_access_credential(p_organization_id uuid, p_token_hmac text)
returns table (credential_id uuid, member_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.member_id
  from public.access_credentials c
  where c.organization_id = p_organization_id
    and c.token_hmac = p_token_hmac
    and c.is_active = true
  limit 1;
$$;

create or replace function public.assign_access_credential(
  p_organization_id uuid,
  p_member_id uuid,
  p_credential_type public.access_credential_type,
  p_token_hmac text,
  p_last_four text,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception']::public.app_role[]) then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.members where id = p_member_id and organization_id = p_organization_id) then
    raise exception 'invalid member';
  end if;
  insert into public.access_credentials (organization_id, member_id, credential_type, token_hmac, last_four, label, created_by)
  values (p_organization_id, p_member_id, p_credential_type, p_token_hmac, p_last_four, nullif(trim(p_label), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.lookup_access_credential(uuid,text) from public;
revoke all on function public.assign_access_credential(uuid,uuid,public.access_credential_type,text,text,text) from public;
grant execute on function public.lookup_access_credential(uuid,text) to authenticated;
grant execute on function public.assign_access_credential(uuid,uuid,public.access_credential_type,text,text,text) to authenticated;

-- One access decision function: validates membership, handles duplicate input, toggles visits,
-- decrements visit-packs once, and appends the technical event trail atomically.
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
begin
  if not public.is_org_member(p_organization_id) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.locations where id=p_location_id and organization_id=p_organization_id and is_active) then
    raise exception 'invalid location';
  end if;
  if not exists (select 1 from public.members where id=p_member_id and organization_id=p_organization_id and archived_at is null) then
    raise exception 'invalid member';
  end if;

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
    and ms.starts_on <= current_date
    and (ms.ends_on is null or ms.ends_on >= current_date)
    and (ms.frozen_until is null or ms.frozen_until < current_date)
    and (ms.visits_remaining is null or ms.visits_remaining > 0)
  order by coalesce(ms.ends_on, '9999-12-31'::date) desc
  limit 1 for update;

  if v_membership.id is null then
    insert into public.access_events (organization_id, location_id, member_id, credential_id, terminal_id, direction, result, method, actor_user_id, reason_code)
    values (p_organization_id,p_location_id,p_member_id,p_credential_id,p_terminal_id,'in','denied',p_method,auth.uid(),'no_valid_membership');
    return jsonb_build_object('result','denied','action','in','message','No valid membership');
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

revoke all on function public.process_member_access(uuid,uuid,uuid,public.access_terminal_mode,text,uuid,uuid) from public;
grant execute on function public.process_member_access(uuid,uuid,uuid,public.access_terminal_mode,text,uuid,uuid) to authenticated;
