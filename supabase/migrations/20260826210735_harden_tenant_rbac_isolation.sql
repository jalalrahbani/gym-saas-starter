-- Layer 3: tenant/RBAC isolation hardening with compatibility fixes.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.shares_active_organization(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members peer
      on peer.organization_id = mine.organization_id
     and peer.is_active = true
    where mine.user_id = auth.uid()
      and mine.is_active = true
      and peer.user_id = p_other_user_id
  );
$$;
revoke all on function private.shares_active_organization(uuid) from public, anon;
grant execute on function private.shares_active_organization(uuid) to authenticated, service_role;

drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_org_peers on public.profiles;
create policy profiles_select_org_peers on public.profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.shares_active_organization(user_id)
);

drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_org_role(
    organization_id,
    array['owner','admin','manager']::public.app_role[]
  )
  or (
    public.has_org_role(
      organization_id,
      array['reception']::public.app_role[]
    )
    and role in ('owner','admin','manager','trainer')
    and is_active = true
  )
);

drop policy if exists organization_members_manage on public.organization_members;
drop policy if exists organization_members_manage_owner on public.organization_members;
drop policy if exists organization_members_manage_admin on public.organization_members;
create policy organization_members_manage_owner on public.organization_members
for all to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner']::public.app_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner']::public.app_role[]
  )
);
create policy organization_members_manage_admin on public.organization_members
for all to authenticated
using (
  role <> 'owner'::public.app_role
  and public.has_org_role(
    organization_id,
    array['admin']::public.app_role[]
  )
)
with check (
  role <> 'owner'::public.app_role
  and public.has_org_role(
    organization_id,
    array['admin']::public.app_role[]
  )
);

create or replace function private.protect_last_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other_owners integer;
begin
  if old.role = 'owner'::public.app_role
     and old.is_active = true
     and (
       tg_op = 'DELETE'
       or new.role is distinct from 'owner'::public.app_role
       or new.is_active is distinct from true
     ) then
    select count(*) into v_other_owners
    from public.organization_members om
    where om.organization_id = old.organization_id
      and om.id <> old.id
      and om.role = 'owner'::public.app_role
      and om.is_active = true;
    if v_other_owners = 0 then
      raise exception 'organization must keep at least one active owner';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_last_active_owner() from public, anon, authenticated;
grant execute on function private.protect_last_active_owner() to service_role;

drop trigger if exists organization_members_protect_last_owner on public.organization_members;
create trigger organization_members_protect_last_owner
before update or delete on public.organization_members
for each row execute function private.protect_last_active_owner();

drop policy if exists access_credentials_select on public.access_credentials;
create policy access_credentials_select on public.access_credentials
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

drop policy if exists checkins_insert on public.check_ins;
create policy checkins_insert on public.check_ins
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

drop policy if exists member_notes_select on public.member_notes;
drop policy if exists member_notes_write on public.member_notes;
drop policy if exists member_notes_insert on public.member_notes;
drop policy if exists member_notes_update on public.member_notes;
drop policy if exists member_notes_delete on public.member_notes;
create policy member_notes_select on public.member_notes
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
  and (
    is_private = false
    or created_by = (select auth.uid())
    or public.has_org_role(
      organization_id,
      array['owner','admin','manager']::public.app_role[]
    )
  )
);
create policy member_notes_insert on public.member_notes
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
  and (created_by is null or created_by = (select auth.uid()))
);
create policy member_notes_update on public.member_notes
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager']::public.app_role[]
  )
  or (
    created_by = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['reception','trainer']::public.app_role[]
    )
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager']::public.app_role[]
  )
  or (
    created_by = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['reception','trainer']::public.app_role[]
    )
  )
);
create policy member_notes_delete on public.member_notes
for delete to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager']::public.app_role[]
  )
  or (
    created_by = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['reception','trainer']::public.app_role[]
    )
  )
);

drop policy if exists pt_packages_select on public.pt_packages;
drop policy if exists pt_packages_write on public.pt_packages;
drop policy if exists pt_packages_insert on public.pt_packages;
drop policy if exists pt_packages_update on public.pt_packages;
create policy pt_packages_select on public.pt_packages
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);
create policy pt_packages_insert on public.pt_packages
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
);
create policy pt_packages_update on public.pt_packages
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
);

drop policy if exists pt_sessions_select on public.pt_sessions;
drop policy if exists pt_sessions_write on public.pt_sessions;
drop policy if exists pt_sessions_insert on public.pt_sessions;
drop policy if exists pt_sessions_update on public.pt_sessions;
create policy pt_sessions_select on public.pt_sessions
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);
create policy pt_sessions_insert on public.pt_sessions
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);
create policy pt_sessions_update on public.pt_sessions
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);

drop policy if exists group_classes_select on public.group_classes;
create policy group_classes_select on public.group_classes
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

drop policy if exists class_sessions_select on public.class_sessions;
drop policy if exists class_sessions_write on public.class_sessions;
drop policy if exists class_sessions_insert on public.class_sessions;
drop policy if exists class_sessions_update on public.class_sessions;
create policy class_sessions_select on public.class_sessions
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);
create policy class_sessions_insert on public.class_sessions
for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);
create policy class_sessions_update on public.class_sessions
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    trainer_user_id = (select auth.uid())
    and public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
  )
);

drop policy if exists class_bookings_select on public.class_bookings;
drop policy if exists class_bookings_write on public.class_bookings;
drop policy if exists class_bookings_update on public.class_bookings;
create policy class_bookings_select on public.class_bookings
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_session_id
        and cs.organization_id = organization_id
        and cs.trainer_user_id = (select auth.uid())
    )
  )
);
create policy class_bookings_update on public.class_bookings
for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_session_id
        and cs.organization_id = organization_id
        and cs.trainer_user_id = (select auth.uid())
    )
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    public.has_org_role(
      organization_id,
      array['trainer']::public.app_role[]
    )
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_session_id
        and cs.organization_id = organization_id
        and cs.trainer_user_id = (select auth.uid())
    )
  )
);

create or replace function public.complete_pt_session(
  p_organization_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.pt_sessions%rowtype;
  v_is_coordinator boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then
    raise exception 'not authorized';
  end if;

  select * into v_session from public.pt_sessions
  where id = p_session_id and organization_id = p_organization_id
  for update;
  if v_session.id is null then raise exception 'session not found'; end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  );
  if not v_is_coordinator and v_session.trainer_user_id <> auth.uid() then
    raise exception 'trainer may complete only assigned sessions';
  end if;

  if v_session.status = 'completed' then return; end if;
  if v_session.status <> 'scheduled' then
    raise exception 'only scheduled sessions can be completed';
  end if;

  if v_session.pt_package_id is not null then
    update public.pt_packages
      set sessions_remaining = sessions_remaining - 1
    where id = v_session.pt_package_id
      and organization_id = p_organization_id
      and sessions_remaining > 0;
    if not found then raise exception 'PT package has no remaining sessions'; end if;
  end if;

  update public.pt_sessions
  set status = 'completed'
  where id = p_session_id;
end;
$$;
revoke execute on function public.complete_pt_session(uuid,uuid) from public, anon;
grant execute on function public.complete_pt_session(uuid,uuid) to authenticated, service_role;

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
  v_booked integer;
  v_status text;
  v_id uuid;
  v_is_coordinator boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.members
    where id=p_member_id
      and organization_id=p_organization_id
      and archived_at is null
  ) then
    raise exception 'invalid member';
  end if;

  select * into v_session from public.class_sessions
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

  if exists (
    select 1 from public.class_bookings
    where class_session_id=p_class_session_id
      and member_id=p_member_id
      and status in ('booked','waitlisted','attended')
  ) then
    raise exception 'member is already booked for this class';
  end if;

  select count(*) into v_booked from public.class_bookings
  where class_session_id=p_class_session_id
    and status in ('booked','attended');
  v_status := case when v_booked < v_session.capacity then 'booked' else 'waitlisted' end;

  insert into public.class_bookings (
    organization_id,class_session_id,member_id,status
  ) values (
    p_organization_id,p_class_session_id,p_member_id,v_status
  ) returning id into v_id;

  return jsonb_build_object('booking_id',v_id,'status',v_status);
end;
$$;
revoke execute on function public.book_class(uuid,uuid,uuid) from public, anon;
grant execute on function public.book_class(uuid,uuid,uuid) to authenticated, service_role;

drop policy if exists member_private_select on storage.objects;
create policy member_private_select on storage.objects
for select to authenticated
using (
  bucket_id = 'member-private'
  and public.has_org_role(
    public.safe_uuid((storage.foldername(name))[1]),
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

drop policy if exists gym_branding_insert on storage.objects;
drop policy if exists gym_branding_update on storage.objects;
drop policy if exists gym_branding_delete on storage.objects;
create policy gym_branding_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'gym-branding'
  and (
    public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['owner','admin']::public.app_role[]
    )
    or (
      public.is_org_member(public.safe_uuid((storage.foldername(name))[1]))
      and (storage.foldername(name))[2] = 'profiles'
      and split_part(storage.filename(name), '.', 1) = (select auth.uid())::text
    )
  )
);
create policy gym_branding_update on storage.objects
for update to authenticated
using (
  bucket_id = 'gym-branding'
  and (
    public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['owner','admin']::public.app_role[]
    )
    or (
      public.is_org_member(public.safe_uuid((storage.foldername(name))[1]))
      and (storage.foldername(name))[2] = 'profiles'
      and split_part(storage.filename(name), '.', 1) = (select auth.uid())::text
    )
  )
)
with check (
  bucket_id = 'gym-branding'
  and (
    public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['owner','admin']::public.app_role[]
    )
    or (
      public.is_org_member(public.safe_uuid((storage.foldername(name))[1]))
      and (storage.foldername(name))[2] = 'profiles'
      and split_part(storage.filename(name), '.', 1) = (select auth.uid())::text
    )
  )
);
create policy gym_branding_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'gym-branding'
  and (
    public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['owner','admin']::public.app_role[]
    )
    or (
      public.is_org_member(public.safe_uuid((storage.foldername(name))[1]))
      and (storage.foldername(name))[2] = 'profiles'
      and split_part(storage.filename(name), '.', 1) = (select auth.uid())::text
    )
  )
);
