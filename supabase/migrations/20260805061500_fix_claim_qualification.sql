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
    message.expires_at;
end;
$$;
