---
title: "STATUS - Desktop Thermal Printer"
created: 2026-08-04
modified: 2026-08-09
version: 3.18
author: OpenAI Codex (GPT-5)
tags:
---

# Desktop Thermal Printer - Status

## Project

A thermal-printer message system with two separate public experiences: the original desk-printer page at `justinnikolaus.com/printer`, plus the new Paper Telegram site for family and friends to send Chase or Vinny a note that becomes a real piece of paper.

## Stage

MVP / Paper Telegram redesign

## Health

🟢 On-track - The original public experience remains live and unchanged. A separate Paper Telegram site has been built and privately deployed for review, with broad and airmail-focused visual studies available locally. Production and the Windows worker remain unchanged.

## Waiting on Me

- [ ] **Review the round-3 airmail concepts and choose the final direction**
      - Codex round-3 gallery: `_review/paper-telegram-airmail-round3/index.html`
      - Claude round-3 gallery: `_review/paper-telegram-airmail-r3/index.html`
      - round-2 galleries for reference: `_review/paper-telegram-airmail-concepts/index.html` (Codex), `_review/paper-telegram-airmail-concepts/index-claude.html` (Claude)
      - round-1 galleries for reference: `_review/paper-telegram-concepts/index.html` (Codex), `_review/paper-telegram-concepts-claude/index.html` (Claude)
      - current private preview: `https://paper-telegram.just-aspen-8969.chatgpt.site`
- [ ] **Purchase `papertelegram.com` when ready**
      - unblocks: custom-domain connection and public launch
- [ ] **Reset the new Supabase project's database password in the dashboard** (~3 min)
      - unblocks: restoring the standard `supabase db push` path; authenticated Management API migrations and the running worker are not affected

## Next Up

1. Review the round-3 concepts and pick the final direction, or request further refinement.
2. Apply the approved visual direction to the separate Paper Telegram site.
3. Purchase and connect `papertelegram.com` after the site direction is approved.
4. Decide whether recipient should become a first-class queue field and a dedicated heading on the physical receipt. Any Windows worker change still requires explicit approval.
5. Reset the Supabase database password when convenient.

## Biggest Risk

Paper Telegram currently adds `FOR CHASE` or `FOR VINNY` to the beginning of the existing message body so it can use the verified worker unchanged. The physical receipt still uses the original generic layout until a dedicated recipient field and worker format are approved.

---

## Ideas Shelf

Drawn from the PRD's §21 Deferred Backlog, which is unusually well stocked:

- **(S) Lifetime printed-message counter on the public page** - small, gives visitors a sense of the thing being real and used.
- **(S) Receipt preview before sending** - render what the receipt will look like in the browser; cheap and makes the physical outcome tangible.
- **(M) Twilio SMS as a second input channel** - the PRD was explicitly architected for this, and the Build Guide now carries the hard-won A2P approval lessons from FourSome, so it starts three weeks ahead.
- **(S) Dedicated Chase/Vinny receipt heading** - promote recipient to a first-class queue field and print it prominently above the telegram.
- **(L) QR code for Justin to reply** - closes the loop from one-way novelty into an actual exchange.

## Notes

- The PRD (`PRD - Desktop Thermal Printer.md`) was written with ChatGPT and is complete: architecture, data model, public API, job lifecycle, 20 acceptance criteria, four build phases, 14 open questions, and a definition of the first successful demo. It is the source of truth for scope.
- Agent instructions live in `AGENTS.md` because Codex reads that filename by convention. `CLAUDE.md` points there so both toolchains follow one contract.
- Several of the PRD's open stack questions are already answered by `_Projects/_Templates/Project Build Guide.md`: Next.js on Vercel for the web app, Node.js + TypeScript for the worker, nssm for the Windows service, Porkbun for the domain. The Build Guide also knows which NUC ports are already taken (8080 SABnzbd, 8090 Sports Box).
- Phase 0 was Mac-first at Justin's direction. The PRD's Windows-based Phase 0 deliverable was superseded for initial hardware validation.
- RP820 self-test verified Epson ESC/POS command mode, Ethernet, initial static IP `192.168.1.87/24`, TCP port `9100`, cutter support, and widths of 48 characters in font A or 64 characters in fonts B/C. The home LAN spans `192.168.4.0/22`, so the printer was moved to Eero DHCP.
- DHCP was enabled through the printer's built-in web configuration, and Eero assigned `192.168.4.77/22`. The local `scripts/print-test-receipt.mjs` script uses no dependencies and successfully sent a fixed 762-byte ESC/POS payload ending in the full-cut command `1d 56 00`.
- Justin physically confirmed that the Phase 0 receipt printed from the Mac.
- Justin confirmed that the explicit full-cut command cut automatically and completely separated the receipt.
- Network cleanup completed: Eero has a manual reservation for `192.168.4.77`, the printer returns there with DHCP enabled, and the temporary Mac alias is no longer active.
- Public GitHub repository created at `https://github.com/nikolausj1/desktop-thermal-printer`; initial commit `ddabdc6` contains the verified Phase 0 baseline.
- Justin approved Supabase Postgres and narrowly scoped Windows NUC access for Phase 1. The NUC inventory confirmed Node 24, Git, and nssm, with Plex, Sports Box, and SABnzbd left unchanged.
- Supabase project `vamppbjgfpwasjcvpaho` runs in West US (Oregon) on nano compute. The queue uses row-level security, service-only mutation functions, an atomic `FOR UPDATE SKIP LOCKED` claim, and an explicit `delivery_unknown` terminal state.
- The Edge Function `worker-api` validates a dedicated worker key and holds the database-wide service credential inside Supabase. The NUC receives only the limited worker key and makes outbound HTTPS requests.
- Local TypeScript validation passes with five tests. Supabase security and performance advisors report no issues.
- Cloud receipt #1 completed through the Mac worker. Cloud receipt #2 was claimed by `desktop-printer-nuc`, sent as 365 ESC/POS bytes, and recorded as `sent_to_printer` with no failure code.
- The separate nssm service `DesktopThermalPrinter` is running with automatic startup from `C:\Services\DesktopThermalPrinter`. Its log directory was created before service installation. Plex and Sports Box remained running throughout deployment.
- The database password supplied during project creation did not authenticate against Supabase's pooler. Schema setup succeeded through the authenticated Management API, and migration history was recorded manually. Dashboard password reset remains cleanup for future standard CLI pushes.
- Justin selected `https://www.justinnikolaus.com/printer/` as the public URL. The existing domain is a static Apache site on HostGator infrastructure, apparently through a reseller or account branded Justin Paul Hosting, with source in `nikolausj1/justinnikolaus.com`. The prior project note naming DreamHost was stale. The Phase 2 architecture is a standalone static page at that path backed by protected Supabase Edge Functions. This avoids moving the existing site and does not add a root-site or portfolio navigation link.
- Justin physically confirmed that receipt #2 printed from the Windows NUC and cut successfully, completing Phase 1 acceptance.
- Justin approved the existing static site plus Supabase Edge API architecture for Phase 2.
- The public API is deployed with origin restrictions, server-side printer-health rechecks, atomic idempotency and rate limits, hashed connection data, rule-based moderation, a honeypot, coarse public status, message-status polling, and configurable emergency pause. Anonymous database access remains disabled.
- No-print integration testing verified idempotent retries, duplicate blocking, the 3-per-10-minute limit, moderation, origin rejection, and held-for-review behavior. Synthetic test records were removed and public submissions were disabled afterward. Supabase security and performance advisors report no issues.
- The public page and social card are committed to `nikolausj1/justinnikolaus.com` at commit `b3c5610` and deployed over encrypted FTP to `public_html/printer/`. The live page and all assets return HTTP 200, render without browser warnings, and expose no root-site navigation link.
- DNS resolves `justinnikolaus.com` to `192.185.78.222`; ARIN identifies the network as HostGator, reverse DNS uses `websitewelcome.com`, and authoritative nameservers are `ns1.justinpaulhosting.com` and `ns2.justinpaulhosting.com`.
- Public submissions are enabled and `PUBLIC_API_MODE` is `live`. The first controlled production submission, public ID `msg_104c7a5465794582a5884057caff6da5`, progressed from queued to claimed to `sent_to_printer` in about three seconds. Justin physically confirmed that it printed and cut completely, completing Phase 2 acceptance.
- The approved copy revision removes the top header, three-step journey, and privacy paragraph; changes the name field label to `Your name`; uses `Your note to a real printer.` as the eyebrow; updates the intro description; and centers the revised real-paper note beneath the form with extra spacing. It is committed to the site repository at `9752f0c`, deployed, and verified live while the printer remained online.
- Six disconnected local visual concepts are available in `_review/printer-concepts/`: Carbon Receipt, Signal Red, Swiss Terminal, Midnight Signal, Postal Warmth, and Tiny Machine. They cannot submit messages or reach the printer API.
- Justin chose to retain the current visual direction. The approved two-section extension is live: `The idea` introduces the weekend-project story and a compact four-step ordered list, while `How it was made` explains the cloud queue and home print worker alongside the technical spec card. The steps render as one tight horizontal sequence on wide screens and padded vertical rows at narrower widths, with the decorative arrows removed. The source is committed at `2dedeb1`, production matches the local files, and the printer remained online after deployment.
- Justin approved automatic origin metadata on both physical receipts and administrative message records, with no disclosure and no opt-in. The system stores only coarse fields (`device_label`, city, region, country, and a friendly location label), retaining the existing hashes rather than raw IP addresses or full browser identifiers.
- Worker v0.2.0 and the updated Supabase public and worker APIs are live from commit `69c0718`. Device classification intentionally uses broad labels such as `iPhone`, `Android device`, `Mac`, and `Windows computer`; it does not claim to distinguish a Windows laptop from a desktop.
- Approximate city lookup is best-effort and fails open after a short timeout. If it is unavailable, the receipt prints only the device phrase. The first live test, public ID `msg_92d1c32e7b2a452eacd7298f74d27576`, stored `iPhone` and `Seattle, WA`, reached `sent_to_printer` with no failure, and advanced the printer's successful-print timestamp. Justin physically confirmed that the origin line printed correctly and the receipt cut successfully.
- The NUC deployment restarted only `DesktopThermalPrinter`. Afterward that service, Sports Box, and Plex were all running, while printer heartbeats reported worker v0.2.0, reachable, accepting messages, and no error.
- End-of-day checkpoint on 2026-08-05: the project moved to MVP. The public page, protected queue, Windows worker, physical printer path, and origin metadata are live. Phase 3 has not started and remains subject to Justin's approval.
- The project-story headline tracking was loosened from `-0.065em` to `-0.035em` for readability. Site commit `63557c8` is deployed, and the live stylesheet matches the committed file.
- The Open Graph social card subtitle now reads `CONNECTED TO REAL PRINTER`. Site commit `2d56c7e` is deployed with a versioned `og-v2.jpg` URL to bypass stale social-preview caches, and the live image matches the committed file.
- The intro directions now follow the responsive layout: desktop says `to the right` while the form is beside the copy, and stacked layouts say `below`. Site commit `9996ed6` is deployed and verified live at desktop and mobile widths.
- A custom receipt-paper favicon now mirrors the site's cream paper, dark desk palette, and torn edges. SVG, 32-pixel PNG, ICO, and 180-pixel Apple Touch Icon formats are live from site commit `e3be7ff` and verified against their committed files.
- Justin chose `Paper Telegram` as the new kid-focused concept and selected the clear, warm Option 1 copy direction. The original `justinnikolaus.com/printer` site remains available and was not changed.
- A separate Next.js and TypeScript site now lives in `papertelegram.com/`. It keeps the dark desk and torn-receipt visual language, adds an explicit Chase/Vinny selector, adapts the story and technical sections, proxies safely to the existing public printer API, and includes a dedicated receipt-printer social card.
- Paper Telegram version 1 is privately deployed at `https://paper-telegram.just-aspen-8969.chatgpt.site`. The production build and rendered-page checks pass, production dependencies report no known audit vulnerabilities, and `papertelegram.com` has not yet been connected or launched publicly.
- Eight disconnected Paper Telegram visual concepts are available in `_review/paper-telegram-concepts/`: After Dark, Post Office, Operator Console, Airmail, Sunday Paper, Kitchen Table, Playroom Modern, and Pocket Telegram. Every direction keeps the torn receipt as the form, works at desktop and phone widths, and has no printer or cloud API connection. Production code was not changed.
- A second set of eight disconnected concepts, built by Claude at Justin's request, is available in `_review/paper-telegram-concepts-claude/`: Par Avion, The Wire, Mail Call, Player Two, Ticket Booth, Special Dispatch, Copy Shop, and Little Inventions. Each is a single self-contained HTML file (Google Fonts are the only external resource) sharing one copy deck with a Vinny/Chase/Both recipient selector, verified at 375px and 1440px, preview-only with no printer or API connection. Fresh territory from the Codex set by design, except Airmail, which Justin asked to see reinterpreted (Par Avion). Production code was not changed.
- Round 2 narrowed to the airmail direction. Justin's locked decisions: the white mail form contrasting against a blue scene (from Codex's Airmail), Vinny and Chase as the only recipient options (no Both), and Codex's form with its heading that changes to "For Vinny" or "For Chase" on selection. Six airmail-family variations are in `_review/paper-telegram-airmail-concepts/`: Blue Skies, Night Flight, Jet Age, Departures (split-flap heading animation), Paper Plane, and First Class. All reproduce Codex's form structure and behaviors faithfully, are self-contained single files, and were verified visually and functionally, including the heading swap. Preview-only, no printer or API connection.
- Round 3 (Claude) converges further per Justin's feedback on round 2: every concept now uses a deep blue textured background with the white form as the brightest object (the First Class contrast he liked), the paper plane as the project's brand mark, and no preselected recipient (both chips start unselected, heading stays "Special delivery" until a click, matching Codex's original behavior; round 2 had incorrectly preselected Vinny). Eight variations in `_review/paper-telegram-airmail-r3/`: Par Avion Trim (accurate striped border), First Class Redux (accurate perforations), Torn Receipt, Night Gliders (slow clouds on dark blue, requested), Flight Path, Boarding Pass, Envelope, and Composite (a deliberate synthesis and launch candidate). All verified visually and functionally. Preview-only, no printer or API connection. Codex's separate round-2 airmail studies share `_review/paper-telegram-airmail-concepts/` (its gallery at `index.html`, Claude's at `index-claude.html`); the two sets have no filename collisions.
- Codex added eight more focused airmail derivatives in `_review/paper-telegram-airmail-concepts/index.html`: Blue Horizon, Airmail Envelope, Paper Flight, Dusk Delivery, Junior Airmail, Route Map, First Class, and Folded Sky. Every direction increases contrast between the scene and receipt, retains Chase and Vinny as the only recipient choices, works at desktop and phone widths, and remains disconnected from the printer. Paper Flight and Junior Airmail make the paper plane a prominent project metaphor.
- Codex's focused round-3 gallery is in `_review/paper-telegram-airmail-round3/`: Postal Wing, Folded Signal, Flight Path, Night Airmail, Air Post Badge, and Tiny Flight Club. All six use a textured dark-blue background, keep text left and receipt right on desktop, stack text above the receipt on mobile, and include a distinct code-native paper-plane wordmark. Postal Wing, Night Airmail, and Tiny Flight Club use red, white, and blue airmail borders around the torn receipt. The forms are preview-only and cannot reach the printer.

## Lessons

- Supabase CLI `db query --linked` can apply and verify SQL through the authenticated Management API even when direct pooler password authentication fails. This path does not automatically create migration history, so record the applied version deliberately or repair it after database-password access is restored. (promoted to Build Guide v7.0, 2026-08-05)
- Verify a legacy site's current hosting through DNS, certificate, and network ownership before requesting credentials. Project notes can outlive a hosting migration. (promoted to Build Guide v7.0, 2026-08-05)
