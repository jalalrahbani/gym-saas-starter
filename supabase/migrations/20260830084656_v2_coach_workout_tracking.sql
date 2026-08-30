-- V2 Phase 1: coach daily log, member PT history, workout programming,
-- weekly muscle targets, detailed exercise history, and atomic workout completion.
-- Extends the certified V1 PT transaction model without changing V1 production.

-- ---------------------------------------------------------------------------
-- 1. Extend PT packages so a package can be tied to a gym membership period.
-- ---------------------------------------------------------------------------

alter table public.pt_packages
  add column if not exists membership_id uuid references public.memberships(id) on delete set null,
  add column if not exists starts_on date,
  add column if not exists label text,
  add column if not exists notes text;

create index if not exists pt_packages_org_member_membership_idx
  on public.pt_packages (organization_id, member_id, membership_id);

create index if not exists pt_packages_org_trainer_remaining_idx
  on public.pt_packages (organization_id, trainer_user_id, sessions_remaining)
  where sessions_remaining > 0;

create or replace function public.validate_pt_package_org_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.members m
    where m.id = new.member_id
      and m.organization_id = new.organization_id
  ) then
    raise exception 'PT member belongs to another organization';
  end if;

  if new.trainer_user_id is not null and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = new.organization_id
      and om.user_id = new.trainer_user_id
      and om.is_active
      and om.role in ('owner','admin','manager','trainer')
  ) then
    raise exception 'PT trainer is not active in this organization';
  end if;

  if new.membership_id is not null and not exists (
    select 1
    from public.memberships ms
    where ms.id = new.membership_id
      and ms.organization_id = new.organization_id
      and ms.member_id = new.member_id
  ) then
    raise exception 'PT package membership does not match member/organization';
  end if;

  if new.starts_on is not null
     and new.expires_on is not null
     and new.expires_on < new.starts_on then
    raise exception 'PT package expiry cannot precede its start date';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Organization muscle library.
-- Each gym gets defaults but can add its own muscle groups later.
-- ---------------------------------------------------------------------------

create table public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  body_region text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index muscle_groups_org_active_idx
  on public.muscle_groups (organization_id, is_active, sort_order, name);

alter table public.muscle_groups enable row level security;

revoke all on table public.muscle_groups from anon, authenticated;
grant select, insert, update on table public.muscle_groups to authenticated;

create policy muscle_groups_select
on public.muscle_groups
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

create policy muscle_groups_insert
on public.muscle_groups
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  )
);

create policy muscle_groups_update
on public.muscle_groups
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  )
);

create or replace function private.seed_default_muscle_groups(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.muscle_groups
    (organization_id, name, slug, body_region, sort_order)
  values
    (p_organization_id, 'Chest',       'chest',       'Upper body',  10),
    (p_organization_id, 'Back',        'back',        'Upper body',  20),
    (p_organization_id, 'Shoulders',   'shoulders',   'Upper body',  30),
    (p_organization_id, 'Biceps',      'biceps',      'Arms',        40),
    (p_organization_id, 'Triceps',     'triceps',     'Arms',        50),
    (p_organization_id, 'Forearms',    'forearms',    'Arms',        60),
    (p_organization_id, 'Quadriceps',  'quadriceps',  'Lower body',  70),
    (p_organization_id, 'Hamstrings',  'hamstrings',  'Lower body',  80),
    (p_organization_id, 'Glutes',      'glutes',      'Lower body',  90),
    (p_organization_id, 'Calves',      'calves',      'Lower body', 100),
    (p_organization_id, 'Core',        'core',        'Core',       110),
    (p_organization_id, 'Full Body',   'full-body',   'Full body',  120)
  on conflict (organization_id, slug) do nothing;
end;
$$;

revoke all on function private.seed_default_muscle_groups(uuid)
from public, anon, authenticated;
grant execute on function private.seed_default_muscle_groups(uuid) to service_role;

create or replace function private.seed_default_muscle_groups_on_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_muscle_groups(new.id);
  return new;
end;
$$;

revoke all on function private.seed_default_muscle_groups_on_org()
from public, anon, authenticated;
grant execute on function private.seed_default_muscle_groups_on_org() to service_role;

drop trigger if exists organizations_seed_default_muscle_groups
on public.organizations;

create trigger organizations_seed_default_muscle_groups
after insert on public.organizations
for each row execute function private.seed_default_muscle_groups_on_org();

-- Safe backfill if this migration is ever applied to an environment that already has gyms.
do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform private.seed_default_muscle_groups(r.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Member training programs and weekly muscle targets.
-- Historical programs remain in place so old weeks stay auditable.
-- ---------------------------------------------------------------------------

create table public.member_training_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  trainer_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  starts_on date not null,
  ends_on date,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.member_program_muscle_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.member_training_programs(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups(id) on delete restrict,
  target_sessions_per_week integer not null check (target_sessions_per_week between 0 and 14),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, muscle_group_id)
);

create index member_training_programs_member_dates_idx
  on public.member_training_programs
  (organization_id, member_id, starts_on desc, ends_on);

create index member_training_programs_trainer_idx
  on public.member_training_programs
  (organization_id, trainer_user_id, starts_on desc);

create index member_program_targets_member_idx
  on public.member_program_muscle_targets
  (organization_id, member_id, program_id);

alter table public.member_training_programs enable row level security;
alter table public.member_program_muscle_targets enable row level security;

revoke all on table
  public.member_training_programs,
  public.member_program_muscle_targets
from anon, authenticated;

grant select on table
  public.member_training_programs,
  public.member_program_muscle_targets
to authenticated;

create policy member_training_programs_select
on public.member_training_programs
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);

create policy member_program_muscle_targets_select
on public.member_program_muscle_targets
for select to authenticated
using (
  exists (
    select 1
    from public.member_training_programs p
    where p.id = member_program_muscle_targets.program_id
      and p.organization_id = member_program_muscle_targets.organization_id
      and (
        public.has_org_role(
          p.organization_id,
          array['owner','admin','manager']::public.app_role[]
        )
        or (
          p.trainer_user_id = (select auth.uid())
          and public.has_org_role(
            p.organization_id,
            array['trainer']::public.app_role[]
          )
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- 4. Exercise library and immutable exercise-name snapshots in session history.
-- ---------------------------------------------------------------------------

create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  primary_muscle_group_id uuid references public.muscle_groups(id) on delete set null,
  instructions text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index exercise_library_org_active_idx
  on public.exercise_library (organization_id, is_active, name);

alter table public.exercise_library enable row level security;

revoke all on table public.exercise_library from anon, authenticated;
grant select, insert, update on table public.exercise_library to authenticated;

create policy exercise_library_select
on public.exercise_library
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

create policy exercise_library_insert
on public.exercise_library
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  )
  and (created_by is null or created_by = (select auth.uid()))
);

create policy exercise_library_update
on public.exercise_library
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  )
);

-- ---------------------------------------------------------------------------
-- 5. Per-session workout log, muscles trained, exercises, and sets.
-- ---------------------------------------------------------------------------

create table public.pt_session_workouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pt_session_id uuid not null references public.pt_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  trainer_user_id uuid not null references auth.users(id) on delete restrict,
  program_id uuid references public.member_training_programs(id) on delete set null,
  session_goal text,
  coach_notes text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pt_session_id)
);

create table public.pt_session_muscles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pt_session_id uuid not null references public.pt_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups(id) on delete restrict,
  is_planned boolean not null default false,
  is_trained boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pt_session_id, muscle_group_id),
  check (is_planned or is_trained)
);

create table public.pt_session_exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pt_session_id uuid not null references public.pt_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  position integer not null default 1 check (position > 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.pt_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_exercise_id uuid not null references public.pt_session_exercises(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  reps integer check (reps is null or reps >= 0),
  weight_kg numeric(8,2) check (weight_kg is null or weight_kg >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  distance_meters numeric(10,2) check (distance_meters is null or distance_meters >= 0),
  rpe numeric(3,1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  completed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (session_exercise_id, set_number)
);

create index pt_session_workouts_member_idx
  on public.pt_session_workouts
  (organization_id, member_id, completed_at desc);

create index pt_session_workouts_trainer_idx
  on public.pt_session_workouts
  (organization_id, trainer_user_id, completed_at desc);

create index pt_session_muscles_member_idx
  on public.pt_session_muscles
  (organization_id, member_id, muscle_group_id, is_trained);

create index pt_session_exercises_session_idx
  on public.pt_session_exercises
  (organization_id, pt_session_id, position);

create index pt_exercise_sets_exercise_idx
  on public.pt_exercise_sets
  (organization_id, session_exercise_id, set_number);

alter table public.pt_session_workouts enable row level security;
alter table public.pt_session_muscles enable row level security;
alter table public.pt_session_exercises enable row level security;
alter table public.pt_exercise_sets enable row level security;

revoke all on table
  public.pt_session_workouts,
  public.pt_session_muscles,
  public.pt_session_exercises,
  public.pt_exercise_sets
from anon, authenticated;

grant select on table
  public.pt_session_workouts,
  public.pt_session_muscles,
  public.pt_session_exercises,
  public.pt_exercise_sets
to authenticated;

create policy pt_session_workouts_select
on public.pt_session_workouts
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);

create policy pt_session_muscles_select
on public.pt_session_muscles
for select to authenticated
using (
  exists (
    select 1
    from public.pt_sessions ps
    where ps.id = pt_session_muscles.pt_session_id
      and ps.organization_id = pt_session_muscles.organization_id
      and (
        public.has_org_role(
          ps.organization_id,
          array['owner','admin','manager']::public.app_role[]
        )
        or (
          ps.trainer_user_id = (select auth.uid())
          and public.has_org_role(
            ps.organization_id,
            array['trainer']::public.app_role[]
          )
        )
      )
  )
);

create policy pt_session_exercises_select
on public.pt_session_exercises
for select to authenticated
using (
  exists (
    select 1
    from public.pt_sessions ps
    where ps.id = pt_session_exercises.pt_session_id
      and ps.organization_id = pt_session_exercises.organization_id
      and (
        public.has_org_role(
          ps.organization_id,
          array['owner','admin','manager']::public.app_role[]
        )
        or (
          ps.trainer_user_id = (select auth.uid())
          and public.has_org_role(
            ps.organization_id,
            array['trainer']::public.app_role[]
          )
        )
      )
  )
);

create policy pt_exercise_sets_select
on public.pt_exercise_sets
for select to authenticated
using (
  exists (
    select 1
    from public.pt_session_exercises se
    join public.pt_sessions ps
      on ps.id = se.pt_session_id
     and ps.organization_id = se.organization_id
    where se.id = pt_exercise_sets.session_exercise_id
      and se.organization_id = pt_exercise_sets.organization_id
      and (
        public.has_org_role(
          ps.organization_id,
          array['owner','admin','manager']::public.app_role[]
        )
        or (
          ps.trainer_user_id = (select auth.uid())
          and public.has_org_role(
            ps.organization_id,
            array['trainer']::public.app_role[]
          )
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- 6. V2 PT package creation with membership linkage and a clear package period.
-- ---------------------------------------------------------------------------

create or replace function public.create_pt_package_v2_idempotent(
  p_organization_id uuid,
  p_member_id uuid,
  p_trainer_user_id uuid,
  p_membership_id uuid,
  p_label text,
  p_sessions integer,
  p_starts_on date,
  p_expires_on date,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_hash text;
  v_replay jsonb;
  v_package_id uuid;
  v_start date;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  ) then
    raise exception 'not authorized';
  end if;

  if p_sessions <= 0 then
    raise exception 'sessions must be greater than zero';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.organization_id = p_organization_id
      and m.archived_at is null
  ) then
    raise exception 'invalid member';
  end if;

  if p_trainer_user_id is not null and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_trainer_user_id
      and om.is_active
      and om.role in ('owner','admin','manager','trainer')
  ) then
    raise exception 'invalid trainer';
  end if;

  if p_membership_id is not null and not exists (
    select 1
    from public.memberships ms
    where ms.id = p_membership_id
      and ms.organization_id = p_organization_id
      and ms.member_id = p_member_id
  ) then
    raise exception 'membership does not match member';
  end if;

  v_start := coalesce(
    p_starts_on,
    public.organization_local_date(p_organization_id)
  );

  if p_expires_on is not null and p_expires_on < v_start then
    raise exception 'PT package expiry cannot precede its start date';
  end if;

  v_hash := md5(jsonb_build_object(
    'member_id', p_member_id,
    'trainer_user_id', p_trainer_user_id,
    'membership_id', p_membership_id,
    'label', nullif(trim(p_label), ''),
    'sessions', p_sessions,
    'starts_on', v_start,
    'expires_on', p_expires_on,
    'notes', nullif(trim(p_notes), '')
  )::text);

  v_replay := private.idempotency_replay(
    p_organization_id,
    'pt_package.v2.create',
    p_idempotency_key,
    v_hash
  );

  if v_replay is not null then
    return (v_replay ->> 'package_id')::uuid;
  end if;

  insert into public.pt_packages (
    organization_id,
    member_id,
    trainer_user_id,
    membership_id,
    label,
    sessions_purchased,
    sessions_remaining,
    starts_on,
    expires_on,
    notes
  ) values (
    p_organization_id,
    p_member_id,
    p_trainer_user_id,
    p_membership_id,
    nullif(trim(p_label), ''),
    p_sessions,
    p_sessions,
    v_start,
    p_expires_on,
    nullif(trim(p_notes), '')
  )
  returning id into v_package_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    auth.uid(),
    'pt_package.v2_created',
    'pt_package',
    v_package_id::text,
    jsonb_build_object(
      'member_id', p_member_id,
      'trainer_user_id', p_trainer_user_id,
      'membership_id', p_membership_id,
      'sessions', p_sessions,
      'starts_on', v_start,
      'expires_on', p_expires_on
    )
  );

  perform private.idempotency_store(
    p_organization_id,
    'pt_package.v2.create',
    p_idempotency_key,
    v_hash,
    jsonb_build_object('package_id', v_package_id)
  );

  return v_package_id;
end;
$$;

revoke all on function public.create_pt_package_v2_idempotent(
  uuid,uuid,uuid,uuid,text,integer,date,date,text,uuid
) from public, anon;

grant execute on function public.create_pt_package_v2_idempotent(
  uuid,uuid,uuid,uuid,text,integer,date,date,text,uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Create an auditable member training program with weekly muscle targets.
-- Targets input:
-- [
--   {"muscle_group_id":"<uuid>","target_sessions_per_week":2},
--   ...
-- ]
-- ---------------------------------------------------------------------------

create or replace function public.create_training_program_idempotent(
  p_organization_id uuid,
  p_member_id uuid,
  p_trainer_user_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_notes text,
  p_targets jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_hash text;
  v_replay jsonb;
  v_program_id uuid;
  v_target jsonb;
  v_muscle_id uuid;
  v_target_count integer;
  v_is_manager boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  ) then
    raise exception 'not authorized';
  end if;

  v_is_manager := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  );

  if not v_is_manager then
    if p_trainer_user_id is distinct from auth.uid() then
      raise exception 'trainer may create only their own programs';
    end if;

    if not exists (
      select 1
      from public.pt_packages pp
      where pp.organization_id = p_organization_id
        and pp.member_id = p_member_id
        and pp.trainer_user_id = auth.uid()
    ) and not exists (
      select 1
      from public.pt_sessions ps
      where ps.organization_id = p_organization_id
        and ps.member_id = p_member_id
        and ps.trainer_user_id = auth.uid()
    ) then
      raise exception 'trainer is not assigned to this member';
    end if;
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'program name is required';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.organization_id = p_organization_id
      and m.archived_at is null
  ) then
    raise exception 'invalid member';
  end if;

  if p_trainer_user_id is not null and not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_trainer_user_id
      and om.is_active
      and om.role in ('owner','admin','manager','trainer')
  ) then
    raise exception 'invalid trainer';
  end if;

  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'program end cannot precede start';
  end if;

  if p_targets is null
     or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'targets must be a JSON array';
  end if;

  v_hash := md5(jsonb_build_object(
    'member_id', p_member_id,
    'trainer_user_id', p_trainer_user_id,
    'name', trim(p_name),
    'starts_on', p_starts_on,
    'ends_on', p_ends_on,
    'notes', nullif(trim(p_notes), ''),
    'targets', p_targets
  )::text);

  v_replay := private.idempotency_replay(
    p_organization_id,
    'training_program.create',
    p_idempotency_key,
    v_hash
  );

  if v_replay is not null then
    return (v_replay ->> 'program_id')::uuid;
  end if;

  if exists (
    select 1
    from public.member_training_programs p
    where p.organization_id = p_organization_id
      and p.member_id = p_member_id
      and p.is_active
      and daterange(
        p.starts_on,
        coalesce(p.ends_on + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        p_starts_on,
        coalesce(p_ends_on + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'member already has an overlapping active training program';
  end if;

  insert into public.member_training_programs (
    organization_id,
    member_id,
    trainer_user_id,
    name,
    starts_on,
    ends_on,
    notes,
    created_by
  ) values (
    p_organization_id,
    p_member_id,
    p_trainer_user_id,
    trim(p_name),
    p_starts_on,
    p_ends_on,
    nullif(trim(p_notes), ''),
    auth.uid()
  )
  returning id into v_program_id;

  for v_target in
    select value from jsonb_array_elements(p_targets)
  loop
    v_muscle_id := nullif(v_target ->> 'muscle_group_id', '')::uuid;
    v_target_count := coalesce(
      nullif(v_target ->> 'target_sessions_per_week', '')::integer,
      0
    );

    if not exists (
      select 1
      from public.muscle_groups mg
      where mg.id = v_muscle_id
        and mg.organization_id = p_organization_id
        and mg.is_active
    ) then
      raise exception 'invalid muscle group in program targets';
    end if;

    if v_target_count < 0 or v_target_count > 14 then
      raise exception 'weekly muscle target must be between 0 and 14';
    end if;

    insert into public.member_program_muscle_targets (
      organization_id,
      program_id,
      member_id,
      muscle_group_id,
      target_sessions_per_week
    ) values (
      p_organization_id,
      v_program_id,
      p_member_id,
      v_muscle_id,
      v_target_count
    );
  end loop;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    auth.uid(),
    'training_program.created',
    'training_program',
    v_program_id::text,
    jsonb_build_object(
      'member_id', p_member_id,
      'trainer_user_id', p_trainer_user_id,
      'starts_on', p_starts_on,
      'ends_on', p_ends_on,
      'targets', p_targets
    )
  );

  perform private.idempotency_store(
    p_organization_id,
    'training_program.create',
    p_idempotency_key,
    v_hash,
    jsonb_build_object('program_id', v_program_id)
  );

  return v_program_id;
end;
$$;

revoke all on function public.create_training_program_idempotent(
  uuid,uuid,uuid,text,date,date,text,jsonb,uuid
) from public, anon;

grant execute on function public.create_training_program_idempotent(
  uuid,uuid,uuid,text,date,date,text,jsonb,uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Plan a scheduled PT session.
-- The plan can be changed while the session is still scheduled.
-- ---------------------------------------------------------------------------

create or replace function public.save_pt_session_plan(
  p_organization_id uuid,
  p_session_id uuid,
  p_program_id uuid,
  p_session_goal text,
  p_planned_muscle_group_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_session public.pt_sessions%rowtype;
  v_is_coordinator boolean;
  v_muscle_id uuid;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  ) then
    raise exception 'not authorized';
  end if;

  select *
  into v_session
  from public.pt_sessions
  where id = p_session_id
    and organization_id = p_organization_id
  for update;

  if v_session.id is null then
    raise exception 'session not found';
  end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  );

  if not v_is_coordinator
     and v_session.trainer_user_id <> auth.uid() then
    raise exception 'trainer may plan only assigned sessions';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'only scheduled sessions can be planned';
  end if;

  if p_program_id is not null and not exists (
    select 1
    from public.member_training_programs p
    where p.id = p_program_id
      and p.organization_id = p_organization_id
      and p.member_id = v_session.member_id
      and p.is_active
  ) then
    raise exception 'training program does not match this member';
  end if;

  foreach v_muscle_id in array coalesce(
    p_planned_muscle_group_ids,
    array[]::uuid[]
  )
  loop
    if not exists (
      select 1
      from public.muscle_groups mg
      where mg.id = v_muscle_id
        and mg.organization_id = p_organization_id
        and mg.is_active
    ) then
      raise exception 'invalid planned muscle group';
    end if;
  end loop;

  insert into public.pt_session_workouts (
    organization_id,
    pt_session_id,
    member_id,
    trainer_user_id,
    program_id,
    session_goal
  ) values (
    p_organization_id,
    p_session_id,
    v_session.member_id,
    v_session.trainer_user_id,
    p_program_id,
    nullif(trim(p_session_goal), '')
  )
  on conflict (pt_session_id)
  do update set
    program_id = excluded.program_id,
    session_goal = excluded.session_goal,
    updated_at = now();

  delete from public.pt_session_muscles
  where pt_session_id = p_session_id
    and organization_id = p_organization_id
    and is_trained = false;

  foreach v_muscle_id in array coalesce(
    p_planned_muscle_group_ids,
    array[]::uuid[]
  )
  loop
    insert into public.pt_session_muscles (
      organization_id,
      pt_session_id,
      member_id,
      muscle_group_id,
      is_planned,
      is_trained
    ) values (
      p_organization_id,
      p_session_id,
      v_session.member_id,
      v_muscle_id,
      true,
      false
    )
    on conflict (pt_session_id, muscle_group_id)
    do update set
      is_planned = true,
      updated_at = now();
  end loop;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    auth.uid(),
    'pt.session_plan_saved',
    'pt_session',
    p_session_id::text,
    jsonb_build_object(
      'program_id', p_program_id,
      'session_goal', nullif(trim(p_session_goal), ''),
      'planned_muscles', coalesce(p_planned_muscle_group_ids, array[]::uuid[])
    )
  );

  return true;
end;
$$;

revoke all on function public.save_pt_session_plan(
  uuid,uuid,uuid,text,uuid[]
) from public, anon;

grant execute on function public.save_pt_session_plan(
  uuid,uuid,uuid,text,uuid[]
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Atomic workout completion.
--
-- p_muscles:
-- [
--   {"muscle_group_id":"<uuid>","notes":"optional"}
-- ]
--
-- p_exercises:
-- [
--   {
--     "exercise_id":"<uuid or null>",
--     "name":"Bench Press",
--     "notes":"optional",
--     "sets":[
--       {"reps":8,"weight_kg":70,"rpe":8,"completed":true}
--     ]
--   }
-- ]
-- ---------------------------------------------------------------------------

create or replace function public.complete_pt_session_with_workout(
  p_organization_id uuid,
  p_session_id uuid,
  p_program_id uuid,
  p_session_goal text,
  p_coach_notes text,
  p_muscles jsonb,
  p_exercises jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_session public.pt_sessions%rowtype;
  v_is_coordinator boolean;
  v_workout_id uuid;
  v_muscle jsonb;
  v_muscle_id uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_exercise_id uuid;
  v_session_exercise_id uuid;
  v_exercise_name text;
  v_position integer := 0;
  v_set_number integer;
  v_remaining integer;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','trainer']::public.app_role[]
  ) then
    raise exception 'not authorized';
  end if;

  select *
  into v_session
  from public.pt_sessions
  where id = p_session_id
    and organization_id = p_organization_id
  for update;

  if v_session.id is null then
    raise exception 'session not found';
  end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  );

  if not v_is_coordinator
     and v_session.trainer_user_id <> auth.uid() then
    raise exception 'trainer may complete only assigned sessions';
  end if;

  if v_session.status = 'completed' then
    select pp.sessions_remaining
    into v_remaining
    from public.pt_packages pp
    where pp.id = v_session.pt_package_id
      and pp.organization_id = p_organization_id;

    return jsonb_build_object(
      'completed', false,
      'already_completed', true,
      'session_id', p_session_id,
      'sessions_remaining', v_remaining
    );
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'only scheduled sessions can be completed';
  end if;

  if p_program_id is not null and not exists (
    select 1
    from public.member_training_programs p
    where p.id = p_program_id
      and p.organization_id = p_organization_id
      and p.member_id = v_session.member_id
      and p.is_active
  ) then
    raise exception 'training program does not match this member';
  end if;

  if p_muscles is null then
    p_muscles := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_muscles) <> 'array' then
    raise exception 'muscles must be a JSON array';
  end if;

  if p_exercises is null then
    p_exercises := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'exercises must be a JSON array';
  end if;

  insert into public.pt_session_workouts (
    organization_id,
    pt_session_id,
    member_id,
    trainer_user_id,
    program_id,
    session_goal,
    coach_notes
  ) values (
    p_organization_id,
    p_session_id,
    v_session.member_id,
    v_session.trainer_user_id,
    p_program_id,
    nullif(trim(p_session_goal), ''),
    nullif(trim(p_coach_notes), '')
  )
  on conflict (pt_session_id)
  do update set
    program_id = excluded.program_id,
    session_goal = excluded.session_goal,
    coach_notes = excluded.coach_notes,
    updated_at = now()
  returning id into v_workout_id;

  for v_muscle in
    select value from jsonb_array_elements(p_muscles)
  loop
    v_muscle_id := nullif(
      v_muscle ->> 'muscle_group_id',
      ''
    )::uuid;

    if not exists (
      select 1
      from public.muscle_groups mg
      where mg.id = v_muscle_id
        and mg.organization_id = p_organization_id
        and mg.is_active
    ) then
      raise exception 'invalid trained muscle group';
    end if;

    insert into public.pt_session_muscles (
      organization_id,
      pt_session_id,
      member_id,
      muscle_group_id,
      is_planned,
      is_trained,
      notes
    ) values (
      p_organization_id,
      p_session_id,
      v_session.member_id,
      v_muscle_id,
      false,
      true,
      nullif(trim(v_muscle ->> 'notes'), '')
    )
    on conflict (pt_session_id, muscle_group_id)
    do update set
      is_trained = true,
      notes = excluded.notes,
      updated_at = now();
  end loop;

  delete from public.pt_exercise_sets
  where session_exercise_id in (
    select se.id
    from public.pt_session_exercises se
    where se.pt_session_id = p_session_id
      and se.organization_id = p_organization_id
  );

  delete from public.pt_session_exercises
  where pt_session_id = p_session_id
    and organization_id = p_organization_id;

  for v_exercise in
    select value from jsonb_array_elements(p_exercises)
  loop
    v_position := v_position + 1;
    v_exercise_id := nullif(v_exercise ->> 'exercise_id', '')::uuid;

    if v_exercise_id is not null then
      select el.name
      into v_exercise_name
      from public.exercise_library el
      where el.id = v_exercise_id
        and el.organization_id = p_organization_id;

      if v_exercise_name is null then
        raise exception 'invalid exercise';
      end if;
    else
      v_exercise_name := nullif(trim(v_exercise ->> 'name'), '');
      if v_exercise_name is null then
        raise exception 'custom exercise name is required';
      end if;
    end if;

    insert into public.pt_session_exercises (
      organization_id,
      pt_session_id,
      member_id,
      exercise_id,
      exercise_name,
      position,
      notes
    ) values (
      p_organization_id,
      p_session_id,
      v_session.member_id,
      v_exercise_id,
      v_exercise_name,
      v_position,
      nullif(trim(v_exercise ->> 'notes'), '')
    )
    returning id into v_session_exercise_id;

    v_set_number := 0;

    if coalesce(jsonb_typeof(v_exercise -> 'sets'), 'null') = 'array' then
      for v_set in
        select value from jsonb_array_elements(v_exercise -> 'sets')
      loop
        v_set_number := v_set_number + 1;

        insert into public.pt_exercise_sets (
          organization_id,
          session_exercise_id,
          set_number,
          reps,
          weight_kg,
          duration_seconds,
          distance_meters,
          rpe,
          completed,
          notes
        ) values (
          p_organization_id,
          v_session_exercise_id,
          v_set_number,
          nullif(v_set ->> 'reps', '')::integer,
          nullif(v_set ->> 'weight_kg', '')::numeric,
          nullif(v_set ->> 'duration_seconds', '')::integer,
          nullif(v_set ->> 'distance_meters', '')::numeric,
          nullif(v_set ->> 'rpe', '')::numeric,
          coalesce((v_set ->> 'completed')::boolean, true),
          nullif(trim(v_set ->> 'notes'), '')
        );
      end loop;
    end if;
  end loop;

  if v_session.pt_package_id is not null then
    update public.pt_packages
    set sessions_remaining = sessions_remaining - 1
    where id = v_session.pt_package_id
      and organization_id = p_organization_id
      and member_id = v_session.member_id
      and sessions_remaining > 0
    returning sessions_remaining into v_remaining;

    if not found then
      raise exception 'PT package has no remaining sessions';
    end if;
  else
    v_remaining := null;
  end if;

  update public.pt_sessions
  set status = 'completed'
  where id = p_session_id;

  update public.pt_session_workouts
  set
    completed_by = auth.uid(),
    completed_at = now(),
    updated_at = now()
  where id = v_workout_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    auth.uid(),
    'pt.session_completed_with_workout',
    'pt_session',
    p_session_id::text,
    jsonb_build_object(
      'member_id', v_session.member_id,
      'trainer_user_id', v_session.trainer_user_id,
      'pt_package_id', v_session.pt_package_id,
      'program_id', p_program_id,
      'sessions_remaining', v_remaining,
      'muscles', p_muscles,
      'exercise_count', jsonb_array_length(p_exercises)
    )
  );

  return jsonb_build_object(
    'completed', true,
    'already_completed', false,
    'session_id', p_session_id,
    'workout_id', v_workout_id,
    'sessions_remaining', v_remaining
  );
end;
$$;

revoke all on function public.complete_pt_session_with_workout(
  uuid,uuid,uuid,text,text,jsonb,jsonb
) from public, anon;

grant execute on function public.complete_pt_session_with_workout(
  uuid,uuid,uuid,text,text,jsonb,jsonb
) to authenticated, service_role;

-- Keep old V1 callers working. In V2, a simple completion still creates a
-- minimal workout record so every completed PT session appears in history.
create or replace function public.complete_pt_session(
  p_organization_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  perform public.complete_pt_session_with_workout(
    p_organization_id,
    p_session_id,
    null,
    null,
    null,
    '[]'::jsonb,
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.complete_pt_session(uuid,uuid)
from public, anon;

grant execute on function public.complete_pt_session(uuid,uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Weekly member muscle progress, calculated in the gym's timezone.
-- Returns target / completed / remaining for the requested week.
-- ---------------------------------------------------------------------------

create or replace function public.get_member_weekly_muscle_progress(
  p_organization_id uuid,
  p_member_id uuid,
  p_week_start date
)
returns table (
  program_id uuid,
  muscle_group_id uuid,
  muscle_name text,
  target_sessions integer,
  completed_sessions integer,
  remaining_sessions integer
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_program_id uuid;
  v_timezone text;
  v_week_start_ts timestamptz;
  v_week_end_ts timestamptz;
  v_is_manager boolean;
begin
  if p_week_start is null then
    raise exception 'week start is required';
  end if;

  v_is_manager := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  );

  if not v_is_manager then
    if not public.has_org_role(
      p_organization_id,
      array['trainer']::public.app_role[]
    ) then
      raise exception 'not authorized';
    end if;

    if not exists (
      select 1
      from public.pt_packages pp
      where pp.organization_id = p_organization_id
        and pp.member_id = p_member_id
        and pp.trainer_user_id = auth.uid()
    ) and not exists (
      select 1
      from public.pt_sessions ps
      where ps.organization_id = p_organization_id
        and ps.member_id = p_member_id
        and ps.trainer_user_id = auth.uid()
    ) then
      raise exception 'trainer is not assigned to this member';
    end if;
  end if;

  select o.timezone
  into v_timezone
  from public.organizations o
  where o.id = p_organization_id;

  if v_timezone is null then
    raise exception 'organization not found';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.organization_id = p_organization_id
  ) then
    raise exception 'member not found';
  end if;

  select p.id
  into v_program_id
  from public.member_training_programs p
  where p.organization_id = p_organization_id
    and p.member_id = p_member_id
    and p.starts_on <= (p_week_start + 6)
    and (p.ends_on is null or p.ends_on >= p_week_start)
  order by p.starts_on desc, p.created_at desc
  limit 1;

  if v_program_id is null then
    return;
  end if;

  v_week_start_ts := p_week_start::timestamp at time zone v_timezone;
  v_week_end_ts := (p_week_start + 7)::timestamp at time zone v_timezone;

  return query
  select
    v_program_id,
    t.muscle_group_id,
    mg.name,
    t.target_sessions_per_week,
    count(distinct ps.id)::integer as completed_sessions,
    greatest(
      t.target_sessions_per_week - count(distinct ps.id)::integer,
      0
    )::integer as remaining_sessions
  from public.member_program_muscle_targets t
  join public.muscle_groups mg
    on mg.id = t.muscle_group_id
   and mg.organization_id = t.organization_id
  left join public.pt_session_muscles sm
    on sm.organization_id = t.organization_id
   and sm.member_id = t.member_id
   and sm.muscle_group_id = t.muscle_group_id
   and sm.is_trained = true
  left join public.pt_sessions ps
    on ps.id = sm.pt_session_id
   and ps.organization_id = sm.organization_id
   and ps.status = 'completed'::public.session_status
   and ps.starts_at >= v_week_start_ts
   and ps.starts_at < v_week_end_ts
  where t.organization_id = p_organization_id
    and t.member_id = p_member_id
    and t.program_id = v_program_id
  group by
    t.muscle_group_id,
    mg.name,
    mg.sort_order,
    t.target_sessions_per_week
  order by mg.sort_order, mg.name;
end;
$$;

revoke all on function public.get_member_weekly_muscle_progress(
  uuid,uuid,date
) from public, anon;

grant execute on function public.get_member_weekly_muscle_progress(
  uuid,uuid,date
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Extra integrity checks for the new cross-table references.
-- ---------------------------------------------------------------------------

create or replace function public.validate_v2_training_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'member_training_programs' then
    if not exists (
      select 1
      from public.members m
      where m.id = new.member_id
        and m.organization_id = new.organization_id
    ) then
      raise exception 'training program member belongs to another organization';
    end if;

    if new.trainer_user_id is not null and not exists (
      select 1
      from public.organization_members om
      where om.organization_id = new.organization_id
        and om.user_id = new.trainer_user_id
        and om.is_active
        and om.role in ('owner','admin','manager','trainer')
    ) then
      raise exception 'training program trainer is invalid';
    end if;

  elsif tg_table_name = 'member_program_muscle_targets' then
    if not exists (
      select 1
      from public.member_training_programs p
      where p.id = new.program_id
        and p.organization_id = new.organization_id
        and p.member_id = new.member_id
    ) then
      raise exception 'training target program/member mismatch';
    end if;

    if not exists (
      select 1
      from public.muscle_groups mg
      where mg.id = new.muscle_group_id
        and mg.organization_id = new.organization_id
    ) then
      raise exception 'training target muscle belongs to another organization';
    end if;

  elsif tg_table_name = 'exercise_library' then
    if new.primary_muscle_group_id is not null and not exists (
      select 1
      from public.muscle_groups mg
      where mg.id = new.primary_muscle_group_id
        and mg.organization_id = new.organization_id
    ) then
      raise exception 'exercise muscle belongs to another organization';
    end if;

  elsif tg_table_name = 'pt_session_workouts' then
    if not exists (
      select 1
      from public.pt_sessions ps
      where ps.id = new.pt_session_id
        and ps.organization_id = new.organization_id
        and ps.member_id = new.member_id
        and ps.trainer_user_id = new.trainer_user_id
    ) then
      raise exception 'workout does not match PT session';
    end if;

    if new.program_id is not null and not exists (
      select 1
      from public.member_training_programs p
      where p.id = new.program_id
        and p.organization_id = new.organization_id
        and p.member_id = new.member_id
    ) then
      raise exception 'workout program does not match member';
    end if;

  elsif tg_table_name = 'pt_session_muscles' then
    if not exists (
      select 1
      from public.pt_sessions ps
      where ps.id = new.pt_session_id
        and ps.organization_id = new.organization_id
        and ps.member_id = new.member_id
    ) then
      raise exception 'session muscle does not match PT session/member';
    end if;

    if not exists (
      select 1
      from public.muscle_groups mg
      where mg.id = new.muscle_group_id
        and mg.organization_id = new.organization_id
    ) then
      raise exception 'session muscle belongs to another organization';
    end if;

  elsif tg_table_name = 'pt_session_exercises' then
    if not exists (
      select 1
      from public.pt_sessions ps
      where ps.id = new.pt_session_id
        and ps.organization_id = new.organization_id
        and ps.member_id = new.member_id
    ) then
      raise exception 'session exercise does not match PT session/member';
    end if;

    if new.exercise_id is not null and not exists (
      select 1
      from public.exercise_library el
      where el.id = new.exercise_id
        and el.organization_id = new.organization_id
    ) then
      raise exception 'session exercise belongs to another organization';
    end if;

  elsif tg_table_name = 'pt_exercise_sets' then
    if not exists (
      select 1
      from public.pt_session_exercises se
      where se.id = new.session_exercise_id
        and se.organization_id = new.organization_id
    ) then
      raise exception 'exercise set belongs to another organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists member_training_programs_org_integrity
on public.member_training_programs;
create trigger member_training_programs_org_integrity
before insert or update on public.member_training_programs
for each row execute function public.validate_v2_training_references();

drop trigger if exists member_program_targets_org_integrity
on public.member_program_muscle_targets;
create trigger member_program_targets_org_integrity
before insert or update on public.member_program_muscle_targets
for each row execute function public.validate_v2_training_references();

drop trigger if exists exercise_library_org_integrity
on public.exercise_library;
create trigger exercise_library_org_integrity
before insert or update on public.exercise_library
for each row execute function public.validate_v2_training_references();

drop trigger if exists pt_session_workouts_org_integrity
on public.pt_session_workouts;
create trigger pt_session_workouts_org_integrity
before insert or update on public.pt_session_workouts
for each row execute function public.validate_v2_training_references();

drop trigger if exists pt_session_muscles_org_integrity
on public.pt_session_muscles;
create trigger pt_session_muscles_org_integrity
before insert or update on public.pt_session_muscles
for each row execute function public.validate_v2_training_references();

drop trigger if exists pt_session_exercises_org_integrity
on public.pt_session_exercises;
create trigger pt_session_exercises_org_integrity
before insert or update on public.pt_session_exercises
for each row execute function public.validate_v2_training_references();

drop trigger if exists pt_exercise_sets_org_integrity
on public.pt_exercise_sets;
create trigger pt_exercise_sets_org_integrity
before insert or update on public.pt_exercise_sets
for each row execute function public.validate_v2_training_references();

-- Catalog sequence access is not needed because all primary keys are UUIDs.
-- Critical program/workout rows remain read-only through the Data API;
-- mutations occur through the guarded transaction RPCs above.
