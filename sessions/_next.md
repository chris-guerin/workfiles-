# Next session — provision Railway Postgres and run v5 merge migration

This note is the brief for the next Claude Code session. Read it before populating SESSION.md for the new session.

## What is already done (28 April 2026, two sessions)

- **Phase 1 (15:30–18:00):** /db/ artefacts under v4 framing — `schema/hypothesis_register_v4.sql`, `migrations/001_hypothesis_initial_load.js`, `README.md`. These are now superseded by v5 but stay in the repo for archaeological reference.
- **Phase 2 resumed (15:50–17:30):** v5 unified schema designed and implemented.
  - `db/schema/v5_design.md` — design doc with mapping table and decision log
  - `db/schema/hypothesis_register_v5.sql` — Postgres DDL, 76 cols / three sections / R16-aligned
  - `db/schema/v5_render.html` — canonical HTML schema reference (succeeds `hypothesis_repository_v4_final.html`)
  - ARCHITECTURE.md bumped v5.2 → v5.3 (R14 schema freeze updated to v5.0; R16 rationale expanded for geography and competitive; Section 3.2 gains geography paragraph; Section 8 rewritten for three-section structure; Section 16 Build E updated to v5 target)
  - CLAUDE.md hard-rule line updated to v5
- **Q1–Q9 all resolved** — see `db/schema/v5_design.md` Section 3 and 4.

## Items in scope for the next session

1. **Provision Postgres on Railway.** Create the service in the existing n8n Railway project. Set `DATABASE_URL` (internal for n8n consumption, public for local migration use). Update `db/.env` (gitignored) with both URLs. Update `n8n/.env` reference if relevant.

2. **Run the v5 schema DDL.** Execute `db/schema/hypothesis_register_v5.sql` against the new Postgres. Verify: `\d hypothesis_register` shows 76 cols; `\dv hypothesis_register_r15_violations` shows the soft-enforcement view; the seven indexes exist.

3. **Write the v5 merge migration.** New file `db/migrations/002_hypothesis_unified_v5_load.js`. Reads (a) the 25 March CSV at `C:\Users\Admin\Downloads\FutureBridge_Hypothesis_Repository_v4_FINAL.csv` (49 cols, decision-centric, source for the 33 cols not in live), and (b) the 28 April Apps Script doGet endpoint (45 cols, bucket-centric, source for the 29 cols not in CSV plus 16 shared cols). Reconciles the renames per `db/schema/v5_design.md`:
   - Live `if_true` / `if_false` → `decision_if_true` / `decision_if_false`
   - Live `companies` → `company_tags`
   - Live `mkt_*` (4) → `cost_*` (4)
   - CSV `geography_tags` → `routing_geography`
   - CSV `primary_sources_expected` → `primary_sources`
   - CSV `window` / `window_closes` + live `window_status` / `window_date` → unified `window_status` / `window_closes_at`
   - Live `system_layer ` (trailing space) → `system_layer`
   Same dry-run-by-default discipline as `001_*` (defaults to ROLLBACK; requires both `--commit` and `--confirm-yes` to persist). Same R15 violations surfacing. Idempotent via ON CONFLICT (hyp_id) DO UPDATE.

4. **Validate the merge.** After dry-run, confirm: 118 rows loaded; column count 76 in PG matches schema; R15 violations report is reasonable (expected pre-existing rows that miss falsifiers/if/horizon — acceptable for v5 baseline; flag for analyst follow-up); legacy `geo_*` cols populated where live had data; `comp_*` cols absent (Section C structure as designed); `register` ENUM populated correctly from `hyp_id` prefixes.

5. **Decide: commit v5 to PG, or stay on Sheet.** This is a strategic call best taken with chat. Committing means PG becomes canonical; Sheet becomes derived; sync job needed; Apps Script doGet may need rewiring to read from PG. Staying on Sheet means PG is a backup until later. Default if unsure: dry-run only this session; commit decision deferred to a third session.

## Items NOT in scope for the next session

- Editing Apps Script (`HypothesisRepository.gs`) to read from PG — that's a third session, after PG canonical-status is decided.
- Switching n8n's WF-15 read path — same.
- Sheet-derived view sync job — same.
- Junction-table normalisation of `*_tags`, `company_tags`, `related_hyp_ids` — v6.
- Per-metric `hypothesis_metrics` table — Build L.
- Signal Tracker schema migration — Build E phase two, separate dedicated session.
- Backfilling `comp_*` content — requires methodology work first; not a schema task.

## Entry conditions to check at session start

- "Google Sheets account 2" OAuth grant: still revoked unless rotated by hand. Apps Script doGet remains the working read path for the live register; n8n's Sheets node remains broken until R24 rotation happens. R24 is a separate workstream from this session.
- Railway billing / project limits: confirm a new Postgres service is within plan.
- `db/.env` does not exist yet. Create it and set `APPS_SCRIPT_URL` and `DATABASE_URL` before running anything.
- `pg` package not installed in `db/`. `cd db && npm init -y && npm install pg` before running migration.

## Linked rules to re-read at session start

- **R14** (schema frozen at v5.0; further changes require v6 bump per Section 19.8)
- **R16** (five canonical buckets; geography cross-cutting; legacy `geo_*` and missing `comp_*` documented exceptions)
- **R22** (no n8n push without diff; tomorrow's session does not touch n8n until step 5 is decided)
- **R23** (daily pipeline status check via `morning.js` or `node sync.js status`)
- **R24** (still pending: rotate `Google Sheets account 2` OAuth grant from 28 April incident)
- **R25** (doc same-day update if any material change ships)

## Strategic partner (chat) input expected

Step 5 (commit-or-stay decision) is the strategic call. The merge migration is mechanical. The commit is methodological — it shifts the source of truth. Surface via INBOUND template when ready.

## Reference paths

- Design: `db/schema/v5_design.md`
- DDL: `db/schema/hypothesis_register_v5.sql`
- HTML render: `db/schema/v5_render.html`
- Prior session log: `sessions/2026-04-28-15.md`
- This session log: `sessions/2026-04-28-18.md` (after archive at 18:30 BST)
