drop policy if exists class_bookings_select on public.class_bookings;
drop policy if exists class_bookings_update on public.class_bookings;

create policy class_bookings_select on public.class_bookings
for select to authenticated
using (
  public.has_org_role(
    class_bookings.organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    public.has_org_role(
      class_bookings.organization_id,
      array['trainer']::public.app_role[]
    )
    and exists (
      select 1
      from public.class_sessions cs
      where cs.id = class_bookings.class_session_id
        and cs.organization_id = class_bookings.organization_id
        and cs.trainer_user_id = (select auth.uid())
    )
  )
);

create policy class_bookings_update on public.class_bookings
for update to authenticated
using (
  public.has_org_role(
    class_bookings.organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    public.has_org_role(
      class_bookings.organization_id,
      array['trainer']::public.app_role[]
    )
    and exists (
      select 1
      from public.class_sessions cs
      where cs.id = class_bookings.class_session_id
        and cs.organization_id = class_bookings.organization_id
        and cs.trainer_user_id = (select auth.uid())
    )
  )
)
with check (
  public.has_org_role(
    class_bookings.organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
  or (
    public.has_org_role(
      class_bookings.organization_id,
      array['trainer']::public.app_role[]
    )
    and exists (
      select 1
      from public.class_sessions cs
      where cs.id = class_bookings.class_session_id
        and cs.organization_id = class_bookings.organization_id
        and cs.trainer_user_id = (select auth.uid())
    )
  )
);
