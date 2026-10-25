-- Family links and the public demo (2026-10-24).
--
-- Real telegrams now arrive through private per-household links, and the
-- public root becomes a demo. Each message records the household label of
-- the link it came through. Demo notes are stored with source 'public_demo'
-- and the terminal status 'demo_delivered': they are never 'queued', so the
-- Windows worker never sees them, and the notification trigger posts them as
-- a 'demo' event so they reach Justin's phone.

alter table public.messages
  add column household varchar(40);

-- Demo rate limits count demo rows only, so a busy public page can never eat
-- the family's quota. Plain (non-partial) index so this migration does not
-- evaluate the new enum literal.
create index messages_source_ip_submitted_idx
  on public.messages (source, ip_hash, submitted_at desc);

-- v4: v3 plus the household label.
create or replace function public.submit_public_message_v4(
  p_printer_id text,
  p_sender_name text,
  p_message_text text,
  p_client_idempotency_key uuid,
  p_ip_hash text,
  p_sender_fingerprint text,
  p_content_hash text,
  p_user_agent_summary text,
  p_device_label text,
  p_location_city text,
  p_location_region text,
  p_location_country text,
  p_location_country_code text,
  p_location_label text,
  p_hold_for_review boolean default false,
  p_recipient text default null,
  p_theme text default null,
  p_household text default null
)
returns table (
  result_code text,
  result_public_id text,
  result_status text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result_code text;
  v_result_public_id text;
  v_result_status text;
  v_retry_after_seconds integer;
begin
  select submission.result_code,
         submission.result_public_id,
         submission.result_status,
         submission.retry_after_seconds
    into v_result_code,
         v_result_public_id,
         v_result_status,
         v_retry_after_seconds
    from public.submit_public_message_v3(
      p_printer_id,
      p_sender_name,
      p_message_text,
      p_client_idempotency_key,
      p_ip_hash,
      p_sender_fingerprint,
      p_content_hash,
      p_user_agent_summary,
      p_device_label,
      p_location_city,
      p_location_region,
      p_location_country,
      p_location_country_code,
      p_location_label,
      p_hold_for_review,
      p_recipient,
      p_theme
    ) as submission;

  if v_result_code = 'ok' and v_result_public_id is not null then
    update public.messages as message
       set household = coalesce(
             message.household,
             left(nullif(btrim(p_household), ''), 40)
           )
     where message.public_id = v_result_public_id;
  end if;

  return query
  select v_result_code,
         v_result_public_id,
         v_result_status,
         v_retry_after_seconds;
end;
$$;

-- A public demo note. Same shape and the same validation and limits as a real
-- submission, but it lands directly in the terminal 'demo_delivered' status
-- and never touches the print queue. Limits are counted over demo rows only.
create or replace function public.submit_demo_message(
  p_sender_name text,
  p_message_text text,
  p_client_idempotency_key uuid,
  p_ip_hash text,
  p_sender_fingerprint text,
  p_content_hash text,
  p_user_agent_summary text,
  p_device_label text,
  p_location_city text,
  p_location_region text,
  p_location_country text,
  p_location_country_code text,
  p_location_label text,
  p_recipient text default null,
  p_theme text default null,
  p_household text default null
)
returns table (
  result_code text,
  result_public_id text,
  result_status text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.printer_settings%rowtype;
  v_existing public.messages%rowtype;
  v_created public.messages%rowtype;
  v_count integer;
begin
  perform pg_advisory_xact_lock(820, 3);

  select *
    into v_existing
    from public.messages as message
   where message.client_idempotency_key = p_client_idempotency_key
     and message.ip_hash = p_ip_hash;

  if found then
    return query select 'ok', v_existing.public_id, v_existing.status::text, null::integer;
    return;
  end if;

  if exists (
    select 1
      from public.messages as message
     where message.client_idempotency_key = p_client_idempotency_key
  ) then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'demo_invalid_idempotency');
    return query select 'invalid', null::text, null::text, null::integer;
    return;
  end if;

  if p_message_text is null
     or length(btrim(p_message_text)) < 1
     or length(p_message_text) > 300
     or (length(p_message_text) - length(replace(p_message_text, chr(10), ''))) > 8
     or (p_sender_name is not null and length(p_sender_name) > 30) then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'demo_invalid');
    return query select 'invalid', null::text, null::text, null::integer;
    return;
  end if;

  select *
    into v_settings
    from public.printer_settings as settings
   where settings.printer_id = 'desk-rp820';

  if not found then
    return query select 'invalid', null::text, null::text, null::integer;
    return;
  end if;

  select count(*)::integer
    into v_count
    from public.messages as message
   where message.source = 'public_demo'
     and message.ip_hash = p_ip_hash
     and message.submitted_at >= now() - make_interval(mins => v_settings.per_ip_window_minutes);

  if v_count >= v_settings.per_ip_window_limit then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'demo_rate_limited_window');
    return query select 'rate_limited', null::text, null::text, v_settings.per_ip_window_minutes * 60;
    return;
  end if;

  select count(*)::integer
    into v_count
    from public.messages as message
   where message.source = 'public_demo'
     and message.ip_hash = p_ip_hash
     and message.submitted_at >= date_trunc('day', now());

  if v_count >= v_settings.per_ip_daily_limit then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'demo_rate_limited_daily');
    return query select 'rate_limited', null::text, null::text, 86400;
    return;
  end if;

  select count(*)::integer
    into v_count
    from public.messages as message
   where message.source = 'public_demo'
     and message.submitted_at >= date_trunc('day', now());

  if v_count >= v_settings.global_daily_limit then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'demo_global_daily_limit');
    return query select 'daily_limit', null::text, null::text, 86400;
    return;
  end if;

  if exists (
    select 1
      from public.messages as message
     where message.source = 'public_demo'
       and message.ip_hash = p_ip_hash
       and message.submitted_at >= now() - make_interval(mins => v_settings.duplicate_cooldown_minutes)
       and message.content_hash = p_content_hash
  ) then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'demo_duplicate_content');
    return query select 'duplicate', null::text, null::text, v_settings.duplicate_cooldown_minutes * 60;
    return;
  end if;

  insert into public.messages (
    sender_name,
    message_text,
    source,
    status,
    moderation_status,
    approved_at,
    expires_at,
    client_idempotency_key,
    sender_fingerprint,
    ip_hash,
    user_agent_summary,
    content_hash,
    device_label,
    location_city,
    location_region,
    location_country,
    location_country_code,
    location_label,
    recipient,
    theme,
    household
  ) values (
    nullif(btrim(p_sender_name), ''),
    p_message_text,
    'public_demo',
    'demo_delivered',
    'approved',
    now(),
    now(),
    p_client_idempotency_key,
    p_sender_fingerprint,
    p_ip_hash,
    left(p_user_agent_summary, 120),
    p_content_hash,
    left(nullif(btrim(p_device_label), ''), 40),
    left(nullif(btrim(p_location_city), ''), 100),
    left(nullif(btrim(p_location_region), ''), 100),
    left(nullif(btrim(p_location_country), ''), 100),
    upper(left(nullif(btrim(p_location_country_code), ''), 2)),
    left(nullif(btrim(p_location_label), ''), 220),
    left(nullif(btrim(p_recipient), ''), 10),
    case when btrim(p_theme) in ('airmail', 'owl-post') then btrim(p_theme) else null end,
    left(nullif(btrim(p_household), ''), 40)
  )
  returning * into v_created;

  insert into public.submission_attempts (ip_hash, content_hash, outcome)
  values (p_ip_hash, p_content_hash, 'demo_delivered');

  return query select 'ok', v_created.public_id, v_created.status::text, null::integer;
end;
$$;

-- The public status endpoint learns the demo state.
create or replace function public.get_public_message_status(
  p_public_id text
)
returns table (
  current_status text,
  label text,
  public_message text,
  terminal boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.message_status;
begin
  select message.status
    into v_status
    from public.messages as message
   where message.public_id = p_public_id;

  if not found then
    return query select 'not_found', 'Message not found', 'This message could not be found.', true;
  elsif v_status in ('submitted', 'approved', 'queued', 'claimed') then
    return query select v_status::text, 'Message received', 'Waiting for the printer.', false;
  elsif v_status = 'printing' then
    return query select v_status::text, 'Printing on Justin''s desk', 'Your message is being sent now.', false;
  elsif v_status = 'sent_to_printer' then
    return query select v_status::text, 'Sent to the printer', 'Your message was sent to the printer successfully.', true;
  elsif v_status = 'demo_delivered' then
    return query select v_status::text, 'Note delivered to Justin', 'This was the public demo, so nothing printed. Justin received your note.', true;
  elsif v_status = 'held_for_review' then
    return query select v_status::text, 'Message received', 'This message is waiting for review.', false;
  elsif v_status = 'expired' then
    return query select v_status::text, 'Message expired', 'The printer became unavailable before this message could be sent.', true;
  elsif v_status = 'delivery_unknown' then
    return query select v_status::text, 'Delivery could not be confirmed', 'The message may have printed, but final delivery could not be confirmed.', true;
  elsif v_status in ('rejected', 'deleted') then
    return query select v_status::text, 'Message unavailable', 'This message could not be accepted.', true;
  else
    return query select v_status::text, 'Message not sent', 'Your message could not be sent.', true;
  end if;
end;
$$;

-- Phone notifications: demo notes become a 'demo' event, and every event now
-- carries the household label and the source.
create or replace function public.notify_message_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_event text;
begin
  if new.source = 'public_demo' then
    if new.status = 'demo_delivered' then
      v_event := 'demo';
    else
      return new;
    end if;
  elsif new.status = 'sent_to_printer' then
    v_event := 'printed';
  elsif new.status in ('failed', 'delivery_unknown') then
    v_event := 'failed';
  elsif new.status = 'held_for_review' then
    v_event := 'held';
  else
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  select value into v_url
    from public.notification_settings
   where key = 'notify_webhook_url';
  if v_url is null then
    return new;
  end if;

  -- A notification failure must never break the print pipeline.
  begin
    perform extensions.net_http_post_compat(v_url, new, v_event);
  exception when others then
    null;
  end;

  return new;
end;
$$;

create or replace function extensions.net_http_post_compat(
  p_url text,
  p_message public.messages,
  p_event text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := p_url,
    body := jsonb_build_object(
      'event', p_event,
      'recipient', p_message.recipient,
      'sender', p_message.sender_name,
      'message', p_message.message_text,
      'public_id', p_message.public_id,
      'sequence_number', p_message.sequence_number,
      'theme', p_message.theme,
      'household', p_message.household,
      'source', p_message.source::text
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
$$;

revoke all on function public.submit_public_message_v4(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) from public, anon, authenticated;
revoke all on function public.submit_demo_message(
  text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.submit_public_message_v4(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) to service_role;
grant execute on function public.submit_demo_message(
  text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;
