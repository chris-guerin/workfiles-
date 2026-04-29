# SESSION.md — working memory for the current session

This file is the live scratchpad for the work currently in progress. It is updated by Claude Code as work happens. It is read by Chris when switching context. Sections of it are pasted into the chat with the other Claude when strategic input is needed, and answers come back here.

When a session ends, this file is archived to `sessions/YYYY-MM-DD-HH.md` and cleared, ready for the next session.

---

## Session header

**Date:** 2026-04-29 (started 08:30 BST)
**Operator:** Chris
**Strategic partner (chat):** Claude (desktop app)
**Executor (terminal):** Claude Code
**Session goal in one sentence:** Build E phase two — provision Railway Postgres in the existing n8n project, deploy v5 DDL, write and dry-run the merge migration combining the 25 March decision-layer CSV with the 28 April bucket-layer Apps Script doGet into the unified v5 target. End state: PG standing, schema deployed, migration script dry-run validated, commit-or-stay decision surfaced to chat. No n8n workflow changes today.
**Time budget:** ~3 hours, hard stop 12:00 BST
**Linked rules from ARCHITECTURE.md Section 19:** Primary R14 (v5.0 schema, 76 cols frozen — DDL must be deployed as-is), R22 (no n8n push without diff — honoured by inactivity; no workflow changes today), R25 (doc same-day update if material change ships — only ARCHITECTURE.md System State table needs a touch if PG provisioning lands). Secondary R23 (morning status check completed at 08:25 BST), R24 (OAuth grant reauthed by Chris overnight; satisfied for now).

---

## Context loaded

- CLAUDE.md — confirmed; v5 hard-rule line points at ARCHITECTURE.md Section 8 (yesterday's edit holds)
- ARCHITECTURE.md v5.3 — load-bearing sections re-checked: 3.2 (geography paragraph), 8.1/8.2/8.3 (three-section structure, four sub-registers, write path), 16 Build E (v5 target with merge migration spec), R14 (v5.0 76 cols frozen), R16 (rationale expanded for cross-cutting geography + competitive gap)
- HANDOFF.md — H1–H5 binding
- `sessions/_next.md` — today's brief; superseded in scope by this morning's chat handoff (no material conflict)
- `sessions/2026-04-28-15.md` — Phase 1 morning archive (OAuth incident, cross-check diagnosis, design escalation)
- `sessions/2026-04-28-18.md` — Phase 1 afternoon archive (v5 design and SQL produced)
- `/db/schema/v5_design.md` — 76-col mapping table is the migration's blueprint
- `/db/schema/hypothesis_register_v5.sql` — 14 KB, 76 cols, three sections, indexes, R15 violations VIEW, ENUM CHECKs
- `/db/migrations/001_hypothesis_initial_load.js` — archaeological reference; superseded by 002

**Pre-flight survey (08:35–08:40 BST):**
- Live Apps Script doGet: 118 rows, 45 cols (matches yesterday)
- 25 March CSV: 118 rows, 49 cols (matches yesterday)
- Hyp_id intersection: 118 (full overlap; no retired-only or new-only rows)
- Hyp_id format CHECK on `^[A-Z0-9_-]{3,32}$`: 0 violations either side
- Register-prefix derivation rule confirmed: BET_C* → PERSONAL (12), BET_I* → INDUSTRY (14), BET_E/M/SC/X* → SECTOR (44), everything else → CLIENT_ACCOUNT (48)

**Overnight state (per chat handoff):**
- `Google Sheets account 2` OAuth grant reauthed by Chris yesterday evening; R24 satisfied for now
- WF-15A succeeded once afterwards (visible in 08:25 status check)
- WF-15 still failing — downstream issue post-auth, not a fresh OAuth break; out of scope today
- Other workflows mixed FAIL/STALE; most become moot once n8n reads from PG; out of scope today

---

## Plan

Six steps. Provisioning blocks on Chris's manual action in Railway UI; everything else is local.

1. **Surface pre-flight findings + plan to chat** (already happening in this message). Pause for sign-off on Q1/Q2/Q3 answers and on the staged provisioning approach. (~5 min)

2. **Write `/db/migrations/002_hypothesis_unified_v5_load.js`** (~50 min) — merge migration. Inputs: 25 March CSV (decision-layer-only cols) + 28 April Apps Script doGet (live cols). Reconciles renames per `/db/schema/v5_design.md` Section 2 mapping. Derives register from hyp_id prefix using the confirmed heuristic. Sets `schema_version='v5'`, `created_at=now()`, `created_by='migration_002'`, `last_updated_by=NULL`. Promotes `last_updated` from TEXT to TIMESTAMPTZ where parseable, NULL otherwise. ROLLBACK by default; requires both `--commit` and `--confirm-yes` to persist. Reports row counts, source breakdown, R15 violations, hyp_id format check.

3. **Chris provisions Railway Postgres** (~10–30 min Chris's clock; blocking on me but only for the deploy/dry-run steps). I provide the checklist; Chris executes in the Railway UI. Result: a Postgres service in the same Railway project as n8n, with internal `DATABASE_URL` reference for n8n consumption and public URL for local migration.

4. **Set up `/db/.env` and install `pg`** (~5 min). Chris pastes the public DATABASE_URL into `db/.env`. I run `cd db && npm init -y && npm install pg`.

5. **Deploy v5 DDL and run dry-run** (~15 min):
   - `psql "$DATABASE_URL" < db/schema/hypothesis_register_v5.sql`
   - Verify `\d hypothesis_register` shows 76 cols
   - Verify `\dv hypothesis_register_r15_violations` shows the view
   - `node db/migrations/002_hypothesis_unified_v5_load.js` (dry-run, ROLLBACK)
   - Capture row count, source breakdown, R15 violations report, last_updated parse-fail count

6. **Surface dry-run results to chat as INBOUND** (~10 min). Chat decides: commit or stay. If commit, run with `--commit --confirm-yes` and update ARCHITECTURE.md System State per R25.

**Phase 3 close** (~15 min): update SESSION.md, write `sessions/_next.md` for the cutover session, archive SESSION.md to `sessions/2026-04-29-08.md`, EOS summary.

Total estimate: ~2h 30m of my work + Chris's provisioning time. Fits within the 3h budget.

---

## Working log

```
[08:25] STEP -1 — R23 morning status check (cd n8n; node sync.js status --since 30h)
[08:25] RESULT — 8 FAIL, 6 STALE; WF-15A had one success (R24 reauth confirmed); WF-15 still failing (downstream issue, out of scope)
[08:30] STEP 0 — H1 context load + handoff received
[08:35] STEP 1 — pre-flight: hyp_id intersection, format CHECK, register-prefix derivation rule, column inventory
[08:40] RESULT — 118-row identical intersection; 0 format violations; register-prefix rule confirmed (12/14/44/48 mapping)
[08:42] STEP 2 — populating SESSION.md and surfacing plan
[08:50] DECISION — Chris confirmed plan + Q4 default (live wins for shared cols). Proceeding with 002 script while Chris provisions Railway PG.
[09:00] STEP 3 — drafting db/migrations/002_hypothesis_unified_v5_load.js
[09:30] RESULT — 002 written; ~280 lines; loads CSV + live; merges per design doc rules; upserts to PG; ROLLBACK by default; reports row-set check, register distribution, R15 violations, last_updated parse fails, window_closes_at parse fails
[09:30] STEP 4 — awaiting Chris's Railway PG provisioning + DATABASE_URL
[09:35] DECISION — handoff addendum: full debugging autonomy on tactical issues (connection strings, package installs, SQL syntax, env wiring, Railway UI nav, dry-run parsing, format issues fitting existing CHECK, CSV edge cases, JSON envelope variations). Loop until resolved or hit ESCALATE trigger. Surface to chat only: escalation triggers, end-of-phase summary, commit-or-stay decision. Applied retroactively.
[09:40] DECISION — dry-run review thresholds (set by chat pre-emptively):
  - window_closes_at parse fails: <10% silent / 10–30% surface count+sample / >30% escalate (may need TEXT column)
  - register distribution expected ~12/14/44/48 (PERSONAL/INDUSTRY/SECTOR/CLIENT_ACCOUNT); >30% deviation surfaces heuristic for review
  - Pre-flight register distribution from 08:40 BST already matched exactly (12/14/44/48). Confirmed.
[09:45] STEP 5a — proactive parseability pre-check on all v5 DATE/TIMESTAMPTZ cols (window_closes_at, probability_last_changed, resolved_date, last_updated)
[09:50] RESULT — window_closes_at 100% fail (quarter strings in both sources, plus "active" and "[object Object]" anomalies in CSV). resolved_date 100% fail in CSV (content like "AI compute efficiency improvements..." — looks misaligned). probability_last_changed and last_updated empty in CSV.
[09:50] STEP 5b — investigated CSV structure. Header 49 fields; data rows 51 (×6), 52 (×88), 53 (×24). All rows over-length — every row has 2–4 unquoted-comma extras. BET_E001 inspection confirms progressive column-shift: total_steps="[object Object]", owner="Electricity demand growth...", resolved_date="EIA demand forecasts|...". CSV is structurally broken; cannot reliably source the 25 decision-layer-only cols.
[09:55] ESCALATE — INBOUND to chat: A live-only / B stop / C re-export / D v4 HTML substitute. Recommendation A + window_closes_at DATE→TEXT change. HOLD on running anything against PG until resolved.
```

---

## Open questions for strategic partner (chat)

**Q1, Q2, Q3 from chat handoff — answered or moot:**
- **Q1 (hyp_id collision pattern)** — moot. Both sources have identical 118 IDs. No retired-only, no new-only.
- **Q2 (CSV-only data freshness)** — will flag in dry-run output. The 25 decision-layer-only columns are CSV-sourced and one month old; for the 16 shared-name columns and 5 renamed columns where both sources have values, **live wins** (28 April beats 25 March on freshness for fields that exist in both). Per `_next.md` step 4 default — confirm.
- **Q3 (hyp_id format pre-flight)** — done, 0 violations.

**Q4 (new) — Sheet-CSV freshness conflict policy.** The CSV has 16 shared-name cols (probability, confidence_score, urgency_score, current_step, step_conditions, signal_types, related_hyp_ids, falsifiers, owner, last_updated, notes, sector, system_layer, hypothesis_theme, hyp_id) where both sources hold values for the same hyp_id. Default policy: live wins for shared cols. CSV is consulted only for the 25 decision-layer cols not in live. Confirm or redirect.

---

## Decisions made

- **Pre-flight outcomes accepted as-is.** No collisions, no format violations, register-prefix rule confirmed (BET_C/BET_I/BET_E/BET_M/BET_SC/BET_X then everything-else → CLIENT_ACCOUNT).
- **Live wins for shared cols** (Q4 default). CSV contributes only the 25 decision-layer cols not in live. Pending explicit confirm.
- **Provisioning approach:** Chris does Railway UI provisioning; I provide the checklist and consume DATABASE_URL when ready.
- **No n8n push, no Apps Script edit, no Sheet edit.** R22 honoured by inactivity.
- **001 stays as archaeological reference.** Not deleted.

---

## Files changed

| Path | Action | Reason |
|---|---|---|
| `db/migrations/002_hypothesis_unified_v5_load.js` | created | merge migration; CSV + Apps Script doGet → v5 target; ROLLBACK by default; reports R15 + parse fails |
| `SESSION.md` | continuously updated | working log, decisions, files changed |

ARCHITECTURE.md NOT touched yet (R25 update only triggers if commit lands today).
CLAUDE.md NOT touched.
n8n NOT touched.
v4 artefacts intact (archaeological).

---

## Pending push to n8n

(None. R22 honoured by inactivity. No workflow changes are part of Build E phase two.)

---

## Session end

(To be filled at end of session.)
