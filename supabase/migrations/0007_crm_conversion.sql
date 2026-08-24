-- Atomic lead conversion so CRM and member records cannot drift apart.

alter table public.leads
  add column converted_member_id uuid references public.members(id) on delete set null;

create unique index leads_one_conversion_idx on public.leads(converted_member_id)
where converted_member_id is not null;

create or replace function public.convert_lead_to_member(
  p_organization_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_member_id uuid;
  v_first text;
  v_last text;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception']::public.app_role[]) then
    raise exception 'not authorized';
  end if;

  select * into v_lead
  from public.leads
  where id=p_lead_id and organization_id=p_organization_id
  for update;

  if v_lead.id is null then raise exception 'lead not found'; end if;
  if v_lead.converted_member_id is not null then return v_lead.converted_member_id; end if;
  if v_lead.stage='lost' then raise exception 'restore the lead before converting it'; end if;

  v_first := nullif(split_part(trim(v_lead.full_name), ' ', 1), '');
  v_last := nullif(trim(substr(trim(v_lead.full_name), length(coalesce(v_first,'')) + 1)), '');
  if v_first is null then v_first := 'New'; end if;
  if v_last is null then v_last := 'Member'; end if;

  insert into public.members (
    organization_id, home_location_id, first_name, last_name, phone, email,
    status, joined_at, created_by
  ) values (
    p_organization_id, v_lead.location_id, v_first, v_last, v_lead.phone, v_lead.email,
    'active', (now() at time zone (select timezone from public.organizations where id=p_organization_id))::date, auth.uid()
  ) returning id into v_member_id;

  update public.leads
     set stage='joined', converted_member_id=v_member_id, updated_at=now()
   where id=v_lead.id;

  insert into public.audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  values (p_organization_id,auth.uid(),'lead.converted','lead',v_lead.id::text,jsonb_build_object('member_id',v_member_id));

  return v_member_id;
end;
$$;

revoke all on function public.convert_lead_to_member(uuid,uuid) from public;
grant execute on function public.convert_lead_to_member(uuid,uuid) to authenticated;
