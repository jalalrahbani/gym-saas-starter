-- Strong cross-table tenant integrity and atomic payment recording.

create or replace function public.validate_member_org_references()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.home_location_id is not null and not exists (
    select 1 from public.locations l where l.id=new.home_location_id and l.organization_id=new.organization_id
  ) then raise exception 'member location belongs to another organization'; end if;
  return new;
end; $$;
create trigger members_org_integrity before insert or update on public.members
for each row execute procedure public.validate_member_org_references();

create or replace function public.validate_membership_org_references()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (select 1 from public.members m where m.id=new.member_id and m.organization_id=new.organization_id) then raise exception 'membership member belongs to another organization'; end if;
  if not exists (select 1 from public.membership_plans p where p.id=new.plan_id and p.organization_id=new.organization_id) then raise exception 'membership plan belongs to another organization'; end if;
  if new.location_id is not null and not exists (select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then raise exception 'membership location belongs to another organization'; end if;
  return new;
end; $$;
create trigger memberships_org_integrity before insert or update on public.memberships
for each row execute procedure public.validate_membership_org_references();

create or replace function public.validate_payment_org_references()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.location_id is not null and not exists (select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then raise exception 'payment location belongs to another organization'; end if;
  if new.member_id is not null and not exists (select 1 from public.members m where m.id=new.member_id and m.organization_id=new.organization_id) then raise exception 'payment member belongs to another organization'; end if;
  if new.membership_id is not null then
    if not exists (
      select 1 from public.memberships ms
      where ms.id=new.membership_id and ms.organization_id=new.organization_id
        and (new.member_id is null or ms.member_id=new.member_id)
    ) then raise exception 'payment membership does not match organization/member'; end if;
  end if;
  return new;
end; $$;
create trigger payments_org_integrity before insert or update on public.payments
for each row execute procedure public.validate_payment_org_references();

create or replace function public.validate_pt_package_org_references()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (select 1 from public.members m where m.id=new.member_id and m.organization_id=new.organization_id) then raise exception 'PT member belongs to another organization'; end if;
  if new.trainer_user_id is not null and not exists (select 1 from public.organization_members om where om.organization_id=new.organization_id and om.user_id=new.trainer_user_id and om.is_active) then raise exception 'PT trainer is not active in this organization'; end if;
  return new;
end; $$;
create trigger pt_packages_org_integrity before insert or update on public.pt_packages
for each row execute procedure public.validate_pt_package_org_references();

create or replace function public.validate_pt_session_org_references()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (select 1 from public.members m where m.id=new.member_id and m.organization_id=new.organization_id) then raise exception 'PT session member belongs to another organization'; end if;
  if not exists (select 1 from public.organization_members om where om.organization_id=new.organization_id and om.user_id=new.trainer_user_id and om.is_active) then raise exception 'PT session trainer is not active in this organization'; end if;
  if new.location_id is not null and not exists (select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then raise exception 'PT location belongs to another organization'; end if;
  if new.pt_package_id is not null and not exists (select 1 from public.pt_packages p where p.id=new.pt_package_id and p.organization_id=new.organization_id and p.member_id=new.member_id) then raise exception 'PT package does not match member/organization'; end if;
  return new;
end; $$;
create trigger pt_sessions_org_integrity before insert or update on public.pt_sessions
for each row execute procedure public.validate_pt_session_org_references();

create or replace function public.validate_class_org_references()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='group_classes' then
    if new.location_id is not null and not exists (select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then raise exception 'class location belongs to another organization'; end if;
  elsif tg_table_name='class_sessions' then
    if not exists (select 1 from public.group_classes c where c.id=new.class_id and c.organization_id=new.organization_id) then raise exception 'class definition belongs to another organization'; end if;
    if new.location_id is not null and not exists (select 1 from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id) then raise exception 'class session location belongs to another organization'; end if;
    if new.trainer_user_id is not null and not exists (select 1 from public.organization_members om where om.organization_id=new.organization_id and om.user_id=new.trainer_user_id and om.is_active) then raise exception 'class trainer is not active in this organization'; end if;
  elsif tg_table_name='class_bookings' then
    if not exists (select 1 from public.class_sessions s where s.id=new.class_session_id and s.organization_id=new.organization_id) then raise exception 'class session belongs to another organization'; end if;
    if not exists (select 1 from public.members m where m.id=new.member_id and m.organization_id=new.organization_id) then raise exception 'class booking member belongs to another organization'; end if;
  end if;
  return new;
end; $$;
create trigger group_classes_org_integrity before insert or update on public.group_classes for each row execute procedure public.validate_class_org_references();
create trigger class_sessions_org_integrity before insert or update on public.class_sessions for each row execute procedure public.validate_class_org_references();
create trigger class_bookings_org_integrity before insert or update on public.class_bookings for each row execute procedure public.validate_class_org_references();

-- Direct payment inserts are disabled; use this transaction boundary instead.
revoke insert on public.payments from authenticated;

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
declare v_id uuid;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception','accountant']::public.app_role[]) then raise exception 'not authorized'; end if;
  if p_amount_minor <= 0 then raise exception 'payment amount must be greater than zero'; end if;
  insert into public.payments (organization_id,location_id,member_id,membership_id,amount_minor,currency,payment_method,status,external_reference,note,created_by)
  values (p_organization_id,p_location_id,p_member_id,p_membership_id,p_amount_minor,upper(p_currency),p_payment_method,'paid',nullif(trim(p_external_reference),''),nullif(trim(p_note),''),auth.uid())
  returning id into v_id;
  insert into public.audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (p_organization_id,auth.uid(),'payment.recorded','payment',v_id::text,jsonb_build_object('member_id',p_member_id,'amount_minor',p_amount_minor,'currency',upper(p_currency)));
  return v_id;
end; $$;
revoke all on function public.record_payment(uuid,uuid,uuid,uuid,bigint,text,text,text,text) from public;
grant execute on function public.record_payment(uuid,uuid,uuid,uuid,bigint,text,text,text,text) to authenticated;

-- PT writes require operational roles, not merely any organization membership.
drop policy if exists pt_packages_write on public.pt_packages;
create policy pt_packages_write on public.pt_packages for all to authenticated
using (public.has_org_role(organization_id,array['owner','admin','manager','reception','trainer']::public.app_role[]))
with check (public.has_org_role(organization_id,array['owner','admin','manager','reception','trainer']::public.app_role[]));

drop policy if exists pt_sessions_write on public.pt_sessions;
create policy pt_sessions_write on public.pt_sessions for all to authenticated
using (public.has_org_role(organization_id,array['owner','admin','manager','reception','trainer']::public.app_role[]))
with check (public.has_org_role(organization_id,array['owner','admin','manager','reception','trainer']::public.app_role[]));
