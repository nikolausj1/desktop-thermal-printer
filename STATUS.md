---
title: "STATUS - Desktop Thermal Printer"
created: 2026-08-04
modified: 2026-08-05
version: 3.11
author: OpenAI Codex (GPT-5)
tags:
---

# Desktop Thermal Printer - Status

## Project

A public website that lets anyone send a short message to a Rongta RP820 thermal receipt printer on Justin's desk in Seattle: browser to cloud queue to a Windows print worker on the home NUC to the printer over LAN via raw TCP ESC/POS.

## Stage

MVP

## Health

🟢 On-track - The public end-to-end experience is live and physically verified as an MVP. Automatic broad device and approximate-city metadata is deployed, and the printer is online on worker v0.2.0.

## Waiting on Me

- [ ] **Reset the new Supabase project's database password in the dashboard** (~3 min)
      - unblocks: restoring the standard `supabase db push` path; authenticated Management API migrations and the running worker are not affected

## Next Up

1. Reset the Supabase database password when convenient.
2. When work resumes, scope and approve Phase 3 admin controls, including visual message history.
3. Monitor the live public queue and printer health.

## Biggest Risk

The MVP has no owner-facing admin dashboard yet, so responding to abuse, inspecting failures, or using the emergency pause still requires direct Supabase or service access.

---

## Ideas Shelf

Drawn from the PRD's §21 Deferred Backlog, which is unusually well stocked:

- **(S) Lifetime printed-message counter on the public page** - small, gives visitors a sense of the thing being real and used.
- **(S) Receipt preview before sending** - render what the receipt will look like in the browser; cheap and makes the physical outcome tangible.
- **(M) Twilio SMS as a second input channel** - the PRD was explicitly architected for this, and the Build Guide now carries the hard-won A2P approval lessons from FourSome, so it starts three weeks ahead.
- **(M) Private trusted-sender links** - a URL that bypasses rate limits for friends and family.
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

## Lessons

- Supabase CLI `db query --linked` can apply and verify SQL through the authenticated Management API even when direct pooler password authentication fails. This path does not automatically create migration history, so record the applied version deliberately or repair it after database-password access is restored. (promoted to Build Guide v7.0, 2026-08-05)
- Verify a legacy site's current hosting through DNS, certificate, and network ownership before requesting credentials. Project notes can outlive a hosting migration. (promoted to Build Guide v7.0, 2026-08-05)
