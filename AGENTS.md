---
title: "Desktop Thermal Printer - Agent Instructions"
created: 2026-08-04
modified: 2026-08-04
version: 1.0
author: Claude Sonnet 5 (claude-sonnet-5)
tags:
---

# Desktop Thermal Printer

A public website that lets anyone send a short message to a Rongta RP820 thermal receipt printer on Justin's desk in Seattle. Message travels: browser to cloud queue to a Windows print worker on the home server to the printer over LAN via raw TCP ESC/POS.

**This project is being built primarily by Codex.** This file is the agent contract; `CLAUDE.md` in this folder points here so Claude sessions follow the same rules.

## Read these first

1. **`PRD - Desktop Thermal Printer.md`** (this folder) - the full specification. It is complete and detailed: architecture, data model, API, lifecycle, acceptance criteria, and a four-phase build plan. Start from Phase 0.
2. **`_Projects/_Templates/Project Build Guide.md`** - Justin's environment: accounts, API keys, deployment patterns, and hard-won gotchas. The master copy is authoritative; do not copy it into this folder.
3. **`_Projects/CLAUDE.md`** - portfolio-wide standards (Markdown front matter, versioning, no em dashes) and the Oracle reporting system.

## STOP: the Windows server requires explicit permission

This project runs a print worker on Justin's always-on Windows NUC - the same machine that hosts Plex for his family and the Sports Box backend.

**Ask Justin before doing ANYTHING on that machine.** Installing, deploying, opening a port, restarting a service, even reading over SSH. Plex downtime is a family incident. This is a standing rule, not a formality.

Facts you will need once permitted (full detail in the Build Guide's "Platform: Windows NUC" section):

- Address `192.168.4.61`, pinned by DHCP reservation.
- SSH: `ssh -i ~/.ssh/sportsbox_nuc_ed25519 micro@192.168.4.61` (key-based, elevated).
- **Ports already taken: 8080 (SABnzbd), 8090 (Sports Box).** Pick something else.
- Services run under [nssm](https://nssm.cc); Node 24 LTS, Git, and nssm installed via winget.
- Known trap: nssm silently refuses to start if its log directory does not exist, and the real error appears only in the Windows Application event log under provider `nssm`.
- Known trap: the NUC cannot reach its own LAN IP, and `localhost` resolves to IPv6 while servers bind IPv4. Always test reachability from another device.

## Stack decisions already made for you

The PRD leaves several stack questions open (§22). The Build Guide answers most of them - use these unless you have a specific reason not to, and say so if you deviate:

- **Web app:** Next.js + TypeScript on Vercel, connected to a GitHub repo under `nikolausj1`.
- **Worker:** Node.js + TypeScript, matching the web app. Runs as an nssm service on the NUC.
- **Database:** Justin's default is no backend, but this project genuinely needs one. Supabase Postgres is the house preference and is already used elsewhere. Propose before committing.
- **Domain:** Porkbun, via API. Propose 3-5 available names and let Justin pick.
- **Secrets:** `~/.secrets/api-keys.env` on the Mac; never in the repo, never echoed into chat. `.env.example` documents variable names only.
- **Build output:** never inside this folder. Build to `/tmp`. See the Dropbox rule in the Build Guide - this cost the portfolio a full day on 2026-08-04.

## Working conventions

- `_inbox/` is Justin's channel to you: reference material, photos of the printer, hardware notes. Check it at session start.
- `_review/` is your channel to Justin: mockups, receipt-format samples, screenshots, options to choose from. Nothing in there is shipping code.
- Both are gitignored and sync via Dropbox on purpose.
- All docs are Markdown with YAML front matter (`title`, `created`, `modified`, `version`, `author`, `tags`). No em dashes anywhere.

## Oracle Reporting Contract

This project is tracked by Oracle, a portfolio agent at the `_Projects` root that rolls up every project's status into `_Projects/_Oracle/PORTFOLIO.md`. Your obligations:

1. Keep `STATUS.md` at this project's root current. At the end of any session with meaningful progress, decisions, or new blockers, refresh it before finishing.
2. Follow the Oracle Status Format defined in `_Projects/CLAUDE.md` exactly: six sections in order (Project, Stage, Health, Waiting on Me, Next Up, Biggest Risk), optional sections below a `---` divider. Update `modified` and bump `version` on every edit.
3. Keep the Ideas Shelf stocked: 2 to 5 self-contained backlog items sized S / M / L that Justin could pick up for fun. The PRD's §21 Deferred Backlog is a good source.
4. Never delete `STATUS.md`. If parking the project, set Stage to Paused and note why.
5. Oracle trusts `STATUS.md` completely. It does not inspect code or git. An inaccurate status gives Justin a wrong portfolio picture.
6. Edits marked "updated via Oracle at Justin's direction" are authoritative - Justin dictated them at the portfolio level. Reconcile, do not revert.
7. Share what you learn. When you discover a reusable technique, fix, or gotcha that other projects would benefit from (environment-level, not specific to this product), record it briefly in an optional `## Lessons` section at the bottom of `STATUS.md`, below the divider. Oracle vets these and promotes the good ones into the shared Build Guide.
