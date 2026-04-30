# CLAUDE.md — workfiles- repo

This file is read on every Claude Code session start. It captures the architecture, current state, and active rules so we don't waste a session re-establishing context.

---

## Canonical reference

**The v1 documentation set in `/docs/` is the canonical reference for the initiative model architecture (30 April 2026 onwards).** Read in this order:

1. `docs/INITIATIVE_MODEL.md` — data model and behaviour rule
2. `docs/INITIATIVE_METHODOLOGY.md` — population procedure (10 steps)
3. `docs/SIGNAL_PIPELINE.md` — news-to-signal procedure (6 steps)
4. `docs/N8N_IMPLEMENTATION.md` — workflow architecture
5. `docs/WORKED_EXAMPLE_SHELL_H3.md` — full procedure walkthrough on Shell H3 hydrogen NW Europe

`ARCHITECTURE.md` at the repo root remains current for repo-level architectural state and Operating Rules (Section 19, R1 through R25). Where the v1 docs and ARCHITECTURE.md disagree, the v1 docs win on architecture; ARCHITECTURE.md wins on operational rules.

`docs/legacy/` contains superseded documentation (METHODOLOGY.md, HYPOTHESIS_MATRIX_v1.md, HEAT_MAPS_AND_GESTATION.md) retained for historical reference only. Do not implement against legacy docs.

---

## Who I am, what I'm doing

Chris Guerin, Client Partner at FutureBridge Advisory. This repo is the home of the Signal Engine, evolving from a daily Claude-driven signal classification pipeline into the initiative model architecture — a dependency-graph system where each company's strategic bets are populated as initiatives composed of entities and links carrying role/impact/criticality/claim per (initiative, entity) pair.

Sectors in scope: Energy, Mobility, Chemicals, Life Sciences, Food & Nutrition, Manufacturing.

Active client work: Shell H3 engagement (£330k), TechnipFMC, plus the wider IOC and utility account portfolio (BP, ExxonMobil, Chevron, Equinor, Eni, EDP, SSE Renewables, Centrica, others).

---

## Current architectural state (30 April 2026 evening)

Major architectural pivot today from the matrix model (observable_layer) to the initiative model (initiatives + entities + links + signals + competitive_events).

**Schema state:**
- PG `hypothesis-db` is at v5.6 (migration 003 committed yesterday). Includes legacy observable_layer tables — `hypothesis_observable`, `hypothesis_observable_event`, `confidence_band_history` — populated empty.
- Migration 004 pending: adds `mv1_*` tables (mv1_initiatives, mv1_entities, mv1_links, mv1_signals, mv1_competitive_events) per `docs/N8N_IMPLEMENTATION.md` Section 2.1. Will bump schema to v6.0.
- Legacy observable_layer tables are deprecated but not dropped; cutover planned for migration 005 once mv1_* is operational.

**Visualisation prototype:**
- `SHELL_H3_PORTFOLIO_v3.html` at the repo root — 12 Shell H3 initiatives populated with 36 entities and 39 links, with executing signal propagation across initiatives. Built by intuition rather than methodology; due for review against `docs/INITIATIVE_METHODOLOGY.md`.

**Documentation state:**
- v1 doc set in `docs/` is complete (5 documents, 2,746 lines total).
- Doc set ready for the rainy-Tuesday test: drop into a fresh AI with no other context and verify it can rebuild the system from the docs alone.
- See `sessions/_next.md` for the next session's full brief.

---

## Architecture at a glance

| Layer | Tool | Where |
|---|---|---|
| Orchestration | n8n (self-hosted) | `n8n-production-86279.up.railway.app` |
| Initiative model store | PostgreSQL on Railway | `hypothesis-db` instance |
| Signal classification | Claude API call inside n8n HTTP node | model: `claude-sonnet-4-6` (and Haiku for triage) |
| Analyst surface | Google Sheet | ID `1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM` |
| Apps Script bridge | within "signal engine p2" project | doGet/doPost endpoints for read/write |
| Contacts DB | Datasette on Render free tier | `futurbridge-signals.onrender.com` (27,473 contacts) |
| Tools front-end | GitHub Pages | `chris-guerin.github.io/workfiles-/` |
| Local n8n bridge | `n8n/sync.js` | pull / diff / push for code nodes |

Deploy on the front-end side is `git add . && git commit -m "update" && git push`. Token is set in the remote URL.

Claude Code 2.1.119 installed at `C:\Users\Admin\.local\bin\claude.exe`. Local repo at `C:\Users\Admin\workfiles-`.

---

## WF-15 Signal Engine pipeline — current state

WF-15 architecture exists at workflow ID `3yqglVMObKORQ595` running 22 nodes against the legacy schema. Per `docs/N8N_IMPLEMENTATION.md` Section 6, WF-15 will be reworked to target the mv1_* schema as part of Phase 3 of the migration sequence (post migration 004, post Shell methodology population).

Until then, WF-15 continues to run against the legacy observable_layer tables. Do not modify WF-15 to target mv1_* until methodology v1 is validated and migration 004 is committed.

---

## Open items (next session in scope)

See `sessions/_next.md` for the full brief. Top-level:

1. **Rainy-Tuesday test** on the v1 doc set — drop docs into a fresh AI, ask it to populate one Shell H3 initiative from public sources, compare against `docs/WORKED_EXAMPLE_SHELL_H3.md`.
2. **Migration 004** — schema lift to mv1_* tables per `docs/N8N_IMPLEMENTATION.md`.
3. **Shell portfolio review** of v3 against the methodology — find where intuitive build differs from procedural build.
4. **Second-company population** (BP or Equinor) once Shell is reviewed.

Deferred but real:
- Credential rotation batch (Anthropic API key, n8n API key, Postgres password, Google Sheets OAuth)
- Shell £220k Business Case Assessment SOW PO chase (commercial item)
- WF-15A signal pipeline rework (multi-session, post migration 004)
- WF-INIT-1 population assistant build (post methodology validation)

---

## Repo structure