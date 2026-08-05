---
title: "STATUS - Desktop Thermal Printer"
created: 2026-08-04
modified: 2026-08-04
version: 1.7
author: OpenAI Codex (GPT-5)
tags:
---

# Desktop Thermal Printer - Status

## Project

A public website that lets anyone send a short message to a Rongta RP820 thermal receipt printer on Justin's desk in Seattle: browser to cloud queue to a Windows print worker on the home NUC to the printer over LAN via raw TCP ESC/POS.

## Stage

Active Development

## Health

🟢 On-track - Phase 1 is deployed. Supabase has the secured queue and worker endpoint, and the automatic Windows NUC service completed a cloud job through the RP820 with no recorded failure.

## Waiting on Me

- [ ] **Confirm receipt #2 physically printed and cut** (~15 sec)
      - unblocks: closing the last physical acceptance check for Phase 1
- [ ] **Reset the new Supabase project's database password in the dashboard** (~3 min)
      - unblocks: restoring the standard `supabase db push` path; authenticated Management API migrations and the running worker are not affected

## Next Up

1. Get Justin's physical confirmation that receipt #2 printed and cut.
2. Reset and securely store the Supabase database password so future migrations can use the standard CLI path.
3. Begin Phase 2: build the public Next.js submission website, server-side status API, validation, moderation, and rate limits.

## Biggest Risk

The worker cannot prove exactly-once physical printing after an ambiguous mid-transmission failure, so job state and retry behavior must preserve an explicit delivery-unknown outcome.

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

## Lessons

- Supabase CLI `db query --linked` can apply and verify SQL through the authenticated Management API even when direct pooler password authentication fails. This path does not automatically create migration history, so record the applied version deliberately or repair it after database-password access is restored.
