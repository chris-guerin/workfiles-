# N8N implementation — workflow architecture

**Version:** 1.0
**Status:** Implementation specification. Defines how the initiative model, methodology, and signal pipeline run as n8n workflows.
**Audience:** n8n developers, system operators, anyone implementing or maintaining the running system. Including AI systems with no other context but with general n8n knowledge.
**Reading order:** Depends on INITIATIVE_MODEL.md, INITIATIVE_METHODOLOGY.md, and SIGNAL_PIPELINE.md. Read those first; this document specifies how their procedures execute as n8n workflows.

---

## 1. Purpose of this document

The model spec, methodology, and signal pipeline define what the system is and what it does conceptually. This document specifies how those concepts run as concrete n8n workflows — which operations happen in which nodes, what data flows between them, what storage backs them, and what the operator-facing behaviours are.

The system runs on the existing FutureBridge n8n instance (Railway deployment, https://n8n-production-86279.up.railway.app). It uses the patterns established in WF-15 (the Signal Engine classification pipeline) as the architectural baseline, extending and reorganising them for the initiative model.

This document does not cover:
- The data model and behaviour rule. See INITIATIVE_MODEL.md.
- The procedure for populating initiatives. See INITIATIVE_METHODOLOGY.md.
- The signal pipeline procedure. See SIGNAL_PIPELINE.md.
- A complete worked example. See WORKED_EXAMPLE_SHELL_H3.md.

## 2. Data storage architecture

The system uses three storage layers, each fitting different needs.

### 2.1 PostgreSQL (Railway hypothesis-db)

**Purpose:** authoritative storage for the initiative model — initiatives, entities, links, signals, competitive_events tables.

**Connection:** existing `hypothesis-db` PostgreSQL 18.3 instance on Railway. Schema currently holds the v5.6 model from prior work (with observable_layer migration); new tables for initiative_model v1 are added via migration 004.

**Why PG:** transactional integrity for model state (atomic signal application), structured queries for cross-initiative analysis, mature foreign key support for the link table, JSON columns for flexible metadata.

**Migration 004 scope:** new tables `mv1_initiatives`, `mv1_entities`, `mv1_links`, `mv1_signals`, `mv1_competitive_events`. Naming prefix `mv1_` (model v1) to coexist with prior schema during transition. View `mv1_initiative_full` returns each initiative with its links and entity states joined.

The v5.6 observable_layer tables remain populated for the legacy matrix model during transition; they are deprecated but not dropped until migration 005 cuts over fully to the initiative model.

### 2.2 Google Sheets (master sheet)

**Purpose:** human-facing read/write surface for analysts during population and review.

**Sheet structure:** master sheet ID `1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM` gets new tabs:

- `mv1_initiatives` — one row per initiative, populated and edited by analysts.
- `mv1_entities` — one row per entity in the catalogue.
- `mv1_links` — one row per link.
- `mv1_signals_pending` — signals awaiting analyst review before application.
- `mv1_signals_applied` — signals applied to the model, append-only audit log.
- `mv1_competitive_events` — competitive event log.
- `mv1_review_queue` — items needing analyst attention (state transitions to confirm, low-confidence assessments, etc.).

Sheets read from PG and write back to PG via Apps Script doGet/doPost endpoints. The existing Apps Script deployment (`AKfycbxmpsUIgouSfPp38yVSC-y2aZ3utsOU3je3xGICc0fe6vKGaVinc7_sWVF88cbkgsSY-w`) is extended with new endpoints; pattern matches existing v5 endpoints.

**Why Sheets:** analysts populate and review in spreadsheets. Sheets provides change tracking, revision history, comments, and a familiar interface. The PG layer is system-of-record but analysts work in Sheets.

### 2.3 Datasette (signal sources)

**Purpose:** searchable archive of source articles and contact data, used for source resolution during signal assessment.

**Connection:** existing Datasette deployment at `https://futurbridge-signals.onrender.com`. Holds the signal_engine_v6 SQLite database (~2MB) with 27,473 contacts, 94 entities, 195 strategies, and historical signal records.

The new initiative model does not store raw articles in Datasette. Articles flow through the signal pipeline; only their derived signals get stored (in PG). Datasette retains its role as the contact directory and historical reference.

## 3. Workflow inventory

The system comprises five n8n workflows, each implementing a specific procedure piece.

### WF-INIT-1 — Population assistant

**Purpose:** supports analyst running INITIATIVE_METHODOLOGY.md procedure to populate a new company.

**Trigger:** manual (analyst initiates from Sheets via "Populate new company" button calling Apps Script doPost).

**Behaviour:**
1. Receives company name and scope from analyst input.
2. Fetches T1 source URLs (annual report, recent capital markets day) from a configured map.
3. Calls Claude API to draft initial initiative inventory based on T1 sources (analyst reviews and edits).
4. Cross-references entity catalogue for reuse during step 4-6 of methodology.
5. Writes drafts to `mv1_initiatives`, `mv1_entities`, `mv1_links` Sheets tabs for analyst review and revision.

**Implementation notes:** This workflow is a scaffolding aid, not an autopilot. The analyst remains in the loop for all judgment calls per the methodology document. The workflow accelerates mechanical work (entity catalogue search, source fetching, draft text generation) but doesn't make decisions.

**Status:** to be built; design priority high once methodology v1 is stable.

### WF-INIT-2 — Sheets-to-PG sync

**Purpose:** keeps PG and Sheets in sync as analysts edit the model.

**Trigger:** scheduled (every 15 minutes during working hours; on-demand for material changes).

**Behaviour:**
1. Reads `mv1_initiatives`, `mv1_entities`, `mv1_links` tabs from Sheets via Apps Script.
2. Diffs against PG state.
3. Applies changes to PG (insert new rows, update existing, soft-delete removed rows).
4. Writes back any computed fields (e.g. derived link IDs, last_updated_at timestamps) to Sheets.

**Conflict handling:** Sheets is source-of-truth for analyst-edited fields; PG is source-of-truth for system-computed fields (current_confidence, signal-applied state changes). The sync respects this division.

**Status:** to be built; design priority medium.

### WF-15A — Signal pipeline

**Purpose:** implements the six-step procedure from SIGNAL_PIPELINE.md sections 3.

**Trigger:** scheduled (daily 6am as established by current WF-15; supplemented by hourly polling of high-priority sources).

**Behaviour by step:**

*Step 1 — Ingestion (existing WF-15 pattern):*
- HTTP Request nodes poll RSS feeds and configured news APIs.
- New articles deduplicated against `mv1_ingestion_log` table.
- Raw articles stored to `mv1_ingested_articles` PG table with source metadata.

*Step 2 — Triage:*
- For each ingested article, Code node prepares triage prompt with article first paragraphs and active entity list (queried from PG).
- HTTP Request to Anthropic API (Haiku model for cost) with the prompt.
- Response parsed; classification and candidate_entities written back to article record.
- Articles classified DROP are flagged (not deleted — kept for sample review).

*Step 3 — Entity routing:*
- For PROPAGATE articles, iterate over candidate_entities.
- For each (article, candidate_entity), Code node prepares routing prompt with entity context.
- HTTP Request to Anthropic API (Sonnet model for finer discrimination).
- Response parsed; if `routes_to_entity: true`, create routing record with key_excerpt.

*Step 4 — Claim assessment:*
- For each routing record, query PG for links from initiatives to that entity.
- For each link, Code node prepares assessment prompt with claim, initiative context, and excerpt.
- HTTP Request to Anthropic API (Sonnet model).
- Response parsed; assessment record created with direction, magnitude, confidence, reasoning.

*Step 5 — State determination:*
- For each assessment, Code node applies state transition rules from SIGNAL_PIPELINE.md section 3 step 5.
- The new_state value is written to a candidate signal record.

*Step 6 — Model application:*
- For each candidate signal, route based on review requirement:
  - Material/structural signals → `mv1_signals_pending` for analyst review.
  - Incremental signals with high assessment confidence → directly applied.
  - State-transition signals → analyst review regardless of magnitude.
- For applied signals: Code node computes deltas per affected initiative using behaviour rule, updates `mv1_initiatives.current_confidence` in PG, updates entity state in `mv1_entities`, writes signal record to `mv1_signals_applied`.

**Anthropic API call patterns:**

All Claude calls use the established WF-15 HTTP Request pattern: Raw body, `JSON.stringify(...)` in the upstream Code node, `{{ $json.request_body }}` in the HTTP node body field as plain text. Authentication via `ANTHROPIC_API_KEY` environment variable (rotation pending per known operational items).

Models used:
- Triage: claude-haiku-4-5-20251001 (cheap, high volume)
- Routing: claude-sonnet-4-6 (medium cost, finer discrimination)
- Assessment: claude-sonnet-4-6 (substantive reasoning)
- Special cases: claude-opus-4-7 reserved for analyst-flagged complex assessments only (cost-prohibitive at volume)

**Status:** WF-15 architecture exists at `3yqglVMObKORQ595` running 22 nodes. Extension to initiative-model schema requires reworking nodes that currently target the v5 observable layer to target `mv1_*` tables. Substantial rework; design priority high after methodology v1 stabilises.

### WF-INIT-3 — Absence-of-event detection

**Purpose:** implements the absence-signal generation from SIGNAL_PIPELINE.md section 6.4.

**Trigger:** scheduled (monthly; first of each month).

**Behaviour:**
1. Queries PG for all links with claims containing date thresholds.
2. For each, parses the threshold date.
3. For claims approaching their threshold (within 90 days) without recent supporting signals, generates an absence signal with direction -1, magnitude calibrated to time-past-threshold.
4. Routes generated signals through normal step 5-6 of the pipeline.

**Status:** to be built; design priority low until signal pipeline is operational.

### WF-INIT-4 — Drift management and review

**Purpose:** implements quarterly recalibration from SIGNAL_PIPELINE.md section 7.4.

**Trigger:** scheduled (quarterly).

**Behaviour:**
1. Samples signals from past 90 days (random sample of 50-100).
2. Surfaces them for analyst review with original assessment.
3. Captures analyst-vs-Claude divergence rate.
4. Generates report on assessment patterns, entity state stability, and recommended prompt adjustments.

**Status:** to be built; design priority low until signal pipeline has accumulated 90+ days of data.

## 4. Node-level patterns

### 4.1 Anthropic HTTP Request pattern

Established in WF-15. Continues unchanged.

```
Code node (upstream):
  Build the prompt as a JavaScript string.
  Build the request body object.
  request_body = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [{role: "user", content: prompt}]
  });
  return [{json: {request_body, ...other fields}}];

HTTP Request node:
  Method: POST
  URL: https://api.anthropic.com/v1/messages
  Authentication: Generic Credential Type with anthropic-version + x-api-key headers
  Body Content Type: Raw
  Body: {{ $json.request_body }}
  (Plain text — n8n does NOT re-stringify)
```

This pattern resolved the duplicate-doGet conflict and JSON-shape errors during WF-15 buildout. Do not deviate from it.

### 4.2 PG read/write pattern

Use n8n's native Postgres node with the `hypothesis-db` connection.

For reads: SQL query, results auto-mapped to JSON.

For writes: prefer `INSERT ... ON CONFLICT ... DO UPDATE` (upsert) for entity and initiative updates to handle both new rows and revisions cleanly. For signal application (atomic across multiple tables), use a transaction wrapper Code node that calls multiple PG operations.

### 4.3 Sheets read/write pattern via Apps Script

Apps Script doGet endpoints for reads, doPost for writes. Existing pattern in current Apps Script deployment.

For new initiative-model tabs:
- doGet endpoints: `?action=read&tab=mv1_initiatives` (or other tab names)
- doPost endpoints: `?action=upsert&tab=mv1_initiatives` with body containing rows

The Apps Script handles the Sheets API authentication and rate-limiting. n8n calls the Apps Script URL via HTTP Request node.

### 4.4 Error handling

Each major operation wraps in error handling:
- Anthropic API failures: retry with exponential backoff (3 retries), then route to error queue.
- PG write failures: rollback transaction, log to `mv1_error_log`, notify analyst.
- Sheets write failures: retry, then write to local fallback queue and re-attempt next cycle.

Critical operations (signal application) write to `mv1_signal_application_log` before and after to enable post-mortem if a write fails partway.

## 5. Operational concerns

### 5.1 Rate limits and cost

Anthropic API rate limits at the tier in use:
- Triage volume (Haiku): 500-2,500 calls/day. Cheap; well within limits.
- Routing volume (Sonnet): 100-500 calls/day. Moderate cost.
- Assessment volume (Sonnet): 50-300 calls/day. Moderate cost.

Daily Claude cost estimate at the upper end of volume: $20-40/day. Well within reasonable operational budget.

Sheets API rate limits: 300 read requests/minute per project. The 15-minute Sheets sync interval keeps the system well within limits.

PG connections on Railway: pool of 20 connections. n8n uses persistent connection pool; well within limits at expected concurrency.

### 5.2 Backup and recovery

- PG: Railway provides automated daily backups. Restore tested quarterly.
- Sheets: Google's revision history; manual backup of master sheet weekly.
- n8n workflows: versioned in the n8n bridge tool (sync.js at `C:\Users\Admin\workfiles-\n8n\sync.js`); committed to git in the workfiles- repo.

### 5.3 Monitoring

Daily check (analyst, ~5 minutes):
- Articles ingested count.
- Triage drop rate.
- Signals applied count.
- Any errors in error queue.
- Any signals in pending review queue.

Weekly check (analyst, ~30 minutes):
- Triage sample review (10 random DROP articles).
- Assessment sample review (10 random material/structural assessments).
- Entity state changes since last week.
- Initiative confidence movements >0.10 in past week.

Quarterly check (analyst, half day):
- Drift management review (WF-INIT-4 output).
- Methodology pattern review — recurring assessment difficulties or routing misses.
- Documentation update if drift surfaces methodology gaps.

### 5.4 Credential management

API keys and secrets:
- ANTHROPIC_API_KEY: rotation pending per current operational items. New key rotation scheduled.
- N8N_API_KEY (for sync.js): rotation pending per current operational items.
- Google Apps Script OAuth: re-authorise annually or on suspicion.
- Railway PG password: rotate quarterly.
- Datasette access: read-only public; no rotation needed.

All keys stored in:
- n8n environment variables (preferred)
- Local .env file at `C:\Users\Admin\workfiles-\n8n\.env` (development only)
- Never in workflow JSON, never in code commits, never in prompts.

## 6. Migration sequence

The migration from current WF-15 to the new initiative-model architecture is staged.

**Phase 1 (immediate):**
- Migration 004 deployed to PG (`mv1_*` tables).
- Apps Script extended with new endpoints.
- Sheets master sheet gets new tabs.
- Existing WF-15 continues running against legacy schema.

**Phase 2 (1-2 weeks):**
- WF-INIT-1 (population assistant) built and tested.
- First company (Shell) populated end-to-end via methodology.
- WF-INIT-2 (Sheets-PG sync) operational.
- Verification that v3 visualisation renders from PG-backed data correctly.

**Phase 3 (2-4 weeks):**
- WF-15A (signal pipeline) reworked to target `mv1_*` schema.
- Triage, routing, assessment prompts tuned against real signal flow.
- Analyst review queues operational.
- Live signal flow on Shell initiatives.

**Phase 4 (4-8 weeks):**
- Second and third companies populated (BP, Equinor or similar).
- Cross-company queries enabled.
- WF-INIT-3 (absence detection) deployed.
- Legacy WF-15 deprecated; observable_layer schema marked for removal.

**Phase 5 (3-6 months):**
- WF-INIT-4 (drift management) operational with 90 days of accumulated data.
- Methodology v1.x revisions based on operational learning.
- Prompt versioning and recalibration cycles established.

## 7. Anti-patterns and failure modes

### 7.1 Implementation anti-patterns

**Bypassing analyst review for material/structural signals.** Material/structural signals can move confidence by 0.15+. Auto-applying them without review introduces high-impact errors. Always review material+ before application.

**Rebuilding behaviour rule logic in n8n Code nodes.** The behaviour rule is defined once in INITIATIVE_MODEL.md. Implement it as a single shared Code module imported into nodes that need it (or as a PG function). Don't re-implement in each node.

**Embedding prompt text in workflow JSON.** Prompts are versioned content. Store them in a separate prompts table or repo, reference by ID in the workflow. Updates to a prompt should be a content change, not a workflow change.

**Using the wrong model tier for a step.** Triage on Sonnet wastes cost; assessment on Haiku produces poor judgment. Match the model tier to the cognitive demand per section 3.

### 7.2 Operational anti-patterns

**Letting the review queue accumulate.** If analyst review backlogs to >2 weeks, signals applied late lose contextual relevance. Either staff up review or tighten triage to reduce volume.

**Manual edits to PG without going through Sheets.** Breaks the audit trail. The Sheets→PG sync is the canonical write path for analyst edits.

**Running signal application during initial population.** Applying signals to half-populated initiatives produces nonsensical movements. Suspend signal application until population step 10 completes for any new initiative.

### 7.3 Data integrity anti-patterns

**Soft-deleted rows referenced by active links.** If an entity is soft-deleted but a link still references it, the link breaks. Migration 004 includes referential integrity constraints; cascading delete behaviour explicitly defined.

**Confidence band drift without signals.** If `current_confidence` diverges from baseline_confidence + sum_of_signal_deltas, something is wrong (manual edit, application bug, or schema drift). Periodic reconciliation script flags any divergence.

**Lost signal records.** Signal records are append-only. Any deletion is a data integrity violation. Use soft-delete with `superseded_at` if a signal needs to be effectively removed.

## 8. The integration with existing systems

### 8.1 GitHub Pages platform

The chris-guerin.github.io/workfiles-/ platform hosts visualisation tools (account_plans_v4.html, the Shell H3 portfolio v3 from prior work).

The new model integrates by:
- Visualisations fetch from the Apps Script doGet endpoints (read-only) to render current model state.
- Updates flow through the n8n→PG→Sheets path; the visualisation reads the latest state on page load.
- Caching via localStorage as in current tools.

The visualisation layer is independent of the model storage. Future visualisation iterations don't require changes to the model or pipeline.

### 8.2 Existing client deliverables

Intelligence briefs, account plans, and meeting prep tools continue to exist alongside the model. They reference the model's outputs but aren't replaced by it.

The model is the analytical infrastructure; the deliverables are the surface presented to clients. The model makes deliverables faster to produce and more defensible, but doesn't replace the analyst's role in producing them.

### 8.3 Datasette contact database

The signal pipeline can flag articles that mention specific contacts in the Datasette database (e.g. an article quoting Wael Sawan connects to the Shell Wael Sawan contact record). This linkage is not yet implemented but is straightforward — entity routing step 3 can be extended to surface contact mentions for analyst awareness.

## 9. Versioning

This is version 1.0 of the n8n implementation, paired with v1.0 of INITIATIVE_MODEL.md, INITIATIVE_METHODOLOGY.md, and SIGNAL_PIPELINE.md.

Future implementation versions may:
- Migrate from Apps Script to direct n8n→Sheets API calls when n8n's Sheets node matures.
- Add Slack/email notifications for material signals on analyst-watched initiatives.
- Implement the v2 behaviour rule with magnitude and assessment_confidence multipliers.
- Add cross-company signal correlation analysis.

These extensions are deferred. The v1 implementation is operational with the v1 model.

## 10. Quick-reference operational checklist

For an analyst starting their day with the system:

- Open the master Sheets, tab `mv1_signals_pending`.
- Review any signals queued for analyst attention.
- For each: read the source excerpt, the claim being assessed, the assessment reasoning. Approve, override, or reject.
- Approved signals move to applied. Overridden signals get the analyst's revised direction/magnitude/confidence and apply with that. Rejected signals are dropped.
- Review the `mv1_review_queue` tab for state transitions awaiting confirmation. Approve or override.
- Glance at the model dashboard (visualisation layer) for any initiatives with confidence movements >0.05 since last review. Drill in to investigate if surprising.
- Check error queue. Resolve any operational errors.

This daily loop should take 20-40 minutes for a normal news cycle, longer in active periods.
