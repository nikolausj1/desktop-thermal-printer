create type public.message_source as enum (
  'web',
  'admin_test',
  'future_channel'
);

create type public.message_status as enum (
  'submitted',
  'approved',
  'queued',
  'claimed',
  'printing',
  'sent_to_printer',
  'failed',
  'delivery_unknown',
  'expired',
  'rejected',
  'held_for_review',
  'deleted'
);

create type public.moderation_status as enum (
  'pending',
  'approved',
  'rejected',
  'held_for_review'
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('msg_' || replace(gen_random_uuid()::text, '-', '')),
  sequence_number bigint generated always as identity unique,
  sender_name varchar(30),
  message_text varchar(500) not null,
  source public.message_source not null default 'web',
  status public.message_status not null default 'submitted',
  moderation_status public.moderation_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  claimed_at timestamptz,
  printing_at timestamptz,
  sent_to_printer_at timestamptz,
  failed_at timestamptz,
  expired_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  client_idempotency_key uuid unique,
  sender_fingerprint text,
  ip_hash text,
  user_agent_summary text,
  failure_code text,
  failure_message text,
  worker_id text,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_nonempty_text check (length(btrim(message_text)) > 0)
);

create index messages_claimable_idx
  on public.messages (sequence_number)
  where status = 'queued';

create table public.printer_status (
  printer_id text primary key,
  worker_id text not null,
  worker_online boolean not null default false,
  printer_reachable boolean not null default false,
  accepting_messages boolean not null default false,
  manual_pause boolean not null default false,
  queue_length integer not null default 0 check (queue_length >= 0),
  cover_open boolean,
  cutter_error boolean,
  paper_end boolean,
  paper_near_end boolean,
  printer_offline boolean,
  last_heartbeat_at timestamptz,
  last_successful_print_at timestamptz,
  last_error_code text,
  last_error_summary text,
  worker_version text not null,
  updated_at timestamptz not null default now()
);

alter table public.messages enable row level security;
alter table public.printer_status enable row level security;

revoke all on table public.messages from anon, authenticated;
revoke all on table public.printer_status from anon, authenticated;
grant all on table public.messages to service_role;
grant all on table public.printer_status to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create trigger printer_status_set_updated_at
before update on public.printer_status
for each row execute function public.set_updated_at();

create or replace function public.record_worker_heartbeat(
  p_worker_id text,
  p_worker_version text,
  p_printer_id text,
  p_accepting_messages boolean,
  p_printer_reachable boolean,
  p_cover_open boolean,
  p_cutter_error boolean,
  p_paper_end boolean,
  p_paper_near_end boolean,
  p_printer_offline boolean,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue_length integer;
begin
  select count(*)::integer
    into v_queue_length
    from public.messages
   where status = 'queued'
     and expires_at > now();

  insert into public.printer_status (
    printer_id,
    worker_id,
    worker_online,
    printer_reachable,
    accepting_messages,
    queue_length,
    cover_open,
    cutter_error,
    paper_end,
    paper_near_end,
    printer_offline,
    last_heartbeat_at,
    last_error_code,
    last_error_summary,
    worker_version
  ) values (
    p_printer_id,
    p_worker_id,
    true,
    p_printer_reachable,
    p_accepting_messages,
    v_queue_length,
    p_cover_open,
    p_cutter_error,
    p_paper_end,
    p_paper_near_end,
    p_printer_offline,
    now(),
    p_error_code,
    p_error_code,
    p_worker_version
  )
  on conflict (printer_id) do update set
    worker_id = excluded.worker_id,
    worker_online = true,
    printer_reachable = excluded.printer_reachable,
    accepting_messages = excluded.accepting_messages,
    queue_length = excluded.queue_length,
    cover_open = excluded.cover_open,
    cutter_error = excluded.cutter_error,
    paper_end = excluded.paper_end,
    paper_near_end = excluded.paper_near_end,
    printer_offline = excluded.printer_offline,
    last_heartbeat_at = excluded.last_heartbeat_at,
    last_error_code = excluded.last_error_code,
    last_error_summary = excluded.last_error_summary,
    worker_version = excluded.worker_version;
end;
$$;

create or replace function public.claim_next_print_job(
  p_worker_id text,
  p_printer_id text
)
returns table (
  id uuid,
  public_id text,
  sequence_number bigint,
  sender_name text,
  message_text text,
  submitted_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages
     set status = 'expired',
         expired_at = now()
   where status = 'queued'
     and expires_at <= now();

  if not exists (
    select 1
      from public.printer_status
     where printer_id = p_printer_id
       and worker_id = p_worker_id
       and last_heartbeat_at > now() - interval '45 seconds'
       and printer_reachable
       and accepting_messages
       and not manual_pause
  ) then
    return;
  end if;

  return query
  with candidate as (
    select message.id
      from public.messages as message
     where message.status = 'queued'
       and message.expires_at > now()
     order by message.sequence_number
     for update skip locked
     limit 1
  )
  update public.messages as message
     set status = 'claimed',
         claimed_at = now(),
         worker_id = p_worker_id
    from candidate
   where message.id = candidate.id
  returning
    message.id,
    message.public_id,
    message.sequence_number,
    message.sender_name::text,
    message.message_text::text,
    message.submitted_at,
    message.expires_at;
end;
$$;

create or replace function public.mark_print_job_printing(
  p_job_id uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.messages
     set status = 'printing',
         printing_at = now()
   where id = p_job_id
     and worker_id = p_worker_id
     and status = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.complete_print_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_failure_code text default null,
  p_failure_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_status not in ('sent_to_printer', 'failed', 'delivery_unknown') then
    raise exception 'Unsupported completion status';
  end if;

  update public.messages
     set status = p_status::public.message_status,
         sent_to_printer_at = case when p_status = 'sent_to_printer' then now() else sent_to_printer_at end,
         failed_at = case when p_status in ('failed', 'delivery_unknown') then now() else failed_at end,
         failure_code = p_failure_code,
         failure_message = left(p_failure_message, 250)
   where id = p_job_id
     and worker_id = p_worker_id
     and status in ('claimed', 'printing');

  get diagnostics v_updated = row_count;

  if v_updated = 1 and p_status = 'sent_to_printer' then
    update public.printer_status
       set last_successful_print_at = now(),
           last_error_code = null,
           last_error_summary = null
     where worker_id = p_worker_id;
  end if;

  if v_updated = 0 then
    return exists (
      select 1
        from public.messages
       where id = p_job_id
         and worker_id = p_worker_id
         and status::text = p_status
    );
  end if;

  return true;
end;
$$;

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
begin
  select *
    into v_status
    from public.printer_status
   where printer_id = p_printer_id;

  if not found or v_status.last_heartbeat_at <= now() - interval '45 seconds' then
    return jsonb_build_object(
      'status', 'offline',
      'label', 'Printer offline',
      'message', 'The printer is not available right now.',
      'acceptingMessages', false
    );
  end if;

  if v_status.manual_pause then
    return jsonb_build_object(
      'status', 'paused',
      'label', 'Printer paused',
      'message', 'Messages are temporarily paused.',
      'acceptingMessages', false
    );
  end if;

  if not v_status.printer_reachable or not v_status.accepting_messages then
    return jsonb_build_object(
      'status', 'offline',
      'label', 'Printer offline',
      'message', 'The printer is not available right now.',
      'acceptingMessages', false
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

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.record_worker_heartbeat(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.claim_next_print_job(text, text) from public, anon, authenticated;
revoke all on function public.mark_print_job_printing(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_print_job(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_public_printer_status(text) from public;

grant execute on function public.record_worker_heartbeat(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text) to service_role;
grant execute on function public.claim_next_print_job(text, text) to service_role;
grant execute on function public.mark_print_job_printing(uuid, text) to service_role;
grant execute on function public.complete_print_job(uuid, text, text, text, text) to service_role;
grant execute on function public.get_public_printer_status(text) to service_role;
