create table public.printer_settings (
  printer_id text primary key,
  public_submissions_enabled boolean not null default false,
  per_ip_window_minutes integer not null default 10 check (per_ip_window_minutes between 1 and 1440),
  per_ip_window_limit integer not null default 3 check (per_ip_window_limit between 1 and 100),
  per_ip_daily_limit integer not null default 20 check (per_ip_daily_limit between 1 and 1000),
  global_daily_limit integer not null default 100 check (global_daily_limit between 1 and 10000),
  duplicate_cooldown_minutes integer not null default 10 check (duplicate_cooldown_minutes between 1 and 1440),
  job_expiration_minutes integer not null default 15 check (job_expiration_minutes between 1 and 120),
  updated_at timestamptz not null default now()
);

insert into public.printer_settings (printer_id)
values ('desk-rp820')
on conflict (printer_id) do nothing;

create table public.submission_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  content_hash text,
  outcome text not null,
  created_at timestamptz not null default now()
);

alter table public.messages
  add column content_hash text;

create index messages_ip_content_submitted_idx
  on public.messages (ip_hash, content_hash, submitted_at desc)
  where source = 'web';

create index submission_attempts_ip_created_idx
  on public.submission_attempts (ip_hash, created_at desc);

alter table public.printer_settings enable row level security;
alter table public.submission_attempts enable row level security;

revoke all on table public.printer_settings from anon, authenticated;
revoke all on table public.submission_attempts from anon, authenticated;
grant all on table public.printer_settings to service_role;
grant all on table public.submission_attempts to service_role;
grant usage, select on all sequences in schema public to service_role;

create trigger printer_settings_set_updated_at
before update on public.printer_settings
for each row execute function public.set_updated_at();

create or replace function public.get_public_printer_status(
  p_printer_id text default 'desk-rp820'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.printer_status%rowtype;
  v_settings public.printer_settings%rowtype;
  v_active_jobs integer;
begin
  select *
    into v_settings
    from public.printer_settings as settings
   where settings.printer_id = p_printer_id;

  if not found or not v_settings.public_submissions_enabled then
    return jsonb_build_object(
      'status', 'paused',
      'label', 'Messages paused',
      'message', 'The printer is not accepting new messages right now.',
      'acceptingMessages', false
    );
  end if;

  select *
    into v_status
    from public.printer_status as status
   where status.printer_id = p_printer_id;

  if not found or v_status.last_heartbeat_at <= now() - interval '45 seconds' then
    return jsonb_build_object(
      'status', 'offline',
      'label', 'Printer offline',
      'message', 'New messages are temporarily unavailable.',
      'acceptingMessages', false
    );
  end if;

  if v_status.manual_pause then
    return jsonb_build_object(
      'status', 'paused',
      'label', 'Messages paused',
      'message', 'The printer is not accepting new messages right now.',
      'acceptingMessages', false
    );
  end if;

  if not v_status.printer_reachable or not v_status.accepting_messages then
    return jsonb_build_object(
      'status', 'offline',
      'label', 'Printer offline',
      'message', 'New messages are temporarily unavailable.',
      'acceptingMessages', false
    );
  end if;

  select count(*)::integer
    into v_active_jobs
    from public.messages as message
   where message.status in ('queued', 'claimed', 'printing')
     and message.expires_at > now();

  if v_active_jobs > 0 then
    return jsonb_build_object(
      'status', 'busy',
      'label', 'Printer busy',
      'message', 'Your message will be added to the short queue.',
      'acceptingMessages', true
    );
  end if;

  return jsonb_build_object(
    'status', 'online',
    'label', 'Printer online',
    'message', 'Ready to print now.',
    'acceptingMessages', true
  );
end;
$$;

create or replace function public.submit_public_message(
  p_printer_id text,
  p_sender_name text,
  p_message_text text,
  p_client_idempotency_key uuid,
  p_ip_hash text,
  p_sender_fingerprint text,
  p_content_hash text,
  p_user_agent_summary text,
  p_hold_for_review boolean default false
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
  v_printer public.printer_status%rowtype;
  v_existing public.messages%rowtype;
  v_created public.messages%rowtype;
  v_count integer;
begin
  perform pg_advisory_xact_lock(820, 2);

  delete from public.submission_attempts
   where created_at < now() - interval '31 days';

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
    values (p_ip_hash, p_content_hash, 'invalid_idempotency');
    return query select 'invalid', null::text, null::text, null::integer;
    return;
  end if;

  if p_message_text is null
     or length(btrim(p_message_text)) < 1
     or length(p_message_text) > 300
     or (length(p_message_text) - length(replace(p_message_text, chr(10), ''))) > 8
     or (p_sender_name is not null and length(p_sender_name) > 30) then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'invalid');
    return query select 'invalid', null::text, null::text, null::integer;
    return;
  end if;

  select *
    into v_settings
    from public.printer_settings as settings
   where settings.printer_id = p_printer_id;

  if not found or not v_settings.public_submissions_enabled then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'paused');
    return query select 'paused', null::text, null::text, 30;
    return;
  end if;

  select *
    into v_printer
    from public.printer_status as status
   where status.printer_id = p_printer_id;

  if not found
     or v_printer.last_heartbeat_at <= now() - interval '45 seconds'
     or not v_printer.printer_reachable
     or not v_printer.accepting_messages then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'offline');
    return query select 'offline', null::text, null::text, 30;
    return;
  end if;

  if v_printer.manual_pause then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'paused');
    return query select 'paused', null::text, null::text, 30;
    return;
  end if;

  select count(*)::integer
    into v_count
    from public.messages as message
   where message.source = 'web'
     and message.ip_hash = p_ip_hash
     and message.submitted_at >= now() - make_interval(mins => v_settings.per_ip_window_minutes);

  if v_count >= v_settings.per_ip_window_limit then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'rate_limited_window');
    return query select 'rate_limited', null::text, null::text, v_settings.per_ip_window_minutes * 60;
    return;
  end if;

  select count(*)::integer
    into v_count
    from public.messages as message
   where message.source = 'web'
     and message.ip_hash = p_ip_hash
     and message.submitted_at >= date_trunc('day', now());

  if v_count >= v_settings.per_ip_daily_limit then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'rate_limited_daily');
    return query select 'rate_limited', null::text, null::text, 86400;
    return;
  end if;

  select count(*)::integer
    into v_count
    from public.messages as message
   where message.source = 'web'
     and message.submitted_at >= date_trunc('day', now());

  if v_count >= v_settings.global_daily_limit then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'global_daily_limit');
    return query select 'daily_limit', null::text, null::text, 86400;
    return;
  end if;

  if exists (
    select 1
      from public.messages as message
     where message.source = 'web'
       and message.ip_hash = p_ip_hash
       and message.status in ('queued', 'claimed', 'printing')
       and message.expires_at > now()
  ) then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'concurrent_job');
    return query select 'rate_limited', null::text, null::text, 30;
    return;
  end if;

  if exists (
    select 1
      from public.messages as message
     where message.source = 'web'
       and message.ip_hash = p_ip_hash
       and message.status not in ('rejected', 'deleted')
       and message.submitted_at >= now() - make_interval(mins => v_settings.duplicate_cooldown_minutes)
       and message.content_hash = p_content_hash
  ) then
    insert into public.submission_attempts (ip_hash, content_hash, outcome)
    values (p_ip_hash, p_content_hash, 'duplicate_content');
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
    content_hash
  ) values (
    nullif(btrim(p_sender_name), ''),
    p_message_text,
    'web',
    case when p_hold_for_review then 'held_for_review'::public.message_status else 'queued'::public.message_status end,
    case when p_hold_for_review then 'held_for_review'::public.moderation_status else 'approved'::public.moderation_status end,
    case when p_hold_for_review then null else now() end,
    now() + make_interval(mins => v_settings.job_expiration_minutes),
    p_client_idempotency_key,
    p_sender_fingerprint,
    p_ip_hash,
    left(p_user_agent_summary, 120),
    p_content_hash
  )
  returning * into v_created;

  insert into public.submission_attempts (ip_hash, content_hash, outcome)
  values (
    p_ip_hash,
    p_content_hash,
    case when p_hold_for_review then 'held_for_review' else 'queued' end
  );

  return query select 'ok', v_created.public_id, v_created.status::text, null::integer;
end;
$$;

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

revoke all on function public.submit_public_message(text, text, text, uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.get_public_message_status(text) from public, anon, authenticated;
grant execute on function public.submit_public_message(text, text, text, uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.get_public_message_status(text) to service_role;
