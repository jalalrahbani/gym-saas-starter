-- Branding personalization: organization theme colors + public branding assets.
alter table public.organizations
  add column if not exists theme_accent text not null default '#111318',
  add column if not exists theme_background text not null default '#f6f7f9',
  add column if not exists theme_sidebar text not null default '#ffffff';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_theme_accent_hex') then
    alter table public.organizations add constraint organizations_theme_accent_hex check (theme_accent ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_theme_background_hex') then
    alter table public.organizations add constraint organizations_theme_background_hex check (theme_background ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_theme_sidebar_hex') then
    alter table public.organizations add constraint organizations_theme_sidebar_hex check (theme_sidebar ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-branding', 'gym-branding', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=true, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists gym_branding_select on storage.objects;
drop policy if exists gym_branding_insert on storage.objects;
drop policy if exists gym_branding_update on storage.objects;
drop policy if exists gym_branding_delete on storage.objects;

create policy gym_branding_select on storage.objects for select to authenticated
using (bucket_id='gym-branding' and public.is_org_member(public.safe_uuid((storage.foldername(name))[1])));

create policy gym_branding_insert on storage.objects for insert to authenticated
with check (bucket_id='gym-branding' and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin']::public.app_role[]));

create policy gym_branding_update on storage.objects for update to authenticated
using (bucket_id='gym-branding' and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin']::public.app_role[]))
with check (bucket_id='gym-branding' and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin']::public.app_role[]));

create policy gym_branding_delete on storage.objects for delete to authenticated
using (bucket_id='gym-branding' and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin']::public.app_role[]));
