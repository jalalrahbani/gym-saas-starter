-- Layer 3 final RBAC read-boundary tightening.
-- Keep tenant isolation and align read access with the product role model.

drop policy if exists access_events_select on public.access_events;
create policy access_events_select on public.access_events
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

drop policy if exists access_terminals_select on public.access_terminals;
create policy access_terminals_select on public.access_terminals
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

drop policy if exists checkins_select on public.check_ins;
create policy checkins_select on public.check_ins
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  )
);

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  )
);
