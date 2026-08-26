-- Layer 2: resilient, idempotent onboarding.
-- Current product model: one active organization workspace per auth user.

create unique index if not exists organization_members_one_active_user_idx
  on public.organization_members (user_id)
  where is_active = true;

create or replace function public.create_organization_with_branding(
  p_name text,
  p_country_code text default 'LB',
  p_timezone text default 'Asia/Beirut',
  p_base_currency text default 'USD',
  p_location_name text default 'Main Branch',
  p_theme_accent text default '#7c3aed',
  p_theme_background text default '#f6f7fb',
  p_theme_sidebar text default '#111827'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_location_id uuid;
  v_base_slug text;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if coalesce(trim(p_name), '') = '' then
    raise exception 'organization name is required';
  end if;

  if p_theme_accent !~ '^#[0-9A-Fa-f]{6}$'
     or p_theme_background !~ '^#[0-9A-Fa-f]{6}$'
     or p_theme_sidebar !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid branding color';
  end if;

  if exists (
    select 1
    from public.organization_members om
    where om.user_id = v_user_id
      and om.is_active = true
  ) then
    raise exception 'user already belongs to an organization';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then v_base_slug := 'gym'; end if;
  v_slug := v_base_slug;

  loop
    begin
      insert into public.organizations (
        name, slug, country_code, timezone, base_currency,
        theme_accent, theme_background, theme_sidebar
      ) values (
        trim(p_name), v_slug, upper(trim(p_country_code)), p_timezone,
        upper(trim(p_base_currency)), lower(p_theme_accent),
        lower(p_theme_background), lower(p_theme_sidebar)
      )
      returning id into v_org_id;
      exit;
    exception
      when unique_violation then
        v_slug := v_base_slug || '-' ||
          substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end;
  end loop;

  insert into public.locations (organization_id, name, timezone)
  values (
    v_org_id,
    coalesce(nullif(trim(p_location_name), ''), 'Main Branch'),
    p_timezone
  )
  returning id into v_location_id;

  insert into public.organization_members (
    organization_id, user_id, role, location_id
  )
  values (v_org_id, v_user_id, 'owner', v_location_id);

  insert into public.saas_subscriptions (
    organization_id, plan_code, status, trial_ends_at
  )
  values (v_org_id, 'trial', 'trialing', now() + interval '14 days');

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  )
  values (
    v_org_id, v_user_id, 'organization.created', 'organization', v_org_id::text,
    jsonb_build_object(
      'name', trim(p_name),
      'location_id', v_location_id,
      'theme_accent', lower(p_theme_accent),
      'theme_background', lower(p_theme_background),
      'theme_sidebar', lower(p_theme_sidebar)
    )
  );

  return v_org_id;
end;
$$;

create or replace function public.create_organization(
  p_name text,
  p_country_code text default 'LB',
  p_timezone text default 'Asia/Beirut',
  p_base_currency text default 'USD',
  p_location_name text default 'Main Branch'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.create_organization_with_branding(
    p_name, p_country_code, p_timezone, p_base_currency, p_location_name,
    '#111318', '#f6f7f9', '#ffffff'
  );
end;
$$;

revoke execute on function public.create_organization_with_branding(text,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.create_organization(text,text,text,text,text) from public, anon;
grant execute on function public.create_organization_with_branding(text,text,text,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.create_organization(text,text,text,text,text) to authenticated, service_role;
