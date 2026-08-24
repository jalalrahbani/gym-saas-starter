-- Atomic CSV member import. Parsing/mapping happens in the application;
-- this RPC guarantees an all-or-nothing database write.

create or replace function public.import_members(
  p_organization_id uuid,
  p_home_location_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_count integer := 0;
  v_status public.member_status;
  v_joined date;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception']::public.app_role[]) then
    raise exception 'not authorized';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;
  if jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then raise exception 'import must contain 1 to 5000 rows'; end if;
  if not exists (select 1 from public.locations where id=p_home_location_id and organization_id=p_organization_id and is_active) then
    raise exception 'invalid home location';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if coalesce(trim(v_row->>'first_name'),'')='' or coalesce(trim(v_row->>'last_name'),'')='' then
      raise exception 'every imported member requires first_name and last_name';
    end if;
    v_status := coalesce(nullif(v_row->>'status','')::public.member_status, 'active'::public.member_status);
    v_joined := coalesce(nullif(v_row->>'joined_at','')::date, public.organization_local_date(p_organization_id));

    insert into public.members (
      organization_id,home_location_id,first_name,last_name,phone,email,date_of_birth,status,joined_at,created_by
    ) values (
      p_organization_id,p_home_location_id,trim(v_row->>'first_name'),trim(v_row->>'last_name'),
      nullif(trim(v_row->>'phone'),''),nullif(lower(trim(v_row->>'email')),''),
      nullif(v_row->>'date_of_birth','')::date,v_status,v_joined,auth.uid()
    );
    v_count := v_count + 1;
  end loop;

  insert into public.audit_logs (organization_id,actor_user_id,action,entity_type,after_data)
  values (p_organization_id,auth.uid(),'members.imported','member_import',jsonb_build_object('count',v_count,'location_id',p_home_location_id));
  return v_count;
end;
$$;

revoke all on function public.import_members(uuid,uuid,jsonb) from public;
grant execute on function public.import_members(uuid,uuid,jsonb) to authenticated;
