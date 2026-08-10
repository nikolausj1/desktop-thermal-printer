-- Phone notifications: when a message reaches a state Justin cares about
-- (printed, failed, held for review), POST a small JSON payload to a
-- webhook. The webhook URL lives in a private settings table, deliberately
-- NOT in this migration, because the repository is public.

create extension if not exists pg_net with schema extensions;

create table if not exists public.notification_settings (
  key text primary key,
  value text not null
);

alter table public.notification_settings enable row level security;
revoke all on table public.notification_settings from public, anon, authenticated;

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
  if new.status = 'sent_to_printer' then
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

-- Thin wrapper so the trigger body stays readable and the pg_net call
-- site is one place.
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
      'theme', p_message.theme
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
$$;

drop trigger if exists messages_notify_events on public.messages;
create trigger messages_notify_events
  after insert or update of status on public.messages
  for each row execute function public.notify_message_event();
