-- Layer 6: performance and scale hardening.
-- 1) Avoid per-row auth.uid() evaluation in profile RLS.
-- 2) Remove redundant read paths from obsolete ALL/write policies.
-- 3) Consolidate organization-member management policies.
-- 4) Add targeted indexes for real operational join/filter paths.

alter policy profiles_insert_self on public.profiles
  with check (user_id = (select auth.uid()));

alter policy profiles_update_self on public.profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- These tables are RPC-only for mutation after Layer 4, so their old ALL
-- policies only add an unnecessary second permissive SELECT path.
drop policy if exists group_classes_write on public.group_classes;
drop policy if exists leads_write on public.leads;
drop policy if exists freezes_write on public.membership_freezes;

-- Preserve owner/admin management semantics without making the write policies
-- also participate in SELECT.
drop policy if exists organization_members_manage_admin on public.organization_members;
drop policy if exists organization_members_manage_owner on public.organization_members;

create policy organization_members_manage_insert
on public.organization_members
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner']::public.app_role[]
  )
  or (
    role <> 'owner'::public.app_role
    and public.has_org_role(
      organization_id,
      array['admin']::public.app_role[]
    )
  )
);

create policy organization_members_manage_update
on public.organization_members
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner']::public.app_role[]
  )
  or (
    role <> 'owner'::public.app_role
    and public.has_org_role(
      organization_id,
      array['admin']::public.app_role[]
    )
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner']::public.app_role[]
  )
  or (
    role <> 'owner'::public.app_role
    and public.has_org_role(
      organization_id,
      array['admin']::public.app_role[]
    )
  )
);

create policy organization_members_manage_delete
on public.organization_members
for delete to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner']::public.app_role[]
  )
  or (
    role <> 'owner'::public.app_role
    and public.has_org_role(
      organization_id,
      array['admin']::public.app_role[]
    )
  )
);

-- Targeted indexes. We intentionally do not index every INFO-level foreign-key
-- advisory on append-heavy access/audit tables; unnecessary indexes would
-- increase check-in/write amplification.
create index if not exists access_credentials_member_id_idx
  on public.access_credentials(member_id);

create index if not exists class_bookings_member_id_idx
  on public.class_bookings(member_id);

create index if not exists class_sessions_class_id_idx
  on public.class_sessions(class_id);

create index if not exists class_sessions_location_starts_idx
  on public.class_sessions(location_id, starts_at);

create index if not exists class_sessions_trainer_starts_idx
  on public.class_sessions(trainer_user_id, starts_at)
  where trainer_user_id is not null;

create index if not exists group_classes_org_location_idx
  on public.group_classes(organization_id, location_id);

create index if not exists leads_location_id_idx
  on public.leads(location_id)
  where location_id is not null;

create index if not exists member_notes_member_created_idx
  on public.member_notes(member_id, created_at desc);

create index if not exists members_home_location_idx
  on public.members(home_location_id)
  where home_location_id is not null;

create index if not exists membership_freezes_membership_id_idx
  on public.membership_freezes(membership_id);

create index if not exists membership_plans_org_location_idx
  on public.membership_plans(organization_id, location_id);

create index if not exists memberships_member_status_end_idx
  on public.memberships(member_id, status, ends_on);

create index if not exists memberships_plan_id_idx
  on public.memberships(plan_id);

create index if not exists memberships_location_id_idx
  on public.memberships(location_id)
  where location_id is not null;

create index if not exists organization_members_location_id_idx
  on public.organization_members(location_id)
  where location_id is not null;

create index if not exists payments_member_paid_at_idx
  on public.payments(member_id, paid_at desc)
  where member_id is not null;

create index if not exists payments_membership_id_idx
  on public.payments(membership_id)
  where membership_id is not null;

create index if not exists payments_location_id_idx
  on public.payments(location_id)
  where location_id is not null;

create index if not exists pt_packages_member_id_idx
  on public.pt_packages(member_id);

create index if not exists pt_packages_trainer_user_id_idx
  on public.pt_packages(trainer_user_id)
  where trainer_user_id is not null;

create index if not exists pt_sessions_member_starts_idx
  on public.pt_sessions(member_id, starts_at);

create index if not exists pt_sessions_package_id_idx
  on public.pt_sessions(pt_package_id)
  where pt_package_id is not null;

create index if not exists pt_sessions_location_starts_idx
  on public.pt_sessions(location_id, starts_at)
  where location_id is not null;
