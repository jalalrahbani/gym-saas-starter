-- Layer 5 runtime/API hardening.
-- Adds webhook processing leases and removes direct access to superseded
-- non-idempotent transaction RPCs.

alter table public.webhook_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.webhook_events'::regclass
      and conname = 'webhook_events_attempt_count_nonnegative'
  ) then
    alter table public.webhook_events
      add constraint webhook_events_attempt_count_nonnegative
      check (attempt_count >= 0);
  end if;
end
$$;

create index if not exists webhook_events_unprocessed_claim_idx
  on public.webhook_events (provider, processing_started_at)
  where processed_at is null;

create or replace function public.claim_webhook_event(
  p_provider text,
  p_external_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.webhook_events%rowtype;
  v_lease_seconds integer :=
    greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
begin
  if coalesce(trim(p_provider), '') = ''
     or coalesce(trim(p_external_event_id), '') = ''
     or coalesce(trim(p_event_type), '') = '' then
    raise exception 'webhook identity is required';
  end if;

  insert into public.webhook_events(
    provider,
    external_event_id,
    event_type,
    payload
  )
  values(
    trim(p_provider),
    trim(p_external_event_id),
    trim(p_event_type),
    p_payload
  )
  on conflict(provider, external_event_id) do nothing;

  select *
  into v_event
  from public.webhook_events
  where provider = trim(p_provider)
    and external_event_id = trim(p_external_event_id)
  for update;

  if v_event.id is null then
    raise exception 'unable to load webhook event';
  end if;

  if v_event.processed_at is not null then
    return jsonb_build_object(
      'state', 'processed',
      'event_row_id', v_event.id,
      'attempt_count', v_event.attempt_count
    );
  end if;

  if v_event.processing_started_at is not null
     and v_event.processing_started_at >
       now() - make_interval(secs => v_lease_seconds) then
    return jsonb_build_object(
      'state', 'busy',
      'event_row_id', v_event.id,
      'attempt_count', v_event.attempt_count
    );
  end if;

  update public.webhook_events
  set event_type = trim(p_event_type),
      payload = p_payload,
      processing_started_at = now(),
      attempt_count = attempt_count + 1,
      error_message = null
  where id = v_event.id
  returning * into v_event;

  return jsonb_build_object(
    'state', 'claimed',
    'event_row_id', v_event.id,
    'attempt_count', v_event.attempt_count
  );
end;
$$;

create or replace function public.finish_webhook_event(
  p_event_row_id uuid,
  p_success boolean,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.webhook_events%rowtype;
begin
  select *
  into v_event
  from public.webhook_events
  where id = p_event_row_id
  for update;

  if v_event.id is null then
    return false;
  end if;

  if p_success then
    if v_event.processed_at is not null then
      return false;
    end if;

    update public.webhook_events
    set processed_at = now(),
        processing_started_at = null,
        error_message = null
    where id = p_event_row_id;
  else
    update public.webhook_events
    set processing_started_at = null,
        error_message = left(
          coalesce(p_error_message, 'Webhook processing failed'),
          1000
        )
    where id = p_event_row_id
      and processed_at is null;
  end if;

  return true;
end;
$$;

revoke all
  on function public.claim_webhook_event(text,text,text,jsonb,integer)
  from public, anon, authenticated;
revoke all
  on function public.finish_webhook_event(uuid,boolean,text)
  from public, anon, authenticated;

grant execute
  on function public.claim_webhook_event(text,text,text,jsonb,integer)
  to service_role;
grant execute
  on function public.finish_webhook_event(uuid,boolean,text)
  to service_role;

revoke execute
  on function public.record_payment(
    uuid,uuid,uuid,uuid,bigint,text,text,text,text
  )
  from authenticated;

revoke execute
  on function public.enroll_membership(
    uuid,uuid,uuid,date,bigint,text,text
  )
  from authenticated;

revoke execute
  on function public.import_members(uuid,uuid,jsonb)
  from authenticated;

revoke execute
  on function public.book_class(uuid,uuid,uuid)
  from authenticated;
