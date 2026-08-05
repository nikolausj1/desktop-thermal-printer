alter table public.messages
  add column device_label varchar(40),
  add column location_city varchar(100),
  add column location_region varchar(100),
  add column location_country varchar(100),
  add column location_country_code varchar(2),
  add column location_label varchar(220);

create or replace function public.submit_public_message_v2(
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
    from public.submit_public_message(
      p_printer_id,
      p_sender_name,
      p_message_text,
      p_client_idempotency_key,
      p_ip_hash,
      p_sender_fingerprint,
      p_content_hash,
      p_user_agent_summary,
      p_hold_for_review
    ) as submission;

  if v_result_code = 'ok' and v_result_public_id is not null then
    update public.messages as message
       set device_label = coalesce(
             message.device_label,
             left(nullif(btrim(p_device_label), ''), 40)
           ),
           location_city = coalesce(
             message.location_city,
             left(nullif(btrim(p_location_city), ''), 100)
           ),
           location_region = coalesce(
             message.location_region,
             left(nullif(btrim(p_location_region), ''), 100)
           ),
           location_country = coalesce(
             message.location_country,
             left(nullif(btrim(p_location_country), ''), 100)
           ),
           location_country_code = coalesce(
             message.location_country_code,
             upper(left(nullif(btrim(p_location_country_code), ''), 2))
           ),
           location_label = coalesce(
             message.location_label,
             left(nullif(btrim(p_location_label), ''), 220)
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

drop function public.claim_next_print_job(text, text);

create function public.claim_next_print_job(
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
  location_label text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages as message
     set status = 'expired',
         expired_at = now()
   where message.status = 'queued'
     and message.expires_at <= now();

  if not exists (
    select 1
      from public.printer_status as status
     where status.printer_id = p_printer_id
       and status.worker_id = p_worker_id
       and status.last_heartbeat_at > now() - interval '45 seconds'
       and status.printer_reachable
       and status.accepting_messages
       and not status.manual_pause
  ) then
    return;
  end if;

  return query
  with candidate as (
    select queued_message.id
      from public.messages as queued_message
     where queued_message.status = 'queued'
       and queued_message.expires_at > now()
     order by queued_message.sequence_number
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
    message.expires_at,
    message.device_label::text,
    message.location_label::text;
end;
$$;

revoke all on function public.submit_public_message_v2(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.claim_next_print_job(text, text) from public, anon, authenticated;

grant execute on function public.submit_public_message_v2(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, boolean
) to service_role;
grant execute on function public.claim_next_print_job(text, text) to service_role;
