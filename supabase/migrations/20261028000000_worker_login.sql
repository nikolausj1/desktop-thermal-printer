-- The worker on the NUC now talks to the database API directly, signed in as
-- its own Supabase Auth user, instead of going through the worker-api edge
-- function (Supabase meters edge invocations and the 2 second poll exhausted
-- the free quota; REST and Auth calls are not metered).
--
-- These wrappers are the only things that login can execute. Each one checks
-- that the caller is the printer's user, whose id lives in the private
-- settings table, then calls the existing service-only function.

create or replace function public.worker_caller_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expected uuid;
begin
  select value::uuid
    into v_expected
    from public.notification_settings
   where key = 'worker_user_id';
  return v_expected is not null and auth.uid() = v_expected;
end;
$$;

create or replace function public.worker_heartbeat(
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
begin
  if not public.worker_caller_allowed() then
    raise exception 'not the printer worker' using errcode = '42501';
  end if;
  perform public.record_worker_heartbeat(
    p_worker_id, p_worker_version, p_printer_id, p_accepting_messages,
    p_printer_reachable, p_cover_open, p_cutter_error, p_paper_end,
    p_paper_near_end, p_printer_offline, p_error_code
  );
end;
$$;

create or replace function public.worker_claim(
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
  expires_at timestamptz,
  device_label text,
  location_label text,
  recipient text,
  theme text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.worker_caller_allowed() then
    raise exception 'not the printer worker' using errcode = '42501';
  end if;
  return query select * from public.claim_next_print_job(p_worker_id, p_printer_id);
end;
$$;

create or replace function public.worker_mark_printing(
  p_worker_id text,
  p_job_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.worker_caller_allowed() then
    raise exception 'not the printer worker' using errcode = '42501';
  end if;
  return public.mark_print_job_printing(p_job_id, p_worker_id);
end;
$$;

create or replace function public.worker_complete(
  p_worker_id text,
  p_job_id uuid,
  p_status text,
  p_failure_code text default null,
  p_failure_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.worker_caller_allowed() then
    raise exception 'not the printer worker' using errcode = '42501';
  end if;
  return public.complete_print_job(p_job_id, p_worker_id, p_status, p_failure_code, p_failure_message);
end;
$$;

revoke all on function public.worker_caller_allowed() from public, anon, authenticated;
revoke all on function public.worker_heartbeat(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text) from public, anon;
revoke all on function public.worker_claim(text, text) from public, anon;
revoke all on function public.worker_mark_printing(text, uuid) from public, anon;
revoke all on function public.worker_complete(text, uuid, text, text, text) from public, anon;

grant execute on function public.worker_heartbeat(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text) to authenticated, service_role;
grant execute on function public.worker_claim(text, text) to authenticated, service_role;
grant execute on function public.worker_mark_printing(text, uuid) to authenticated, service_role;
grant execute on function public.worker_complete(text, uuid, text, text, text) to authenticated, service_role;
