-- 004_substrate.sql
-- Migration 004 — initiative-model substrate + news/mini_signals plumbing.
--
-- Schema effect: v5.6 → v6.0 (legacy observable_layer tables remain in place,
-- deprecated, scheduled for drop in migration 005 once cutover is complete).
--
-- Eight new tables created in FK-dependency order:
--   1. initiatives          — strategic bets per /docs/INITIATIVE_MODEL.md §3.1
--   2. entities             — global catalogue per §3.2
--   3. links                — (initiative, entity) relationships per §3.3 (FK → initiatives, entities)
--   4. competitive_events   — competitive event log per §3.4
--   5. mini_signals         — extracted news per /docs/SIGNAL_PIPELINE.md §1
--   6. news                 — raw RSS staging (rows deleted by WF-15A-PG after extraction)
--   7. signals              — structured signals per /docs/SIGNAL_PIPELINE.md §2 (FK → entities, mini_signals)
--   8. heat_map_aggregates  — daily counts per (date, sector, company, signal_type)
--
-- One parked table:
--   9. recommendations      — populated later when recommendation layer ships
--
-- Idempotent. Safe to re-run. No BEGIN/COMMIT here — runner manages the transaction.

-- ============================================================================
-- 1. initiatives
-- ============================================================================

CREATE TABLE IF NOT EXISTS initiatives (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  company               TEXT NOT NULL,
  segment               TEXT,
  register              TEXT NOT NULL,
  hypothesis_statement  TEXT NOT NULL,
  time_horizon          TEXT NOT NULL,
  decision_window       TEXT,
  decision_threshold    TEXT NOT NULL,
  baseline_confidence   NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  current_confidence    NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'initiatives_register_enum') THEN
    ALTER TABLE initiatives
      ADD CONSTRAINT initiatives_register_enum
      CHECK (register IN ('PERSONAL','INDUSTRY','SECTOR','CLIENT_ACCOUNT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'initiatives_baseline_confidence_range') THEN
    ALTER TABLE initiatives
      ADD CONSTRAINT initiatives_baseline_confidence_range
      CHECK (baseline_confidence BETWEEN 0 AND 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'initiatives_current_confidence_range') THEN
    ALTER TABLE initiatives
      ADD CONSTRAINT initiatives_current_confidence_range
      CHECK (current_confidence BETWEEN 0 AND 1);
  END IF;
END $$;

-- ============================================================================
-- 2. entities
-- ============================================================================

CREATE TABLE IF NOT EXISTS entities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  current_state   TEXT NOT NULL,
  threshold       TEXT NOT NULL,
  state           TEXT NOT NULL,
  baseline_state  TEXT NOT NULL,
  note            TEXT,
  sources         TEXT,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entities_type_enum') THEN
    ALTER TABLE entities
      ADD CONSTRAINT entities_type_enum
      CHECK (type IN ('tech','market','regulation','ecosystem'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entities_state_enum') THEN
    ALTER TABLE entities
      ADD CONSTRAINT entities_state_enum
      CHECK (state IN ('holding','weakening','broken','ambiguous'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entities_baseline_state_enum') THEN
    ALTER TABLE entities
      ADD CONSTRAINT entities_baseline_state_enum
      CHECK (baseline_state IN ('holding','weakening','broken','ambiguous'));
  END IF;
END $$;

-- ============================================================================
-- 3. links
-- ============================================================================

CREATE TABLE IF NOT EXISTS links (
  id              TEXT PRIMARY KEY,
  initiative_id   TEXT NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  entity_id       TEXT NOT NULL REFERENCES entities(id),
  role            TEXT NOT NULL,
  impact          TEXT NOT NULL,
  criticality     TEXT NOT NULL,
  claim           TEXT NOT NULL,
  claim_basis     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'links_role_enum') THEN
    ALTER TABLE links
      ADD CONSTRAINT links_role_enum
      CHECK (role IN ('principal','enabling','optional','external'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'links_impact_enum') THEN
    ALTER TABLE links
      ADD CONSTRAINT links_impact_enum
      CHECK (impact IN ('neutral','amplifying','threatening'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'links_criticality_enum') THEN
    ALTER TABLE links
      ADD CONSTRAINT links_criticality_enum
      CHECK (criticality IN ('gating','enabling','non-critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'links_unique') THEN
    ALTER TABLE links
      ADD CONSTRAINT links_unique UNIQUE (initiative_id, entity_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_links_initiative ON links(initiative_id);
CREATE INDEX IF NOT EXISTS idx_links_entity     ON links(entity_id);

-- ============================================================================
-- 4. competitive_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS competitive_events (
  id                   BIGSERIAL PRIMARY KEY,
  actor                TEXT NOT NULL,
  event_type           TEXT NOT NULL,
  description          TEXT NOT NULL,
  event_date           DATE,
  affects_initiatives  TEXT,
  affects_entities     TEXT,
  implication          TEXT,
  severity             TEXT,
  source_url           TEXT,
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competitive_events_severity_enum') THEN
    ALTER TABLE competitive_events
      ADD CONSTRAINT competitive_events_severity_enum
      CHECK (severity IS NULL OR severity IN ('minor','material','major'));
  END IF;
END $$;

-- ============================================================================
-- 5. mini_signals
-- ============================================================================

CREATE TABLE IF NOT EXISTS mini_signals (
  id                          BIGSERIAL PRIMARY KEY,
  signal_id                   TEXT NOT NULL UNIQUE,
  extracted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_date              TIMESTAMPTZ,
  source                      TEXT,
  source_type                 TEXT,
  url                         TEXT,
  headline                    TEXT NOT NULL,
  companies                   TEXT,
  technologies                TEXT,
  geography                   TEXT,
  event_type                  TEXT,
  value_chain_position        TEXT,
  short_summary               TEXT,
  evidence_snippet            TEXT,
  content_density             TEXT,
  confidence                  TEXT,
  extraction_model            TEXT,
  reasoning_classification    TEXT,
  reasoning_at                TIMESTAMPTZ,
  hypothesis_matches          TEXT,
  novelty_assessment          TEXT,
  candidate_hypothesis        TEXT,
  pattern_cluster_id          TEXT,
  source_news_id              BIGINT,
  content_hash                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mini_signals_content_hash ON mini_signals(content_hash);
CREATE INDEX IF NOT EXISTS idx_mini_signals_extracted_at ON mini_signals(extracted_at DESC);

-- ============================================================================
-- 6. news
-- ============================================================================

CREATE TABLE IF NOT EXISTS news (
  id                            BIGSERIAL PRIMARY KEY,
  signal_id                     TEXT NOT NULL UNIQUE,
  date_detected                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source                        TEXT NOT NULL,
  signal_type                   TEXT,
  title                         TEXT NOT NULL,
  sector_tags                   TEXT,
  tech_tags                     TEXT,
  geography                     TEXT,
  companies_mentioned           TEXT,
  relevance_score               TEXT,
  url                           TEXT NOT NULL,
  pub_date                      TIMESTAMPTZ,
  processed_at                  TIMESTAMPTZ,
  content_hash                  TEXT NOT NULL,
  extraction_attempts           INTEGER NOT NULL DEFAULT 0,
  last_extraction_attempt_at    TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_content_hash_unique') THEN
    ALTER TABLE news
      ADD CONSTRAINT news_content_hash_unique UNIQUE (content_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_news_content_hash ON news(content_hash);
CREATE INDEX IF NOT EXISTS idx_news_pub_date     ON news(pub_date DESC);

-- ============================================================================
-- 7. signals
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals (
  id                       BIGSERIAL PRIMARY KEY,
  signal_id                TEXT NOT NULL UNIQUE,
  source_url               TEXT,
  source_title             TEXT,
  source_excerpt           TEXT,
  source_published_at      TIMESTAMPTZ,
  ingested_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_entity            TEXT REFERENCES entities(id),
  claim_being_assessed     TEXT,
  direction                SMALLINT,
  magnitude                TEXT,
  assessment_confidence    TEXT,
  assessment_reasoning     TEXT,
  new_state                TEXT,
  applied_at               TIMESTAMPTZ,
  applied_by               TEXT,
  delta_per_initiative     JSONB,
  source_mini_signal_id    BIGINT REFERENCES mini_signals(id),
  content_hash             TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signals_direction_enum') THEN
    ALTER TABLE signals
      ADD CONSTRAINT signals_direction_enum
      CHECK (direction IS NULL OR direction IN (-1, 0, 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signals_magnitude_enum') THEN
    ALTER TABLE signals
      ADD CONSTRAINT signals_magnitude_enum
      CHECK (magnitude IS NULL OR magnitude IN ('incremental','material','structural'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signals_assessment_confidence_enum') THEN
    ALTER TABLE signals
      ADD CONSTRAINT signals_assessment_confidence_enum
      CHECK (assessment_confidence IS NULL OR assessment_confidence IN ('low','medium','high'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signals_new_state_enum') THEN
    ALTER TABLE signals
      ADD CONSTRAINT signals_new_state_enum
      CHECK (new_state IS NULL OR new_state IN ('holding','weakening','broken','ambiguous'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_signals_target_entity ON signals(target_entity);
CREATE INDEX IF NOT EXISTS idx_signals_applied_at    ON signals(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_content_hash  ON signals(content_hash);

-- ============================================================================
-- 8. heat_map_aggregates
-- ============================================================================

CREATE TABLE IF NOT EXISTS heat_map_aggregates (
  id           BIGSERIAL PRIMARY KEY,
  date         DATE NOT NULL,
  sector_tag   TEXT,
  company      TEXT,
  signal_type  TEXT,
  count        INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'heat_map_unique') THEN
    ALTER TABLE heat_map_aggregates
      ADD CONSTRAINT heat_map_unique UNIQUE (date, sector_tag, company, signal_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_heat_map_date ON heat_map_aggregates(date DESC);

-- ============================================================================
-- 9. recommendations (parked, schema only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS recommendations (
  id                     BIGSERIAL PRIMARY KEY,
  company                TEXT NOT NULL,
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggering_signal_ids  TEXT,
  initiatives_covered    TEXT,
  recommendation_text    JSONB NOT NULL,
  model_state_hash       TEXT,
  superseded_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recommendations_company ON recommendations(company);
CREATE INDEX IF NOT EXISTS idx_recommendations_active  ON recommendations(company) WHERE superseded_at IS NULL;
