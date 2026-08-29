-- Layer 4: idempotent core transactions and controlled financial mutation.

create table if not exists private.operation_idempotency (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operation text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  response jsonb not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, operation, idempotency_key)
);
create index if not exists operation_idempotency_created_idx
  on private.operation_idempotency (created_at);
revoke all on private.operation_idempotency from public, anon, authenticated;
grant all on private.operation_idempotency to service_role;

create or replace function private.idempotency_replay(
  p_organization_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row private.operation_idempotency%rowtype;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_operation || ':' || p_idempotency_key::text,
      0
    )
  );

  select * into v_row
  from private.operation_idempotency
  where organization_id=p_organization_id
    and operation=p_operation
    and idempotency_key=p_idempotency_key;

  if v_row.idempotency_key is null then return null; end if;
  if v_row.request_hash <> p_request_hash then
    raise exception 'idempotency key was reused with different request data';
  end if;
  return v_row.response;
end;
$$;

create or replace function private.idempotency_store(
  p_organization_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_response jsonb
)
returns void
language sql
security definer
set search_path=''
as $$
  insert into private.operation_idempotency(
    organization_id,operation,idempotency_key,request_hash,response,actor_user_id
  ) values (
    p_organization_id,p_operation,p_idempotency_key,p_request_hash,p_response,auth.uid()
  );
$$;

revoke all on function private.idempotency_replay(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function private.idempotency_store(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.idempotency_replay(uuid,text,uuid,text) to service_role;
grant execute on function private.idempotency_store(uuid,text,uuid,text,jsonb) to service_role;

create or replace function public.create_member_idempotent(
  p_organization_id uuid,
  p_home_location_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_date_of_birth date,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_joined_at date,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_hash text;
  v_replay jsonb;
  v_member_id uuid;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  if coalesce(trim(p_first_name),'')='' or coalesce(trim(p_last_name),'')='' then
    raise exception 'member name is required';
  end if;

  v_hash := md5(jsonb_build_object(
    'home_location_id',p_home_location_id,
    'first_name',trim(p_first_name),
    'last_name',trim(p_last_name),
    'phone',nullif(trim(p_phone),''),
    'email',nullif(lower(trim(p_email)),''),
    'date_of_birth',p_date_of_birth,
    'emergency_contact_name',nullif(trim(p_emergency_contact_name),''),
    'emergency_contact_phone',nullif(trim(p_emergency_contact_phone),''),
    'joined_at',p_joined_at
  )::text);

  v_replay := private.idempotency_replay(
    p_organization_id,'member.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'member_id')::uuid; end if;

  insert into public.members(
    organization_id,home_location_id,first_name,last_name,phone,email,date_of_birth,
    emergency_contact_name,emergency_contact_phone,status,joined_at,created_by
  ) values (
    p_organization_id,p_home_location_id,trim(p_first_name),trim(p_last_name),
    nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),p_date_of_birth,
    nullif(trim(p_emergency_contact_name),''),nullif(trim(p_emergency_contact_phone),''),
    'active',coalesce(p_joined_at,public.organization_local_date(p_organization_id)),auth.uid()
  ) returning id into v_member_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,auth.uid(),'member.created','member',v_member_id::text,
    jsonb_build_object('first_name',trim(p_first_name),'last_name',trim(p_last_name))
  );

  perform private.idempotency_store(
    p_organization_id,'member.create',p_idempotency_key,v_hash,
    jsonb_build_object('member_id',v_member_id)
  );
  return v_member_id;
end;
$$;

create or replace function public.import_members_idempotent(
  p_organization_id uuid,
  p_home_location_id uuid,
  p_rows jsonb,
  p_idempotency_key uuid
)
returns integer
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_hash text;
  v_replay jsonb;
  v_count integer;
begin
  v_hash := md5(jsonb_build_object(
    'home_location_id',p_home_location_id,
    'rows',p_rows
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'members.import',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'count')::integer; end if;

  v_count := public.import_members(p_organization_id,p_home_location_id,p_rows);
  perform private.idempotency_store(
    p_organization_id,'members.import',p_idempotency_key,v_hash,
    jsonb_build_object('count',v_count)
  );
  return v_count;
end;
$$;

create or replace function public.enroll_membership_idempotent(
  p_organization_id uuid,
  p_member_id uuid,
  p_plan_id uuid,
  p_starts_on date,
  p_amount_paid_minor bigint,
  p_payment_method text,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_hash text;
  v_replay jsonb;
  v_response jsonb;
begin
  v_hash := md5(jsonb_build_object(
    'member_id',p_member_id,'plan_id',p_plan_id,'starts_on',p_starts_on,
    'amount_paid_minor',p_amount_paid_minor,'payment_method',p_payment_method,
    'note',nullif(trim(p_note),'')
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'membership.enroll',p_idempotency_key,v_hash
  );
  if v_replay is not null then return v_replay; end if;

  v_response := public.enroll_membership(
    p_organization_id,p_member_id,p_plan_id,p_starts_on,p_amount_paid_minor,
    p_payment_method,p_note
  );
  perform private.idempotency_store(
    p_organization_id,'membership.enroll',p_idempotency_key,v_hash,v_response
  );
  return v_response;
end;
$$;

create or replace function public.record_payment_idempotent(
  p_organization_id uuid,
  p_location_id uuid,
  p_member_id uuid,
  p_membership_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_payment_method text,
  p_external_reference text,
  p_note text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_hash text;
  v_replay jsonb;
  v_payment_id uuid;
begin
  v_hash := md5(jsonb_build_object(
    'location_id',p_location_id,'member_id',p_member_id,
    'membership_id',p_membership_id,'amount_minor',p_amount_minor,
    'currency',upper(p_currency),'payment_method',p_payment_method,
    'external_reference',nullif(trim(p_external_reference),''),
    'note',nullif(trim(p_note),'')
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'payment.record',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'payment_id')::uuid; end if;

  v_payment_id := public.record_payment(
    p_organization_id,p_location_id,p_member_id,p_membership_id,p_amount_minor,
    p_currency,p_payment_method,p_external_reference,p_note
  );
  perform private.idempotency_store(
    p_organization_id,'payment.record',p_idempotency_key,v_hash,
    jsonb_build_object('payment_id',v_payment_id)
  );
  return v_payment_id;
end;
$$;

create or replace function public.void_payment(
  p_organization_id uuid,
  p_payment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_payment public.payments%rowtype;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','accountant']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  select * into v_payment
  from public.payments
  where id=p_payment_id and organization_id=p_organization_id
  for update;
  if v_payment.id is null then raise exception 'payment not found'; end if;

  if v_payment.status='voided' then return false; end if;
  if v_payment.status<>'paid' then
    raise exception 'only paid payments can be voided';
  end if;

  update public.payments
  set status='voided',voided_at=now()
  where id=p_payment_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,auth.uid(),'payment.voided','payment',p_payment_id::text,
    jsonb_build_object('status','paid'),jsonb_build_object('status','voided')
  );
  return true;
end;
$$;

revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.memberships from authenticated;
revoke insert, update, delete on public.membership_freezes from authenticated;

revoke execute on function public.create_member_idempotent(uuid,uuid,text,text,text,text,date,text,text,date,uuid) from public,anon;
revoke execute on function public.import_members_idempotent(uuid,uuid,jsonb,uuid) from public,anon;
revoke execute on function public.enroll_membership_idempotent(uuid,uuid,uuid,date,bigint,text,text,uuid) from public,anon;
revoke execute on function public.record_payment_idempotent(uuid,uuid,uuid,uuid,bigint,text,text,text,text,uuid) from public,anon;
revoke execute on function public.void_payment(uuid,uuid) from public,anon;
grant execute on function public.create_member_idempotent(uuid,uuid,text,text,text,text,date,text,text,date,uuid) to authenticated,service_role;
grant execute on function public.import_members_idempotent(uuid,uuid,jsonb,uuid) to authenticated,service_role;
grant execute on function public.enroll_membership_idempotent(uuid,uuid,uuid,date,bigint,text,text,uuid) to authenticated,service_role;
grant execute on function public.record_payment_idempotent(uuid,uuid,uuid,uuid,bigint,text,text,text,text,uuid) to authenticated,service_role;
grant execute on function public.void_payment(uuid,uuid) to authenticated,service_role;
