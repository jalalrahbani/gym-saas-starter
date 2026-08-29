
-- Layer 4 finalization: shared trainer scheduling, idempotent operational creates,
-- atomic CRM transitions, and safe member archival.

create or replace function private.lock_trainer_schedule(
  p_organization_id uuid,
  p_trainer_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_trainer_user_id is null then
    return;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      'trainer-schedule:' || p_organization_id::text || ':' || p_trainer_user_id::text,
      0
    )
  );
end;
$$;

create or replace function private.assert_trainer_available(
  p_organization_id uuid,
  p_trainer_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_pt_session_id uuid default null,
  p_exclude_class_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_trainer_user_id is null then
    return;
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'session end must be after start';
  end if;

  if exists (
    select 1
    from public.pt_sessions ps
    where ps.organization_id = p_organization_id
      and ps.trainer_user_id = p_trainer_user_id
      and ps.status = 'scheduled'::public.session_status
      and (p_exclude_pt_session_id is null or ps.id <> p_exclude_pt_session_id)
      and tstzrange(ps.starts_at, ps.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'trainer already has a PT session during this time';
  end if;

  if exists (
    select 1
    from public.class_sessions cs
    where cs.organization_id = p_organization_id
      and cs.trainer_user_id = p_trainer_user_id
      and cs.status = 'scheduled'
      and (p_exclude_class_session_id is null or cs.id <> p_exclude_class_session_id)
      and tstzrange(cs.starts_at, cs.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'trainer already has a class during this time';
  end if;
end;
$$;

revoke all on function private.lock_trainer_schedule(uuid,uuid) from public, anon, authenticated;
revoke all on function private.assert_trainer_available(uuid,uuid,timestamptz,timestamptz,uuid,uuid) from public, anon, authenticated;
grant execute on function private.lock_trainer_schedule(uuid,uuid) to service_role;
grant execute on function private.assert_trainer_available(uuid,uuid,timestamptz,timestamptz,uuid,uuid) to service_role;

create or replace function public.create_membership_plan_idempotent(
  p_organization_id uuid,
  p_location_id uuid,
  p_name text,
  p_billing_type text,
  p_duration_days integer,
  p_included_visits integer,
  p_price_minor bigint,
  p_currency text,
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
  v_plan_id uuid;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  if coalesce(trim(p_name),'') = '' then raise exception 'plan name is required'; end if;
  if p_billing_type not in ('one_time','recurring','visit_pack') then raise exception 'invalid billing type'; end if;
  if p_duration_days is not null and p_duration_days <= 0 then raise exception 'duration must be positive'; end if;
  if p_included_visits is not null and p_included_visits <= 0 then raise exception 'included visits must be positive'; end if;
  if p_price_minor < 0 then raise exception 'price cannot be negative'; end if;
  if coalesce(trim(p_currency),'') = '' then raise exception 'currency is required'; end if;

  v_hash := md5(jsonb_build_object(
    'location_id',p_location_id,'name',trim(p_name),'billing_type',p_billing_type,
    'duration_days',p_duration_days,'included_visits',p_included_visits,
    'price_minor',p_price_minor,'currency',upper(trim(p_currency))
  )::text);

  v_replay := private.idempotency_replay(
    p_organization_id,'membership_plan.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'plan_id')::uuid; end if;

  insert into public.membership_plans(
    organization_id,location_id,name,billing_type,duration_days,included_visits,
    price_minor,currency
  ) values (
    p_organization_id,p_location_id,trim(p_name),p_billing_type,p_duration_days,p_included_visits,
    p_price_minor,upper(trim(p_currency))
  ) returning id into v_plan_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,auth.uid(),'membership_plan.created','membership_plan',v_plan_id::text,
    jsonb_build_object('name',trim(p_name),'billing_type',p_billing_type,'price_minor',p_price_minor,'currency',upper(trim(p_currency)))
  );

  perform private.idempotency_store(
    p_organization_id,'membership_plan.create',p_idempotency_key,v_hash,
    jsonb_build_object('plan_id',v_plan_id)
  );
  return v_plan_id;
end;
$$;

create or replace function public.create_pt_package_idempotent(
  p_organization_id uuid,
  p_member_id uuid,
  p_trainer_user_id uuid,
  p_sessions integer,
  p_expires_on date,
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
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  ) then raise exception 'not authorized'; end if;
  if p_sessions <= 0 then raise exception 'sessions must be greater than zero'; end if;
  if not exists (
    select 1 from public.members m
    where m.id=p_member_id and m.organization_id=p_organization_id and m.archived_at is null
  ) then raise exception 'invalid member'; end if;
  if p_trainer_user_id is not null and not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=p_trainer_user_id
      and om.is_active
      and om.role in ('owner','admin','manager','trainer')
  ) then raise exception 'invalid trainer'; end if;
  if p_expires_on is not null and p_expires_on < public.organization_local_date(p_organization_id) then
    raise exception 'PT package expiry cannot be in the past';
  end if;

  v_hash := md5(jsonb_build_object(
    'member_id',p_member_id,'trainer_user_id',p_trainer_user_id,
    'sessions',p_sessions,'expires_on',p_expires_on
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'pt_package.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'package_id')::uuid; end if;

  insert into public.pt_packages(
    organization_id,member_id,trainer_user_id,sessions_purchased,sessions_remaining,expires_on
  ) values (
    p_organization_id,p_member_id,p_trainer_user_id,p_sessions,p_sessions,p_expires_on
  ) returning id into v_package_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,auth.uid(),'pt_package.created','pt_package',v_package_id::text,
    jsonb_build_object('member_id',p_member_id,'trainer_user_id',p_trainer_user_id,'sessions',p_sessions,'expires_on',p_expires_on)
  );

  perform private.idempotency_store(
    p_organization_id,'pt_package.create',p_idempotency_key,v_hash,
    jsonb_build_object('package_id',v_package_id)
  );
  return v_package_id;
end;
$$;

create or replace function public.create_pt_session_idempotent(
  p_organization_id uuid,
  p_location_id uuid,
  p_member_id uuid,
  p_trainer_user_id uuid,
  p_pt_package_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
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
  v_session_id uuid;
  v_package public.pt_packages%rowtype;
  v_reserved integer;
  v_is_coordinator boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  );
  if not v_is_coordinator and p_trainer_user_id <> auth.uid() then
    raise exception 'trainer may create only their own sessions';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'session end must be after start'; end if;

  if not exists (
    select 1 from public.members m
    where m.id=p_member_id and m.organization_id=p_organization_id and m.archived_at is null
  ) then raise exception 'invalid member'; end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=p_trainer_user_id
      and om.is_active
      and om.role in ('owner','admin','manager','trainer')
  ) then raise exception 'invalid trainer'; end if;

  if p_location_id is not null and not exists (
    select 1 from public.locations l
    where l.id=p_location_id and l.organization_id=p_organization_id and l.is_active
  ) then raise exception 'invalid location'; end if;

  v_hash := md5(jsonb_build_object(
    'location_id',p_location_id,'member_id',p_member_id,'trainer_user_id',p_trainer_user_id,
    'pt_package_id',p_pt_package_id,'starts_at',p_starts_at,'ends_at',p_ends_at,
    'notes',nullif(trim(p_notes),'')
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'pt_session.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'session_id')::uuid; end if;

  if p_pt_package_id is not null then
    select * into v_package
    from public.pt_packages
    where id=p_pt_package_id
      and organization_id=p_organization_id
      and member_id=p_member_id
    for update;
    if v_package.id is null then raise exception 'PT package does not match member'; end if;
    if v_package.expires_on is not null
       and v_package.expires_on < public.organization_local_date(p_organization_id) then
      raise exception 'PT package is expired';
    end if;
    if v_package.trainer_user_id is not null
       and v_package.trainer_user_id <> p_trainer_user_id then
      raise exception 'PT package is assigned to another trainer';
    end if;
    select count(*) into v_reserved
    from public.pt_sessions ps
    where ps.pt_package_id=p_pt_package_id
      and ps.organization_id=p_organization_id
      and ps.status='scheduled'::public.session_status;
    if v_reserved >= v_package.sessions_remaining then
      raise exception 'PT package has no unreserved sessions remaining';
    end if;
  end if;

  perform private.lock_trainer_schedule(p_organization_id,p_trainer_user_id);
  perform private.assert_trainer_available(
    p_organization_id,p_trainer_user_id,p_starts_at,p_ends_at,null,null
  );

  insert into public.pt_sessions(
    organization_id,location_id,member_id,trainer_user_id,pt_package_id,
    starts_at,ends_at,status,notes
  ) values (
    p_organization_id,p_location_id,p_member_id,p_trainer_user_id,p_pt_package_id,
    p_starts_at,p_ends_at,'scheduled',nullif(trim(p_notes),'')
  ) returning id into v_session_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,auth.uid(),'pt.session_created','pt_session',v_session_id::text,
    jsonb_build_object('member_id',p_member_id,'trainer_user_id',p_trainer_user_id,'starts_at',p_starts_at,'ends_at',p_ends_at,'pt_package_id',p_pt_package_id)
  );

  perform private.idempotency_store(
    p_organization_id,'pt_session.create',p_idempotency_key,v_hash,
    jsonb_build_object('session_id',v_session_id)
  );
  return v_session_id;
end;
$$;

create or replace function public.reschedule_pt_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_session public.pt_sessions%rowtype;
  v_is_coordinator boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized'; end if;
  if p_ends_at <= p_starts_at then raise exception 'session end must be after start'; end if;

  select * into v_session
  from public.pt_sessions
  where id=p_session_id and organization_id=p_organization_id
  for update;
  if v_session.id is null then raise exception 'session not found'; end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  );
  if not v_is_coordinator and v_session.trainer_user_id <> auth.uid() then
    raise exception 'trainer may reschedule only assigned sessions';
  end if;
  if v_session.status <> 'scheduled' then raise exception 'only scheduled PT sessions can be rescheduled'; end if;
  if v_session.starts_at = p_starts_at and v_session.ends_at = p_ends_at then return false; end if;

  perform private.lock_trainer_schedule(p_organization_id,v_session.trainer_user_id);
  perform private.assert_trainer_available(
    p_organization_id,v_session.trainer_user_id,p_starts_at,p_ends_at,p_session_id,null
  );

  update public.pt_sessions
  set starts_at=p_starts_at,ends_at=p_ends_at
  where id=p_session_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,auth.uid(),'pt.session_rescheduled','pt_session',p_session_id::text,
    jsonb_build_object('starts_at',v_session.starts_at,'ends_at',v_session.ends_at),
    jsonb_build_object('starts_at',p_starts_at,'ends_at',p_ends_at)
  );
  return true;
end;
$$;

create or replace function public.cancel_pt_session(
  p_organization_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_session public.pt_sessions%rowtype;
  v_is_coordinator boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  select * into v_session
  from public.pt_sessions
  where id=p_session_id and organization_id=p_organization_id
  for update;
  if v_session.id is null then raise exception 'session not found'; end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  );
  if not v_is_coordinator and v_session.trainer_user_id <> auth.uid() then
    raise exception 'trainer may cancel only assigned sessions';
  end if;
  if v_session.status='cancelled' then return false; end if;
  if v_session.status<>'scheduled' then raise exception 'only scheduled PT sessions can be cancelled'; end if;

  update public.pt_sessions set status='cancelled' where id=p_session_id;
  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,auth.uid(),'pt.session_cancelled','pt_session',p_session_id::text,
    jsonb_build_object('status',v_session.status,'starts_at',v_session.starts_at,'ends_at',v_session.ends_at),
    jsonb_build_object('status','cancelled')
  );
  return true;
end;
$$;

create or replace function public.create_group_class_idempotent(
  p_organization_id uuid,
  p_location_id uuid,
  p_name text,
  p_description text,
  p_capacity integer,
  p_duration_minutes integer,
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
  v_class_id uuid;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  ) then raise exception 'not authorized'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'class name is required'; end if;
  if p_capacity <= 0 or p_capacity > 500 then raise exception 'class capacity must be between 1 and 500'; end if;
  if p_duration_minutes < 10 or p_duration_minutes > 360 then raise exception 'class duration must be between 10 and 360 minutes'; end if;

  v_hash := md5(jsonb_build_object(
    'location_id',p_location_id,'name',trim(p_name),'description',nullif(trim(p_description),''),
    'capacity',p_capacity,'duration_minutes',p_duration_minutes
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'group_class.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'class_id')::uuid; end if;

  insert into public.group_classes(
    organization_id,location_id,name,description,capacity,duration_minutes
  ) values (
    p_organization_id,p_location_id,trim(p_name),nullif(trim(p_description),''),
    p_capacity,p_duration_minutes
  ) returning id into v_class_id;

  perform private.idempotency_store(
    p_organization_id,'group_class.create',p_idempotency_key,v_hash,
    jsonb_build_object('class_id',v_class_id)
  );
  return v_class_id;
end;
$$;

create or replace function public.create_class_session_idempotent(
  p_organization_id uuid,
  p_class_id uuid,
  p_location_id uuid,
  p_trainer_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_capacity integer,
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
  v_session_id uuid;
  v_is_coordinator boolean;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception','trainer']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  v_is_coordinator := public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  );
  if not v_is_coordinator and p_trainer_user_id <> auth.uid() then
    raise exception 'trainer may schedule only their own classes';
  end if;
  if p_capacity <= 0 or p_capacity > 500 then raise exception 'class capacity must be between 1 and 500'; end if;
  if p_ends_at <= p_starts_at then raise exception 'class end must be after start'; end if;

  if not exists (
    select 1 from public.group_classes gc
    where gc.id=p_class_id and gc.organization_id=p_organization_id and gc.is_active
  ) then raise exception 'invalid class'; end if;

  if p_location_id is not null and not exists (
    select 1 from public.locations l
    where l.id=p_location_id and l.organization_id=p_organization_id and l.is_active
  ) then raise exception 'invalid location'; end if;

  if p_trainer_user_id is not null and not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=p_trainer_user_id
      and om.is_active
      and om.role in ('owner','admin','manager','trainer')
  ) then raise exception 'invalid trainer'; end if;

  v_hash := md5(jsonb_build_object(
    'class_id',p_class_id,'location_id',p_location_id,'trainer_user_id',p_trainer_user_id,
    'starts_at',p_starts_at,'ends_at',p_ends_at,'capacity',p_capacity
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'class_session.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'session_id')::uuid; end if;

  if p_trainer_user_id is not null then
    perform private.lock_trainer_schedule(p_organization_id,p_trainer_user_id);
    perform private.assert_trainer_available(
      p_organization_id,p_trainer_user_id,p_starts_at,p_ends_at,null,null
    );
  end if;

  insert into public.class_sessions(
    organization_id,class_id,location_id,trainer_user_id,starts_at,ends_at,capacity,status
  ) values (
    p_organization_id,p_class_id,p_location_id,p_trainer_user_id,p_starts_at,p_ends_at,p_capacity,'scheduled'
  ) returning id into v_session_id;

  perform private.idempotency_store(
    p_organization_id,'class_session.create',p_idempotency_key,v_hash,
    jsonb_build_object('session_id',v_session_id)
  );
  return v_session_id;
end;
$$;

create or replace function public.book_class_idempotent(
  p_organization_id uuid,
  p_class_session_id uuid,
  p_member_id uuid,
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
    'class_session_id',p_class_session_id,'member_id',p_member_id
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'class_booking.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return v_replay; end if;

  v_response := public.book_class(p_organization_id,p_class_session_id,p_member_id);
  perform private.idempotency_store(
    p_organization_id,'class_booking.create',p_idempotency_key,v_hash,v_response
  );
  return v_response;
end;
$$;

create or replace function public.create_lead_idempotent(
  p_organization_id uuid,
  p_location_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_source text,
  p_next_follow_up_at timestamptz,
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
  v_lead_id uuid;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  ) then raise exception 'not authorized'; end if;
  if coalesce(trim(p_full_name),'')='' then raise exception 'lead name is required'; end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l
    where l.id=p_location_id and l.organization_id=p_organization_id and l.is_active
  ) then raise exception 'invalid location'; end if;

  v_hash := md5(jsonb_build_object(
    'location_id',p_location_id,'full_name',trim(p_full_name),
    'phone',nullif(trim(p_phone),''),'email',nullif(lower(trim(p_email)),''),
    'source',nullif(trim(p_source),''),'next_follow_up_at',p_next_follow_up_at
  )::text);
  v_replay := private.idempotency_replay(
    p_organization_id,'lead.create',p_idempotency_key,v_hash
  );
  if v_replay is not null then return (v_replay->>'lead_id')::uuid; end if;

  insert into public.leads(
    organization_id,location_id,full_name,phone,email,source,stage,next_follow_up_at,created_by
  ) values (
    p_organization_id,p_location_id,trim(p_full_name),nullif(trim(p_phone),''),
    nullif(lower(trim(p_email)),''),nullif(trim(p_source),''),'new',p_next_follow_up_at,auth.uid()
  ) returning id into v_lead_id;

  perform private.idempotency_store(
    p_organization_id,'lead.create',p_idempotency_key,v_hash,
    jsonb_build_object('lead_id',v_lead_id)
  );
  return v_lead_id;
end;
$$;

create or replace function public.update_lead_stage(
  p_organization_id uuid,
  p_lead_id uuid,
  p_stage text,
  p_lost_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_lead public.leads%rowtype;
  v_lost_reason text;
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','reception']::public.app_role[]
  ) then raise exception 'not authorized'; end if;
  if p_stage not in ('new','contacted','trial','negotiating','joined','lost') then
    raise exception 'invalid lead stage';
  end if;

  select * into v_lead
  from public.leads
  where id=p_lead_id and organization_id=p_organization_id
  for update;
  if v_lead.id is null then raise exception 'lead not found'; end if;

  if v_lead.converted_member_id is not null then
    if p_stage='joined' then return false; end if;
    raise exception 'converted leads cannot be moved to another stage';
  end if;

  v_lost_reason := case when p_stage='lost' then nullif(trim(p_lost_reason),'') else null end;
  if v_lead.stage=p_stage and coalesce(v_lead.lost_reason,'')=coalesce(v_lost_reason,'') then
    return false;
  end if;

  update public.leads
  set stage=p_stage,lost_reason=v_lost_reason,updated_at=now()
  where id=p_lead_id;

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,auth.uid(),'lead.stage_changed','lead',p_lead_id::text,
    jsonb_build_object('stage',v_lead.stage,'lost_reason',v_lead.lost_reason),
    jsonb_build_object('stage',p_stage,'lost_reason',v_lost_reason)
  );
  return true;
end;
$$;

create or replace function public.archive_member(
  p_organization_id uuid,
  p_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_member public.members%rowtype;
  v_now timestamptz := now();
begin
  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.app_role[]
  ) then raise exception 'not authorized'; end if;

  select * into v_member
  from public.members
  where id=p_member_id and organization_id=p_organization_id
  for update;
  if v_member.id is null then raise exception 'member not found'; end if;
  if v_member.archived_at is not null or v_member.status='archived' then return false; end if;

  if exists (
    select 1 from public.attendance_sessions a
    where a.organization_id=p_organization_id
      and a.member_id=p_member_id
      and a.checked_out_at is null
  ) then
    raise exception 'check the member out before archiving';
  end if;

  update public.members
  set status='archived',archived_at=v_now,updated_at=v_now
  where id=p_member_id;

  update public.access_credentials
  set is_active=false,revoked_at=coalesce(revoked_at,v_now),updated_at=v_now
  where organization_id=p_organization_id
    and member_id=p_member_id
    and is_active;

  update public.pt_sessions
  set status='cancelled'
  where organization_id=p_organization_id
    and member_id=p_member_id
    and status='scheduled'
    and starts_at>v_now;

  update public.class_bookings cb
  set status='cancelled',updated_at=v_now
  from public.class_sessions cs
  where cb.organization_id=p_organization_id
    and cb.member_id=p_member_id
    and cb.class_session_id=cs.id
    and cs.organization_id=p_organization_id
    and cs.status='scheduled'
    and cs.starts_at>v_now
    and cb.status in ('booked','waitlisted');

  update public.memberships
  set status='cancelled',updated_at=v_now
  where organization_id=p_organization_id
    and member_id=p_member_id
    and status in ('pending','active','paused');

  insert into public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,auth.uid(),'member.archived','member',p_member_id::text,
    jsonb_build_object('status',v_member.status,'archived_at',v_member.archived_at),
    jsonb_build_object('status','archived','archived_at',v_now)
  );
  return true;
end;
$$;

-- Restrict direct mutation now that critical writes have transaction RPCs.
revoke insert, update, delete on public.membership_plans from authenticated;
revoke insert, update, delete on public.pt_packages from authenticated;
revoke insert, update, delete on public.pt_sessions from authenticated;
revoke insert, update, delete on public.group_classes from authenticated;
revoke insert, update, delete on public.class_sessions from authenticated;
revoke insert, update, delete on public.class_bookings from authenticated;
revoke insert, update, delete on public.leads from authenticated;

revoke insert, update on public.members from authenticated;
grant update (
  home_location_id,first_name,last_name,phone,email,date_of_birth,
  emergency_contact_name,emergency_contact_phone,photo_path,updated_at
) on public.members to authenticated;

revoke execute on function public.create_membership_plan_idempotent(uuid,uuid,text,text,integer,integer,bigint,text,uuid) from public,anon;
revoke execute on function public.create_pt_package_idempotent(uuid,uuid,uuid,integer,date,uuid) from public,anon;
revoke execute on function public.create_pt_session_idempotent(uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid) from public,anon;
revoke execute on function public.reschedule_pt_session(uuid,uuid,timestamptz,timestamptz) from public,anon;
revoke execute on function public.cancel_pt_session(uuid,uuid) from public,anon;
revoke execute on function public.create_group_class_idempotent(uuid,uuid,text,text,integer,integer,uuid) from public,anon;
revoke execute on function public.create_class_session_idempotent(uuid,uuid,uuid,uuid,timestamptz,timestamptz,integer,uuid) from public,anon;
revoke execute on function public.book_class_idempotent(uuid,uuid,uuid,uuid) from public,anon;
revoke execute on function public.create_lead_idempotent(uuid,uuid,text,text,text,text,timestamptz,uuid) from public,anon;
revoke execute on function public.update_lead_stage(uuid,uuid,text,text) from public,anon;
revoke execute on function public.archive_member(uuid,uuid) from public,anon;

grant execute on function public.create_membership_plan_idempotent(uuid,uuid,text,text,integer,integer,bigint,text,uuid) to authenticated,service_role;
grant execute on function public.create_pt_package_idempotent(uuid,uuid,uuid,integer,date,uuid) to authenticated,service_role;
grant execute on function public.create_pt_session_idempotent(uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid) to authenticated,service_role;
grant execute on function public.reschedule_pt_session(uuid,uuid,timestamptz,timestamptz) to authenticated,service_role;
grant execute on function public.cancel_pt_session(uuid,uuid) to authenticated,service_role;
grant execute on function public.create_group_class_idempotent(uuid,uuid,text,text,integer,integer,uuid) to authenticated,service_role;
grant execute on function public.create_class_session_idempotent(uuid,uuid,uuid,uuid,timestamptz,timestamptz,integer,uuid) to authenticated,service_role;
grant execute on function public.book_class_idempotent(uuid,uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.create_lead_idempotent(uuid,uuid,text,text,text,text,timestamptz,uuid) to authenticated,service_role;
grant execute on function public.update_lead_stage(uuid,uuid,text,text) to authenticated,service_role;
grant execute on function public.archive_member(uuid,uuid) to authenticated,service_role;
