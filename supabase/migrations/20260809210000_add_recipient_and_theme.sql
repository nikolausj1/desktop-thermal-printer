-- Recipient and theme become first-class message fields so the receipt
-- can print "MESSAGE FOR / <NAME>" and identify which theme sent it.
-- Both are nullable: messages submitted before this change have neither.

alter table public.messages
  add column recipient varchar(10),
  add column theme varchar(16);

create or replace function public.submit_public_message_v3(
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
  p_theme text default null
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
    from public.submit_public_message_v2(
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
      p_hold_for_review
    ) as submission;

  if v_result_code = 'ok' and v_result_public_id is not null then
    update public.messages as message
       set recipient = coalesce(
             message.recipient,
             left(nullif(btrim(p_recipient), ''), 10)
           ),
           theme = coalesce(
             message.theme,
             case
               when btrim(p_theme) in ('airmail', 'owl-post') then btrim(p_theme)
               else null
             end
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
  location_label text,
  recipient text,
  theme text
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
    message.location_label::text,
    message.recipient::text,
    message.theme::text;
end;
$$;

revoke all on function public.submit_public_message_v3(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, boolean, text, text
) from public, anon, authenticated;
revoke all on function public.claim_next_print_job(text, text) from public, anon, authenticated;

grant execute on function public.submit_public_message_v3(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, boolean, text, text
) to service_role;
grant execute on function public.claim_next_print_job(text, text) to service_role;
