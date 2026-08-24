-- Unified access-card and attendance tracking.
-- public.check_ins from 0001 is retained only for migration compatibility; new code uses attendance_sessions/access_events.
-- The browser/terminal accepts card/QR/barcode input; sensitive credential matching
-- should happen server-side using an HMAC of the raw token.

create type public.access_credential_type as enum ('magstripe','rfid','nfc','barcode','qr');
create type public.access_terminal_mode as enum ('check_in','check_out','toggle');
create type public.access_direction as enum ('in','out');
create type public.access_event_result as enum ('allowed','denied','ignored');

create table public.access_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  credential_type public.access_credential_type not null,
  -- Store only a server-generated HMAC, never the raw swipe/tap identifier.
  token_hmac text not null,
  last_four text,
  label text,
  is_active boolean not null default true,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, token_hmac),
  check ((is_active and revoked_at is null) or (not is_active))
);

create table public.access_terminals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  mode public.access_terminal_mode not null default 'toggle',
  duplicate_window_seconds integer not null default 8 check (duplicate_window_seconds between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, name)
);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  membership_id uuid references public.memberships(id) on delete set null,
  check_in_method text not null check (check_in_method in ('manual','credential','qr','barcode','member_number','phone')),
  check_out_method text check (check_out_method is null or check_out_method in ('manual','credential','qr','barcode','member_number','phone','auto_close')),
  check_in_terminal_id uuid references public.access_terminals(id) on delete set null,
  check_out_terminal_id uuid references public.access_terminals(id) on delete set null,
  checked_in_by uuid references auth.users(id) on delete set null,
  checked_out_by uuid references auth.users(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  overridden boolean not null default false,
  override_reason text,
  forced_closed boolean not null default false,
  forced_close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (checked_out_at is null or checked_out_at >= checked_in_at),
  check (not overridden or override_reason is not null),
  check (not forced_closed or forced_close_reason is not null)
);

-- A member can only have one open visit at a time within an organization.
create unique index attendance_one_open_session_per_member
  on public.attendance_sessions (organization_id, member_id)
  where checked_out_at is null;

create table public.access_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  member_id uuid references public.members(id) on delete set null,
  attendance_session_id uuid references public.attendance_sessions(id) on delete set null,
  credential_id uuid references public.access_credentials(id) on delete set null,
  terminal_id uuid references public.access_terminals(id) on delete set null,
  direction public.access_direction not null,
  result public.access_event_result not null,
  method text not null check (method in ('manual','credential','qr','barcode','member_number','phone','auto_close')),
  reason_code text,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index access_credentials_org_member_idx on public.access_credentials (organization_id, member_id, is_active);
create index attendance_sessions_org_in_idx on public.attendance_sessions (organization_id, checked_in_at desc);
create index attendance_sessions_member_idx on public.attendance_sessions (organization_id, member_id, checked_in_at desc);
create index attendance_sessions_open_idx on public.attendance_sessions (organization_id, location_id, checked_in_at desc) where checked_out_at is null;
create index access_events_org_time_idx on public.access_events (organization_id, occurred_at desc);
create index access_events_member_time_idx on public.access_events (organization_id, member_id, occurred_at desc);

alter table public.access_credentials enable row level security;
alter table public.access_terminals enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.access_events enable row level security;

revoke all on table public.access_credentials, public.access_terminals, public.attendance_sessions, public.access_events from anon;
revoke all on table public.access_credentials, public.access_terminals, public.attendance_sessions, public.access_events from authenticated;

-- Credential HMACs are intentionally NOT exposed through the Data API.
grant select (id, organization_id, member_id, credential_type, last_four, label, is_active, issued_at, revoked_at, created_at, updated_at)
  on public.access_credentials to authenticated;
grant select, insert, update on public.access_terminals to authenticated;
grant select on public.attendance_sessions to authenticated;
grant select on public.access_events to authenticated;

create policy access_credentials_select on public.access_credentials for select to authenticated
  using (public.is_org_member(organization_id));

create policy access_terminals_select on public.access_terminals for select to authenticated
  using (public.is_org_member(organization_id));
create policy access_terminals_insert on public.access_terminals for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','manager']::public.app_role[]));
create policy access_terminals_update on public.access_terminals for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']::public.app_role[]));

create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using (public.is_org_member(organization_id));

create policy access_events_select on public.access_events for select to authenticated
  using (public.is_org_member(organization_id));
-- access_events are append-only and attendance session writes go through RPC/server code.

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
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not authorized for organization';
  end if;

  if p_method not in ('manual','credential','qr','barcode','member_number','phone') then
    raise exception 'invalid check-in method';
  end if;

  if p_overridden and coalesce(trim(p_override_reason), '') = '' then
    raise exception 'override requires a reason';
  end if;

  if p_overridden and not public.has_org_role(p_organization_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'manager authorization required for access override';
  end if;

  if not exists (select 1 from public.members m where m.id = p_member_id and m.organization_id = p_organization_id) then
    raise exception 'member does not belong to organization';
  end if;

  if not exists (select 1 from public.locations l where l.id = p_location_id and l.organization_id = p_organization_id and l.is_active) then
    raise exception 'invalid location';
  end if;

  if p_membership_id is not null and not exists (
    select 1 from public.memberships ms
    where ms.id = p_membership_id and ms.organization_id = p_organization_id and ms.member_id = p_member_id
  ) then
    raise exception 'invalid membership';
  end if;

  if p_terminal_id is not null and not exists (
    select 1 from public.access_terminals t
    where t.id = p_terminal_id and t.organization_id = p_organization_id and t.location_id = p_location_id
      and t.is_active and t.mode in ('check_in','toggle')
  ) then
    raise exception 'invalid check-in terminal';
  end if;

  if p_credential_id is not null and not exists (
    select 1 from public.access_credentials c
    where c.id = p_credential_id and c.organization_id = p_organization_id and c.member_id = p_member_id and c.is_active
  ) then
    raise exception 'invalid credential';
  end if;

  insert into public.attendance_sessions (
    organization_id, location_id, member_id, membership_id, check_in_method,
    check_in_terminal_id, checked_in_by, overridden, override_reason
  ) values (
    p_organization_id, p_location_id, p_member_id, p_membership_id, p_method,
    p_terminal_id, auth.uid(), p_overridden, case when p_overridden then p_override_reason else null end
  ) returning id into v_session_id;

  insert into public.access_events (
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
set search_path = public
as $$
declare
  v_session public.attendance_sessions%rowtype;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not authorized for organization';
  end if;

  if p_method not in ('manual','credential','qr','barcode','member_number','phone','auto_close') then
    raise exception 'invalid check-out method';
  end if;

  if p_forced and coalesce(trim(p_forced_reason), '') = '' then
    raise exception 'forced close requires a reason';
  end if;

  select * into v_session
  from public.attendance_sessions s
  where s.organization_id = p_organization_id
    and s.member_id = p_member_id
    and s.checked_out_at is null
  order by s.checked_in_at desc
  limit 1
  for update;

  if v_session.id is null then
    raise exception 'member has no open attendance session';
  end if;

  if p_terminal_id is not null and not exists (
    select 1 from public.access_terminals t
    where t.id = p_terminal_id and t.organization_id = p_organization_id
      and t.location_id = v_session.location_id and t.is_active and t.mode in ('check_out','toggle')
  ) then
    raise exception 'invalid check-out terminal';
  end if;

  if p_credential_id is not null and not exists (
    select 1 from public.access_credentials c
    where c.id = p_credential_id and c.organization_id = p_organization_id and c.member_id = p_member_id and c.is_active
  ) then
    raise exception 'invalid credential';
  end if;

  update public.attendance_sessions
  set checked_out_at = now(),
      check_out_method = p_method,
      check_out_terminal_id = p_terminal_id,
      checked_out_by = auth.uid(),
      forced_closed = p_forced,
      forced_close_reason = case when p_forced then p_forced_reason else null end,
      updated_at = now()
  where id = v_session.id;

  insert into public.access_events (
    organization_id, location_id, member_id, attendance_session_id, credential_id,
    terminal_id, direction, result, method, actor_user_id,
    reason_code
  ) values (
    p_organization_id, v_session.location_id, p_member_id, v_session.id, p_credential_id,
    p_terminal_id, 'out', 'allowed', p_method, auth.uid(),
    case when p_forced then 'forced_close' else null end
  );

  return v_session.id;
end;
$$;

revoke all on function public.start_attendance_session(uuid,uuid,uuid,uuid,text,uuid,uuid,boolean,text) from public;
revoke all on function public.close_attendance_session(uuid,uuid,text,uuid,uuid,boolean,text) from public;
grant execute on function public.start_attendance_session(uuid,uuid,uuid,uuid,text,uuid,uuid,boolean,text) to authenticated;
grant execute on function public.close_attendance_session(uuid,uuid,text,uuid,uuid,boolean,text) to authenticated;
