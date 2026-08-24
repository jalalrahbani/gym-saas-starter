-- Hardening: relational joins, immutable finance, class capacity, scheduling conflicts,
-- access credential revocation, and private member media storage.

create extension if not exists btree_gist;

-- Backfill profiles in case Auth users existed before the profile trigger was installed.
insert into public.profiles (user_id, full_name)
select u.id, nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name','')), '')
from auth.users u
on conflict (user_id) do nothing;

-- Gives PostgREST an explicit relationship for staff -> profile embeds.
alter table public.organization_members
  add constraint organization_members_profile_fk
  foreign key (user_id) references public.profiles(user_id) on delete cascade;

-- Prevent a trainer from being double-booked for PT sessions.
alter table public.pt_sessions
  add constraint pt_sessions_no_trainer_overlap
  exclude using gist (
    organization_id with =,
    trainer_user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'scheduled');

-- Financial rows are append/void/refund records, not editable accounting scratchpads.
create or replace function public.protect_payment_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.location_id is distinct from old.location_id
     or new.member_id is distinct from old.member_id
     or new.membership_id is distinct from old.membership_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.payment_method is distinct from old.payment_method
     or new.external_reference is distinct from old.external_reference
     or new.receipt_number is distinct from old.receipt_number
     or new.created_by is distinct from old.created_by
     or new.paid_at is distinct from old.paid_at
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable payment fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_immutable_fields on public.payments;
create trigger payments_immutable_fields before update on public.payments
for each row execute procedure public.protect_payment_immutable_fields();

-- Narrow membership updates to operational state fields.
revoke update on public.memberships from authenticated;
grant update (status, ends_on, visits_remaining, auto_renew, frozen_until, updated_at) on public.memberships to authenticated;

-- Class bookings go through an atomic capacity-aware RPC.
revoke insert, delete on public.class_bookings from authenticated;

create or replace function public.book_class(
  p_organization_id uuid,
  p_class_session_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.class_sessions%rowtype;
  v_booked integer;
  v_status text;
  v_id uuid;
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception','trainer']::public.app_role[]) then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.members where id=p_member_id and organization_id=p_organization_id and archived_at is null) then
    raise exception 'invalid member';
  end if;

  select * into v_session from public.class_sessions
    where id=p_class_session_id and organization_id=p_organization_id and status='scheduled'
    for update;
  if v_session.id is null then raise exception 'class session is not available'; end if;

  if exists (select 1 from public.class_bookings where class_session_id=p_class_session_id and member_id=p_member_id and status in ('booked','waitlisted','attended')) then
    raise exception 'member is already booked for this class';
  end if;

  select count(*) into v_booked from public.class_bookings
    where class_session_id=p_class_session_id and status in ('booked','attended');
  v_status := case when v_booked < v_session.capacity then 'booked' else 'waitlisted' end;

  insert into public.class_bookings (organization_id,class_session_id,member_id,status)
  values (p_organization_id,p_class_session_id,p_member_id,v_status)
  returning id into v_id;

  return jsonb_build_object('booking_id',v_id,'status',v_status);
end;
$$;
revoke all on function public.book_class(uuid,uuid,uuid) from public;
grant execute on function public.book_class(uuid,uuid,uuid) to authenticated;

create or replace function public.revoke_access_credential(p_organization_id uuid, p_credential_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(p_organization_id, array['owner','admin','manager','reception']::public.app_role[]) then
    raise exception 'not authorized';
  end if;
  update public.access_credentials
     set is_active=false, revoked_at=now(), updated_at=now()
   where id=p_credential_id and organization_id=p_organization_id and is_active=true;
  if not found then raise exception 'active credential not found'; end if;
end;
$$;
revoke all on function public.revoke_access_credential(uuid,uuid) from public;
grant execute on function public.revoke_access_credential(uuid,uuid) to authenticated;

-- Private member media. Objects are stored under: <organization_id>/members/<member_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-private', 'member-private', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy member_private_select on storage.objects for select to authenticated
using (
  bucket_id='member-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

create policy member_private_insert on storage.objects for insert to authenticated
with check (
  bucket_id='member-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','reception']::public.app_role[])
);

create policy member_private_update on storage.objects for update to authenticated
using (
  bucket_id='member-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','reception']::public.app_role[])
)
with check (
  bucket_id='member-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','reception']::public.app_role[])
);

-- Safe UUID parsing for user-controlled Storage object names. SQL boolean
-- expression ordering is not guaranteed, so never cast a path segment directly.
create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Recreate media policies with exception-safe path parsing.
drop policy if exists member_private_select on storage.objects;
drop policy if exists member_private_insert on storage.objects;
drop policy if exists member_private_update on storage.objects;

create policy member_private_select on storage.objects for select to authenticated
using (
  bucket_id='member-private'
  and public.is_org_member(public.safe_uuid((storage.foldername(name))[1]))
);

create policy member_private_insert on storage.objects for insert to authenticated
with check (
  bucket_id='member-private'
  and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin','manager','reception']::public.app_role[])
);

create policy member_private_update on storage.objects for update to authenticated
using (
  bucket_id='member-private'
  and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin','manager','reception']::public.app_role[])
)
with check (
  bucket_id='member-private'
  and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin','manager','reception']::public.app_role[])
);
