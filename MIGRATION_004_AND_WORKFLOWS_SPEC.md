# Migration 004 + paired workflow rebuild
## Spec for Claude Code session, 1 May 2026

This document is the single executable spec for today's session. It defines the schema for migration 004, the API service to deploy, and the rebuild of WF-WeeklyNews and WF-15A onto PG, with verification gates between each chunk.

Context this spec assumes:
- /docs/INITIATIVE_MODEL.md and /docs/INITIATIVE_METHODOLOGY.md are the canonical methodology reference
- ARCHITECTURE.md v5.7 is current
- Migration 003 has committed the legacy observable_layer tables which are now deprecated but not dropped
- The full architectural picture (three engines, retirement of Sheets, recommendation layer) is named in this conversation but only the substrate parts get built today

---

## 1. Frame

The work today does three things in sequence, each verifiable before moving on:

1. Deploy migration 004 to PG. Adds eight new tables to the hypothesis-db instance: news, mini_signals, signals, heat_map_aggregates, initiatives, entities, links, competitive_events. Plus recommendations as a parked-empty table. Plus competitive_events. Plus a content_hash index for dedupe.

2. Deploy a thin Node service to Railway alongside n8n. Provides four endpoints today: POST /news, POST /mini_signals, GET /news, DELETE /news/:id. API key authentication. Three more endpoints (initiatives read, entities read, signals create) deferred until we wire the brief later this week.

3. Rebuild WF-WeeklyNews and WF-15A as new workflows pointing at PG via the API. Webhook chain: WF-WeeklyNews completes, fires WF-15A. Parallel-test against the live legacy workflows. Cut over once verified.

Everything that already works stays working. The original WF-WeeklyNews and WF-15A workflows continue running on the Sheet until we've confirmed the new ones produce equivalent output. No-risk migration path.

What today doesn't do: the analyst tool, the live brief, the recommendation layer, the WF-15 rework. Those are sequenced for later this week. Today is the substrate.

---

## 2. Migration 004 — schema

### 2.1 The news table

Holds raw RSS ingestion before extraction. Row appears here when WF-WeeklyNews-PG ingests an item. Row gets deleted by WF-15A-PG once it's been extracted to mini_signals.

```sql
CREATE TABLE news (
  id BIGSERIAL PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE,           -- existing convention from legacy WF
  date_detected TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL,                     -- RSS feed source URL or feed name
  signal_type TEXT,                         -- Patent / Funding / M&A / Partnership / Policy / Launch / Milestone / Legislation
  title TEXT NOT NULL,
  sector_tags TEXT,                         -- comma-separated tags from legacy WF
  tech_tags TEXT,                           -- comma-separated tags from legacy WF
  geography TEXT,
  companies_mentioned TEXT,                 -- comma-separated, from Detect Companies & Tag
  relevance_score TEXT,                     -- legacy column kept as text for compatibility
  url TEXT NOT NULL,
  pub_date TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,                 -- nullable, set by API on insert as ingestion timestamp
  content_hash TEXT NOT NULL,               -- sha256 of title + url + pub_date, indexed for dedupe
  extraction_attempts INTEGER NOT NULL DEFAULT 0,
  last_extraction_attempt_at TIMESTAMPTZ,
  CONSTRAINT news_content_hash_unique UNIQUE (content_hash)
);

CREATE INDEX idx_news_content_hash ON news(content_hash);
CREATE INDEX idx_news_pub_date ON news(pub_date DESC);
```

Note: 16 columns total. Dropped from the legacy 18-column Sheet schema: radar_to_update, prompt_to_trigger, Exec_to_alert, Notes (per "drop K, L, M plus Notes" agreed). Status column also dropped — presence in table IS the unprocessed state. Added: content_hash, extraction_attempts, last_extraction_attempt_at.

### 2.2 The mini_signals table

Permanent. WF-15A-PG writes rows here after Claude Haiku extraction. Never deleted; this is the audit trail.

```sql
CREATE TABLE mini_signals (
  id BIGSERIAL PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_date TIMESTAMPTZ,
  source TEXT,
  source_type TEXT,
  url TEXT,
  headline TEXT NOT NULL,
  companies TEXT,                           -- comma-separated
  technologies TEXT,                        -- comma-separated, canonical name (no leading-space variant)
  geography TEXT,
  event_type TEXT,
  value_chain_position TEXT,
  short_summary TEXT,
  evidence_snippet TEXT,
  content_density TEXT,
  confidence TEXT,                          -- canonical name (no trailing-space variant)
  extraction_model TEXT,
  reasoning_classification TEXT,
  reasoning_at TIMESTAMPTZ,
  hypothesis_matches TEXT,
  novelty_assessment TEXT,
  candidate_hypothesis TEXT,
  pattern_cluster_id TEXT,                  -- canonical spelling (replaces patter_cluster_id typo)
  source_news_id BIGINT,                    -- FK to news.id at time of extraction; news row gets deleted but this preserves provenance trail
  content_hash TEXT NOT NULL                -- copied from news for cross-table dedupe
);

CREATE INDEX idx_mini_signals_content_hash ON mini_signals(content_hash);
CREATE INDEX idx_mini_signals_extracted_at ON mini_signals(extracted_at DESC);
```

24 columns total. Cleaned from legacy 26: removed three duplicate column-name variants (the leading-space `technologies`, trailing-space `confidence`, and typo `patter_cluster_id`); their canonical replacements stay. Added: source_news_id (provenance), content_hash (dedupe).

### 2.3 The signals table

Schema specified now per `/docs/SIGNAL_PIPELINE.md` section 2 but not populated today. The structured signal pipeline that writes here is tomorrow's work.

```sql
CREATE TABLE signals (
  id BIGSERIAL PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE,
  source_url TEXT,
  source_title TEXT,
  source_excerpt TEXT,
  source_published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_entity TEXT REFERENCES entities(id),
  claim_being_assessed TEXT,
  direction SMALLINT CHECK (direction IN (-1, 0, 1)),
  magnitude TEXT CHECK (magnitude IN ('incremental','material','structural')),
  assessment_confidence TEXT CHECK (assessment_confidence IN ('low','medium','high')),
  assessment_reasoning TEXT,
  new_state TEXT CHECK (new_state IN ('holding','weakening','broken','ambiguous')),
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  delta_per_initiative JSONB,
  source_mini_signal_id BIGINT REFERENCES mini_signals(id),  -- provenance to upstream
  content_hash TEXT
);

CREATE INDEX idx_signals_target_entity ON signals(target_entity);
CREATE INDEX idx_signals_applied_at ON signals(applied_at DESC);
CREATE INDEX idx_signals_content_hash ON signals(content_hash);
```

### 2.4 The heat_map_aggregates table

Written by WF-15A-PG in parallel with each mini_signal write, before the news row is deleted. Heat map renders read from here, never from raw news.

```sql
CREATE TABLE heat_map_aggregates (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  sector_tag TEXT,
  company TEXT,
  signal_type TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT heat_map_unique UNIQUE (date, sector_tag, company, signal_type)
);

CREATE INDEX idx_heat_map_date ON heat_map_aggregates(date DESC);
```

Aggregates are upserted (`ON CONFLICT (date, sector_tag, company, signal_type) DO UPDATE SET count = count + 1`).

### 2.5 The initiative model tables

Per /docs/INITIATIVE_MODEL.md section 3. Created in migration 004 even though no initiatives are populated today; tomorrow's work populates Shell.

```sql
CREATE TABLE initiatives (
  id TEXT PRIMARY KEY,                      -- e.g. SHELL_H3_HYDROGEN_NWE
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  segment TEXT,
  register TEXT NOT NULL CHECK (register IN ('PERSONAL','INDUSTRY','SECTOR','CLIENT_ACCOUNT')),
  hypothesis_statement TEXT NOT NULL,
  time_horizon TEXT NOT NULL,
  decision_window TEXT,
  decision_threshold TEXT NOT NULL,
  baseline_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (baseline_confidence BETWEEN 0 AND 1),
  current_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (current_confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE entities (
  id TEXT PRIMARY KEY,                      -- SCREAMING_SNAKE_CASE per methodology
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tech','market','regulation','ecosystem')),
  current_state TEXT NOT NULL,
  threshold TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('holding','weakening','broken','ambiguous')),
  baseline_state TEXT NOT NULL CHECK (baseline_state IN ('holding','weakening','broken','ambiguous')),
  note TEXT,
  sources TEXT,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE links (
  id TEXT PRIMARY KEY,                      -- composite: initiative_id ':' entity_id
  initiative_id TEXT NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  role TEXT NOT NULL CHECK (role IN ('principal','enabling','optional','external')),
  impact TEXT NOT NULL CHECK (impact IN ('neutral','amplifying','threatening')),
  criticality TEXT NOT NULL CHECK (criticality IN ('gating','enabling','non-critical')),
  claim TEXT NOT NULL,
  claim_basis TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT links_unique UNIQUE (initiative_id, entity_id)
);

CREATE INDEX idx_links_initiative ON links(initiative_id);
CREATE INDEX idx_links_entity ON links(entity_id);

CREATE TABLE competitive_events (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date DATE,
  affects_initiatives TEXT,                 -- comma-separated initiative IDs
  affects_entities TEXT,                    -- comma-separated entity IDs
  implication TEXT,
  severity TEXT CHECK (severity IN ('minor','material','major')),
  source_url TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.6 The recommendations table

Parked. Created in migration 004 with schema, not populated today.

```sql
CREATE TABLE recommendations (
  id BIGSERIAL PRIMARY KEY,
  company TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggering_signal_ids TEXT,               -- JSON array of signal IDs that triggered regeneration
  initiatives_covered TEXT,                 -- JSON array of initiative IDs
  recommendation_text JSONB NOT NULL,       -- structured: { decisions: [{title, reasoning, supporting_entities, supporting_signals, time_horizon}] }
  model_state_hash TEXT,                    -- hash of relevant initiatives/entities at generation time
  superseded_at TIMESTAMPTZ                 -- non-null when newer recommendation replaces this one
);

CREATE INDEX idx_recommendations_company ON recommendations(company);
CREATE INDEX idx_recommendations_active ON recommendations(company) WHERE superseded_at IS NULL;
```

### 2.7 Migration runner discipline

Same pattern as migration 003: db/migrations/004_substrate.sql for the DDL, db/migrations/004_substrate_runner.js for the verification harness.

The runner must:
- Connect to hypothesis-db via the env-configured connection string
- Run all DDL inside a single transaction with BEGIN/COMMIT
- Default to dry-run mode (BEGIN; ... ROLLBACK at end)
- Only commit if --commit flag passed
- Run 14 verification checks BEFORE the commit decision: each new table exists, each FK constraint is in place, each CHECK constraint enforced, each index created, expected column count matches per table, no rows in any new table (fresh deploy). All 14 must pass; ANY failure rolls back regardless of --commit flag.
- Output: number of tables created, FK count, CHECK constraint count, index count, plus the 14 verification results.

Once committed, ARCHITECTURE.md gets bumped v5.7 → v5.8 with a changelog comment naming this migration. Same discipline as migration 003 → v5.6.

### 2.8 What migration 004 does NOT do

- Does not drop the legacy observable_layer tables (hypothesis_observable, hypothesis_observable_event, confidence_band_history). Those stay until migration 005 cutover.
- Does not modify the existing 118 hypothesis_register rows.
- Does not pre-populate any new table. All eight new tables are empty after commit.
- Does not delete any existing Sheet tabs. Sheets stay live in parallel until verification of new workflows passes.

---

## 3. API service

Small Node service. Deployed as a new Railway service in the same project as n8n and hypothesis-db. Connects directly to PG via environment-injected connection string.

### 3.1 Stack

- Node 20+, Express
- pg library for PG access (use connection pooling)
- Single index.js or four small files (server.js, routes.js, db.js, auth.js)
- Authentication: API key in Authorization header. Single key for all endpoints today; n8n-side env var stores it. Rotation discipline per R24.
- Deployed to Railway as a new service in the existing project. Internal URL accessible from n8n.

### 3.2 Endpoints for today

```
POST /news
Body: { signal_id, source, signal_type, title, sector_tags, tech_tags, geography, companies_mentioned, relevance_score, url, pub_date }
Behaviour:
  1. Compute content_hash = sha256(title + url + pub_date)
  2. Check whether content_hash exists in news OR mini_signals
  3. If exists: return { status: 'duplicate', existing_id: ... } with HTTP 200
  4. If not: insert into news with content_hash, return { status: 'inserted', id: ... }

GET /news
Returns: array of all rows in news table, ordered by pub_date DESC.

DELETE /news/:id
Behaviour: hard-deletes the row. Returns { status: 'deleted', id: ... }.

POST /mini_signals
Body: full mini_signals row including source_news_id and content_hash.
Behaviour:
  1. Insert into mini_signals
  2. Optionally also increment heat_map_aggregates: upsert (date, sector_tag, company, signal_type, +1)
     For now, the API does the heat map increment automatically based on sector/company/event_type from the body.
  3. Return { status: 'inserted', id: ... }
```

### 3.3 What the API does NOT do today

No initiatives endpoints, no entity endpoints, no signal-application logic. Those land later this week when the analyst tool needs them. Today is just the news → mini_signals plumbing.

### 3.4 Verification of the API

Once deployed, manual curl check from a local terminal:
- POST a test news row, verify 200 response with `inserted` status
- POST the same payload again, verify `duplicate` response
- GET /news, verify the row is present
- POST a test mini_signal with the news row's id as source_news_id
- DELETE /news/:id, verify the row is gone

That's the API verification gate before we touch n8n.

---

## 4. Workflow rebuild

### 4.1 WF-WeeklyNews-PG

Duplicate of "Signal Engine - Weekly News + Legislation Scan" with these changes:

**Removed:**
- The Google Sheets `Log to Signal Tracker` node entirely

**Replaced with:**
- An HTTP Request node `POST /news` (one call per item, or batch — batch preferred if the API supports array body)

**Added at end:**
- An HTTP Request node firing the WF-15A webhook URL after all news writes complete
- The webhook fire is the last node before the existing `Email Alert to Chris` and `Wait` nodes

**Detect Companies & Tag node** stays as is — same JS logic, same watched companies, same tagging. The only thing that changes is where the output writes to.

**Datasette write** — keep as is. Operating in parallel for now, no change required.

**Schedule trigger** — disabled in WF-WeeklyNews-PG until parallel testing passes. Original WF-WeeklyNews keeps its trigger and continues to write to the legacy Sheet.

### 4.2 WF-15A-PG

Duplicate of "WF-15A Signal Extraction." with these changes:

**Removed:**
- `Schedule Trigger` node (replaced by webhook trigger)
- `Get News Feeds` Google Sheets node entirely (replaced by GET /news)
- `Write to Mini_Signals` Google Sheets node entirely (replaced by POST /mini_signals)
- Status filter `status = 'NEW'` from the read step (no status field anymore; everything in news is unprocessed by definition)

**Added:**
- `Webhook Trigger` node at start, configured to receive the POST from WF-WeeklyNews-PG
- HTTP Request node `GET /news` to fetch unprocessed rows
- HTTP Request node `POST /mini_signals` after the Parse + Validate step (the existing Map to Canonical Schema, Noise Blocklist + Deduplicate, Build Extraction Payload, Claude Haiku Extract, Parse + Validate, Split Rows nodes all stay; only the input source and output destination change)
- HTTP Request node `DELETE /news/:id` after each successful POST /mini_signals

**Datasette write** — keep as is. Same parallel-operation as WF-WeeklyNews-PG.

**Failed-extraction handling:**
- If POST /mini_signals fails for a given news row, the DELETE doesn't fire for that row
- The row stays in news; next webhook fire (next week) it gets retried automatically
- Each retry attempt should hit a small extraction_attempts counter increment via PATCH /news/:id (or simply update the news row directly via the API; for v0 we can add a small PATCH endpoint if needed)

For v0 today, skip the extraction_attempts counter increment. Just let failed rows sit. Add the increment in a follow-up patch this week.

### 4.3 Webhook architecture

- New webhook in n8n: configurable URL like /webhook/wf-15a-trigger
- WF-WeeklyNews-PG fires this URL via HTTP POST after all news writes complete and before its existing Email Alert step
- WF-15A-PG's Webhook Trigger receives, fires the workflow

### 4.4 Parallel testing protocol

Before cutover:
1. Manual trigger of WF-WeeklyNews-PG (its schedule remains disabled). Verify news rows appear in PG via direct query to hypothesis-db.
2. Verify WF-15A-PG fires automatically via webhook. Verify mini_signals rows appear, news rows get deleted, heat_map_aggregates rows get incremented.
3. Compare counts: WF-WeeklyNews-PG inserted N rows, WF-15A-PG processed N rows, mini_signals has M rows after processing (some may be filtered as noise), heat_map_aggregates rows incremented appropriately, news ends with 0 rows (or only failed extractions).
4. Run again next Monday's cycle alongside the original. Compare news row count between PG and Sheet — they should be ±5% of each other (small variance acceptable due to dedupe behaviour differences). Compare mini_signals likewise.
5. Once two consecutive Monday cycles match: switch the schedule trigger from the original WF-WeeklyNews to WF-WeeklyNews-PG. Disable the original. After one more clean week, archive the original workflow and the legacy Signal Tracker / Mini_Signals Sheet tabs.

### 4.5 Rollback

If anything in the new workflow breaks during parallel testing:
- Original WF-WeeklyNews and WF-15A continue running on their schedules — no production impact
- Disable WF-WeeklyNews-PG and WF-15A-PG until fixed
- The PG news and mini_signals tables can be truncated if test data is contaminating the system

If the issue is in migration 004 itself (post-commit), the rollback is a separate migration 004_rollback.sql that drops the eight new tables. Don't write that today; it's only needed if the schema is fundamentally wrong and we'd notice that before committing.

---

## 5. Today's execution sequence

Hour 0-2: Migration 004
- Spec written ✓ (this document)
- 004_substrate.sql written
- 004_substrate_runner.js written
- Dry-run executed, all 14 verification checks pass
- Commit, ARCHITECTURE.md bumped to v5.8, sessions/2026-04-30-am.md archived, sessions/_next.md updated

Hour 2-4: API service
- Node service built, four endpoints
- Deployed to Railway
- Curl-tested locally; all four endpoints working

Hour 4-6: WF-WeeklyNews-PG
- Workflow duplicated in n8n
- Sheets node replaced with HTTP Request to POST /news
- Webhook fire to WF-15A added
- Manual test, verify rows in PG

Hour 6-8: WF-15A-PG
- Workflow duplicated in n8n
- Schedule trigger replaced with Webhook
- Get News Feeds Sheets read replaced with GET /news
- Write to Mini_Signals Sheets write replaced with POST /mini_signals
- DELETE /news/:id added on success
- Manual test, verify mini_signals appear, news rows deleted, heat map increments

Hour 8-10: End-to-end test
- Trigger WF-WeeklyNews-PG manually
- Watch the chain fire through
- Compare row counts and column mappings against the legacy Sheets tabs
- Document any discrepancies

Hour 10-12: Cleanup and documentation
- ARCHITECTURE.md updated with the changes
- /docs/N8N_IMPLEMENTATION.md updated with the new workflow architecture
- sessions/2026-05-01.md created with full session log
- git commit and push per R26

If we hit hour 12 and the parallel test isn't passing yet, we hold the cutover until next week. The original workflows continue to run; we have a debug week to sort out any drift before retiring them.

---

## 6. Verification gates between chunks

Each chunk ends with explicit verification before moving on:

- After migration 004: `\d news`, `\d mini_signals`, `\d heat_map_aggregates`, `\d initiatives` etc. via psql or runner output. Confirm 8 tables created, all FKs and CHECKs in place. ROLLBACK if any verification fails.

- After API service: curl smoke test. POST /news returns 200 inserted, repeat returns duplicate. POST /mini_signals returns 200 inserted. GET /news returns the row. DELETE /news/:id returns 200. heat_map_aggregates incremented by 1.

- After WF-WeeklyNews-PG: manual trigger; check PG via psql that news rows appear and content_hashes are populated. Webhook fired (n8n execution log shows it).

- After WF-15A-PG: webhook receives, workflow fires, mini_signals rows appear in PG, news rows deleted, heat_map_aggregates incremented. Datasette write also fires (parallel-operation check).

- After end-to-end: mini_signals row count matches expected (~120 from 2,000 news after extraction); news ends near-empty.

If any gate fails, stop. Don't move to the next chunk until the failure is understood and either fixed or explicitly accepted.

---

## 7. What this leaves for the rest of the week

Tomorrow:
- Populate Shell initiatives in PG via the analyst tool (which we'll build a thin version of this week, or use direct PG inserts via psql for the demo)
- Adapt SHELL_H3_PORTFOLIO_v3.html to fetch from a new GET /initiatives endpoint
- Stub out the brief template

Day three:
- Recommendation layer prototype
- Brief layout polished
- Internal review

Day four:
- Demo readiness pass

Day five:
- Demo to buyer

Today is the substrate. Get this right, the rest unlocks.
