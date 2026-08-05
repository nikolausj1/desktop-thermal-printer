---
title: "STATUS - Desktop Thermal Printer"
created: 2026-08-04
modified: 2026-08-04
version: 1.5
author: OpenAI Codex (GPT-5)
tags:
---

# Desktop Thermal Printer - Status

## Project

A public website that lets anyone send a short message to a Rongta RP820 thermal receipt printer on Justin's desk in Seattle: browser to cloud queue to a Windows print worker on the home NUC to the printer over LAN via raw TCP ESC/POS.

## Stage

Active Development

## Health

🟢 On-track - Phase 0's core acceptance test is complete. A formatted raw-TCP ESC/POS receipt physically printed from the Mac and the explicit full-cut command completely separated it.

## Waiting on Me

- [ ] **Remove the Mac's temporary `192.168.1.200` network alias** (~1 min)
      - unblocks: returning the Mac's wired interface to its normal configuration after printer setup
- [ ] **Reserve the printer's `192.168.4.77` lease in Eero** (~2 min)
      - unblocks: keeping the script and future worker configuration stable across lease renewals
- [ ] **Decide whether this project may run a service on the Windows NUC** (~2 min decision)
      - unblocks: the entire worker architecture. The PRD assumes the NUC, and the standing rule is that nothing runs there without your explicit go-ahead

## Next Up

1. Remove the Mac's temporary `192.168.1.200` address and reserve `192.168.4.77` for Ethernet ID `A8-01-57-51-77-8B` in Eero.
2. Optionally exercise cover-open, paper-end, and related status fields to determine whether they are dependable.
3. Stop after Phase 0 and wait for Justin's explicit approval before any Windows NUC or Phase 1 work.

## Biggest Risk

The printer advertises paper-near-end and cutter support, but it remains unknown whether paper-out, cover-open, and cutter state can be read reliably over Ethernet.

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
