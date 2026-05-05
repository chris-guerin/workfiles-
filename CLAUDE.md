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

## Signal Pipeline 15a — current state

Workflow ID `3yqglVMObKORQ595` was reworked into **Signal Pipeline 15a** on 2026-05-05 — 12 nodes, weekly Monday 6am cadence (`0 6 * * 1`). Replaced the daily 6am trigger and Google-Sheet hypothesis repository with direct Postgres queries against `hypothesis-db` (Railway PG) using a new n8n credential `hypothesis-db Railway PG` (id `rgPwSKuC3uXH6fg7`).

15a is the signal-ingestion + hypothesis-matching half of the pipeline. It ends with an enriched output object written to a new Google Sheet tab `Signal_Pipeline_Queue` for 15b to consume. It does NOT score, select, generate content, or write to Signal Tracker — that is 15b's job.

Pipeline (linear, no branching):
1. Monday 6am Trigger → 2. Prepare Today → 3. Read Today's Mini-Signals (Sheet) → 4. **Postgres: Shell Hypotheses** → 5. Build Classification Context → 6. Combine Payload for Claude → 7. Claude — Classify Signals (HTTP) → 8. Parse Classification → 9. **Match Signals to Shell Hypotheses** (code, keyword overlap) → 10. **Postgres: Ontology Enrichment** → 11. **Build 15a Output** (ACT + ontology-gap filter, 15a output schema) → 12. Append to Signal_Pipeline_Queue.

Build script: `n8n/_build-wf-15a.mjs`. Code nodes exploded under `n8n/code-nodes/wf15/`.

15b (scoring, YAMM generation, Signal Tracker writes) is the next workflow to construct — not yet built.

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