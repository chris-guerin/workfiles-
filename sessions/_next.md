# Next session — v1 doc set test, migration 004, second-company population

This note is the brief for the next Claude Code session. Read it before populating SESSION.md for the new session.

## What is already done (30 April 2026 afternoon — major architectural pivot)

Today's session pivoted from the matrix model (observable_layer / HYPOTHESIS_MATRIX_v1.md) to the **initiative model** — a dependency-graph architecture where each hypothesis is an initiative composed of entities (technologies, market conditions, regulations, ecosystem actors) connected by links carrying role/impact/criticality/claim per (initiative, entity) pair.

Persisted state from this afternoon:

- Five-document v1 specification set in `docs/`:
  - `docs/INITIATIVE_MODEL.md` — data model and behaviour rule
  - `docs/INITIATIVE_METHODOLOGY.md` — population procedure (10 steps)
  - `docs/SIGNAL_PIPELINE.md` — news-to-signal procedure (6 steps)
  - `docs/N8N_IMPLEMENTATION.md` — workflow architecture for the running system
  - `docs/WORKED_EXAMPLE_SHELL_H3.md` — full procedure walkthrough on Shell H3 hydrogen NW Europe
- Legacy docs moved to `docs/legacy/` with superseded headers:
  - `docs/legacy/METHODOLOGY.md`
  - `docs/legacy/HYPOTHESIS_MATRIX_v1.md`
  - `docs/legacy/HEAT_MAPS_AND_GESTATION.md`
- Working visualisation prototype: `SHELL_H3_PORTFOLIO_v3.html` (12 initiatives, 36 entities, 39 links, executing model with signal propagation across initiatives)
- CLAUDE.md updated to point Claude Code at the v1 doc set
- ARCHITECTURE.md updated (or pending update) to reflect the architectural pivot

The morning's migration 003 (observable layer in PG) remains committed but is now part of the legacy schema. Migration 004 (the initiative-model schema) is the next schema change.

## Items in scope for the next session

### Lead — rainy Tuesday test on the v1 doc set

Drop `docs/INITIATIVE_MODEL.md` and `docs/INITIATIVE_METHODOLOGY.md` into a fresh AI (Claude or other native model with no other context) and ask it to populate one Shell H3 initiative from public sources following the procedure. Compare the output to `docs/WORKED_EXAMPLE_SHELL_H3.md` and to the relevant section of `SHELL_H3_PORTFOLIO_v3.html`.

What to look for:
- Same initiative scope and bounding decisions
- Same principal entity identification
- Comparable enabling entity set (some variance is acceptable; structural divergence is not)
- Same external threat identification
- Same role/criticality assignments on equivalent links
- Comparable claim wording and quality

What to capture:
- Where the AI drifts from the worked example, and whether it's variance or contradiction
- Where the docs left judgment ambiguous enough to produce divergent output
- Any methodology gaps that surfaced during the test

Outputs: a feedback note for v1.1 doc revisions; an updated `_next.md` for the session after.

### Plausibly alongside if time permits — migration 004

Per `docs/N8N_IMPLEMENTATION.md` Section 2.1 and Section 6 Phase 1: PG schema migration to add `mv1_*` tables (mv1_initiatives, mv1_entities, mv1_links, mv1_signals, mv1_competitive_events) plus the `mv1_initiative_full` view. Same migration pattern as 003 (Claude Code session, dry-run, commit, runner script).

Migration 004 design notes:
- New tables prefixed `mv1_` so they coexist with the legacy `hypothesis_observable*` tables during transition
- Foreign keys: links → initiatives, links → entities, signals → entities, signals → applied_initiatives
- Named CHECK constraints on enums (role / impact / criticality / state values)
- View definition per the existing pattern

### Plausibly alongside — Shell portfolio review against methodology

`SHELL_H3_PORTFOLIO_v3.html` was populated by intuition, not by following the methodology. With the methodology now committed, run a review pass on the 12 initiatives and check where the methodology produces tighter or different output. Specifically: claim quality, criticality assignments, entity reuse decisions. Updates feed into the v3 file (or a v4 if the changes are substantive enough to warrant a re-render).

### Own session — second-company population

Once Shell is reviewed and the v1 doc set has passed the rainy-Tuesday test, populate a second company per the methodology. Recommended: BP or Equinor as the natural entity-overlap neighbours.

Goals:
- Validate that the entity catalogue is reusable (target: 30-50% of entities for second IOC come from Shell catalogue)
- Identify any methodology gaps that surface only on a second company
- Produce a comparable initiative count (8-15) for portfolio-level cross-company analysis

This is a session of its own — likely a full day for first-time second-company population.

## Items deferred

- **Credential rotation batch.** Anthropic API key in n8n/workflows/wf15.json (briefly visible in screenshot 27 April), n8n API key (also from 27 April), Postgres password (quarterly rotation), Google Sheets OAuth (re-authorisation). Should be done as one session for cleanness.
- **Shell £220k Business Case Assessment SOW PO chase.** Real commercial item that's been sitting underneath the system work. Outside the scope of system development sessions but the highest-priority real-world item.
- **CSV corruption root-cause investigation.** Parked indefinitely; the CSV path is now legacy.
- **WF-15A signal pipeline rework.** Per `docs/N8N_IMPLEMENTATION.md` Section 6 Phase 3, this happens after migration 004 and after Shell is fully populated against the methodology. Multi-session piece of work.
- **WF-INIT-1 population assistant build.** Per `docs/N8N_IMPLEMENTATION.md` Section 3 — the n8n workflow that scaffolds methodology population. Built once methodology v1 is stable and after migration 004.
- **Drift management workflow (WF-INIT-4).** Built once 90 days of signal flow exist.

## Items NOT in scope for the next session

- Touching the legacy `hypothesis_observable*` tables (they sit unused; deprecation comes with migration 005 once cutover to mv1_* is complete)
- n8n workflow changes (R22; signal pipeline rework is a future session)
- Apps Script changes beyond what migration 004 needs for read endpoints
- Building the population assistant or other WF-INIT workflows (post-methodology-validation)

## Entry conditions to check at session start

- `docs/` folder exists with five v1 docs
- `docs/legacy/` folder exists with three superseded docs carrying superseded headers
- CLAUDE.md points to the v1 doc set
- Git working tree clean (today's commits all pushed)
- ARCHITECTURE.md reflects the doc-set milestone (pending decision: bump to v5.7 now or wait for migration 004 to land as v6.0)

## Linked rules to re-read at session start

- **R14** (schema freeze — currently v5.6 deployed; migration 004 will bump to v6.0 if it lands)
- **R15** (four-tests; methodology applies these via the build-order procedure)
- **R22** (no n8n push without diff)
- **R23** (morning status check)
- **R25** (doc same-day update)

## Strategic partner (chat) input expected

- Whether the rainy-Tuesday test reveals any methodology gaps requiring v1.1 revision before migration 004 lands
- Whether Shell portfolio review should be done before second-company population or in parallel
- Migration 004 scope decisions: which tables, which constraints, naming conventions for FKs

## Reference paths

- `docs/INITIATIVE_MODEL.md` (data model and behaviour rule)
- `docs/INITIATIVE_METHODOLOGY.md` (population procedure)
- `docs/SIGNAL_PIPELINE.md` (news-to-signal procedure)
- `docs/N8N_IMPLEMENTATION.md` (workflow architecture)
- `docs/WORKED_EXAMPLE_SHELL_H3.md` (full procedure walkthrough)
- `docs/legacy/METHODOLOGY.md`, `docs/legacy/HYPOTHESIS_MATRIX_v1.md`, `docs/legacy/HEAT_MAPS_AND_GESTATION.md` (superseded; retained for history)
- `ARCHITECTURE.md` (current schema and architectural state)
- `SHELL_H3_PORTFOLIO_v3.html` (visualisation prototype, 12 initiatives populated)
- `db/migrations/003_observable_layer.sql` (legacy schema, deprecated by docs but still in PG)
- 30 April afternoon session archive: `sessions/2026-04-30-pm.md` (to be created at session end)
- "Go" scoping memory: `~/.claude/projects/.../memory/go-scoping-discipline.md`