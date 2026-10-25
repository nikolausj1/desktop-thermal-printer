-- Public demo notes need their own source and a terminal status that the
-- worker can never claim. Enum additions live in their own migration because
-- Postgres refuses to USE a new enum value inside the transaction that added
-- it; the next migration file (its own transaction) does the using.

alter type public.message_source add value if not exists 'public_demo';
alter type public.message_status add value if not exists 'demo_delivered';
