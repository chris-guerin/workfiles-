-- 016_mini_signals.sql
-- Persistent store for Haiku extraction output. Replaces the Mini_Signals
-- Google Sheet handoff between WF-WeeklyNews-PG (Sunday 11pm) and Signal
-- Pipeline 15a (Monday 6am).
--
-- Schema effect: v10.3 -> v10.4. NOT additive — drops a pre-existing
-- legacy mini_signals table (3 LEG-* test rows from 2026-05-02) and
-- the FK constraint signals.source_mini_signal_id references it.
-- User-authorised destructive action: the 3 rows were test data and
-- the signals table is itself legacy substrate.
--
-- Idempotent. Runner manages the transaction.

-- ============================================================================
-- 0. Drop pre-existing legacy mini_signals (CASCADE drops dependent FK
--    on signals.source_mini_signal_id; the column itself remains).
-- ============================================================================
DROP TABLE IF EXISTS mini_signals CASCADE;

-- ============================================================================
-- 1. Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS mini_signals (
  id              SERIAL PRIMARY KEY,
  signal_id       TEXT NOT NULL,
  extracted_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  published_date  DATE,
  source          TEXT,
  source_type     TEXT,
  url             TEXT,
  headline        TEXT,
  companies       TEXT,
  technologies    TEXT,
  geography       TEXT,
  event_type      TEXT,
  value_chain_position TEXT,
  short_summary   TEXT,
  evidence_snippet TEXT,
  extraction_model TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ms_extracted ON mini_signals(extracted_at);
CREATE INDEX IF NOT EXISTS idx_ms_signal_id ON mini_signals(signal_id);

-- ============================================================================
-- schema_migrations row
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (16, 'mini_signals_v10_4', NOW())
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, applied_at = EXCLUDED.applied_at;
