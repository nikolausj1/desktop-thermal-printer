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

The browser talks to the existing protected printer API through the local
`/api/printer` route. A selected recipient is added to the telegram before it
enters the existing queue, so no Windows worker change is required for this
first version.
