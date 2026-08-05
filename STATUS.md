---
title: "STATUS - Desktop Thermal Printer"
created: 2026-08-04
modified: 2026-08-04
version: 1.6
author: OpenAI Codex (GPT-5)
tags:
---

# Desktop Thermal Printer - Status

## Project

A public website that lets anyone send a short message to a Rongta RP820 thermal receipt printer on Justin's desk in Seattle: browser to cloud queue to a Windows print worker on the home NUC to the printer over LAN via raw TCP ESC/POS.

## Stage

Active Development

## Health

🟢 On-track - Phase 0 is complete, network cleanup is verified, and the public GitHub baseline is published. Phase 1 is waiting on backend and Windows NUC authorization decisions.

## Waiting on Me

- [ ] **Approve Supabase Postgres as the Phase 1 queue and status backend** (~2 min decision)
      - unblocks: creating the schema, atomic job-claim functions, heartbeat storage, and worker credentials
- [ ] **Explicitly approve access to the Windows NUC for this project** (~2 min decision)
      - unblocks: inspecting the existing runtime safely and later deploying the print worker as a separate nssm service without changing Plex or other services

## Next Up

1. Confirm Supabase and Windows NUC authorization boundaries.
2. Scaffold the Phase 1 TypeScript workspace and implement the queue schema, heartbeat, authentication, and atomic job claim.
3. Run a manually created cloud job through the worker to the physical printer, first from the Mac and then from the NUC if approved.

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
- Phase 0 is Mac-first at Justin's direction. The PRD's Windows-based Phase 0 deliverable is superseded for initial hardware validation. No Windows NUC access is approved.
- RP820 self-test verified Epson ESC/POS command mode, Ethernet, initial static IP `192.168.1.87/24`, TCP port `9100`, cutter support, and widths of 48 characters in font A or 64 characters in fonts B/C. The home LAN spans `192.168.4.0/22`, so the printer was moved to Eero DHCP.
- DHCP was enabled through the printer's built-in web configuration, and Eero assigned `192.168.4.77/22`. The local `scripts/print-test-receipt.mjs` script uses no dependencies and successfully sent a fixed 762-byte ESC/POS payload ending in the full-cut command `1d 56 00`.
- Justin physically confirmed that the Phase 0 receipt printed from the Mac.
- Justin confirmed that the explicit full-cut command cut automatically and completely separated the receipt.
- Network cleanup completed: Eero has a manual reservation for `192.168.4.77`, the printer returns there with DHCP enabled, and the temporary Mac alias is no longer active.
- Public GitHub repository created at `https://github.com/nikolausj1/desktop-thermal-printer`; initial commit `ddabdc6` contains the verified Phase 0 baseline.
