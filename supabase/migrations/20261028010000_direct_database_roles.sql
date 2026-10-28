-- The site (Vercel) and the worker (NUC) now connect to the database directly
-- through the pooler, each as its own role that can execute only the
-- functions it needs. This replaces every path through Supabase's API gateway
-- (first edge functions, then the REST attempt in 20261028000000), because
-- the free plan shuts the whole gateway off when a quota is exceeded, while
-- direct connections keep working and are not metered.
--
-- Passwords are never in a migration; they are set out of band with
-- `alter role ... password`.

drop function if exists public.worker_heartbeat(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text);
drop function if exists public.worker_claim(text, text);
drop function if exists public.worker_mark_printing(text, uuid);
drop function if exists public.worker_complete(text, uuid, text, text, text);
drop function if exists public.worker_caller_allowed();

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'papertelegram_site') then
    create role papertelegram_site login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'papertelegram_worker') then
    create role papertelegram_worker login noinherit;
  end if;
end
$$;

alter role papertelegram_site set statement_timeout = '8s';
alter role papertelegram_worker set statement_timeout = '15s';

grant usage on schema public to papertelegram_site, papertelegram_worker;

-- The dashboard read, as a function so the site role needs no table access.
create or replace function public.get_dashboard_messages(p_limit integer default 300)
returns table (
  public_id text,
  sequence_number bigint,
  sender_name text,
  message_text text,
  recipient text,
  theme text,
  status text,
  source text,
  household text,
  submitted_at timestamptz,
  sent_to_printer_at timestamptz,
  failure_message text,
  device_label text,
  location_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select message.public_id,
         message.sequence_number,
         message.sender_name::text,
         message.message_text::text,
         message.recipient::text,
         message.theme::text,
         message.status::text,
         message.source::text,
         message.household::text,
         message.submitted_at,
         message.sent_to_printer_at,
         message.failure_message,
         message.device_label::text,
         message.location_label::text
    from public.messages as message
   order by message.submitted_at desc
   limit greatest(1, least(coalesce(p_limit, 300), 1000));
$$;

revoke all on function public.get_dashboard_messages(integer) from public, anon, authenticated;

grant execute on function public.get_public_printer_status(text) to papertelegram_site;
grant execute on function public.get_public_message_status(text) to papertelegram_site;
grant execute on function public.submit_public_message_v4(
  text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text
) to papertelegram_site;
grant execute on function public.submit_demo_message(
  text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to papertelegram_site;
grant execute on function public.get_dashboard_messages(integer) to papertelegram_site, service_role;

grant execute on function public.record_worker_heartbeat(text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text) to papertelegram_worker;
grant execute on function public.claim_next_print_job(text, text) to papertelegram_worker;
grant execute on function public.mark_print_job_printing(uuid, text) to papertelegram_worker;
grant execute on function public.complete_print_job(uuid, text, text, text, text) to papertelegram_worker;
