# Paper Telegram

A separate public website for family and friends to send Chase or Vinny a short
message that prints as a real piece of receipt paper.

This site is intentionally independent from the original desk-printer page at
`justinnikolaus.com/printer`.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Use `npm run build` to validate the production build and `npm test` to run the
rendered-page checks.

## Message delivery

The browser talks to this site's own `/api/printer` route handlers, which call
the queue's database functions directly over a pooled Postgres connection as a
role that can execute nothing else. A page served from a private family link sends its key with every
call; only a current key reaches the print queue, and everything else becomes
a public demo note that is pushed to Justin's phone. The worker on the home
server picks queued telegrams up the same way with its own database role. No
Supabase edge functions or REST calls are involved: Supabase meters and, past
the free quota, shuts off that whole API gateway, while direct connections keep
working.
