-- 015_signal_horizon_log.sql
-- Persistent log of 15a output, consumed by 15b. Replaces the
-- Signal_Pipeline_Queue Google Sheet handoff.
--
-- Schema effect: v10.2 -> v10.3. Additive — single table + 4 indexes.
--
-- Idempotent. Runner manages the transaction.

-- ============================================================================
-- 1. Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS signal_horizon_log (
  id                        SERIAL PRIMARY KEY,
  signal_id                 TEXT NOT NULL,
  signal_title              TEXT,
  signal_summary            TEXT,
  signal_date               DATE,
  source_url                TEXT,
  matched_hypothesis_ids    TEXT[],
  matched_hypothesis_labels TEXT[],
  horizon_classifications   JSONB,
  overall_classification    TEXT,
  probability_delta         NUMERIC,
  ontology_gap              BOOLEAN NOT NULL DEFAULT FALSE,
  processed_by_15b          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_shl_unprocessed
  ON signal_horizon_log(processed_by_15b)
  WHERE processed_by_15b = FALSE;

CREATE INDEX IF NOT EXISTS idx_shl_classification
  ON signal_horizon_log(overall_classification);

CREATE INDEX IF NOT EXISTS idx_shl_date
  ON signal_horizon_log(signal_date);

CREATE INDEX IF NOT EXISTS idx_shl_horizon
  ON signal_horizon_log USING GIN(horizon_classifications);

-- ============================================================================
-- schema_migrations row
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (15, 'signal_horizon_log_v10_3', NOW())
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, applied_at = EXCLUDED.applied_at;
