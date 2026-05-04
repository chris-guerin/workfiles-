-- 007_state_and_trajectory.sql
-- Adds state, trajectory, last_state_change_date columns to v2 entities
-- so the v2 catalogue can carry trajectory-style signal that v1 had on
-- entities and v2 lost in migration 006.
--
-- Schema effect: v7.0 → v7.1. Additive — all columns nullable.
--
-- Idempotent. Safe to re-run. No BEGIN/COMMIT here — runner manages the transaction.

-- ============================================================================
-- 1. initiatives_v2 — state + trajectory + last_state_change_date
-- ============================================================================
ALTER TABLE initiatives_v2
  ADD COLUMN IF NOT EXISTS state                   TEXT,
  ADD COLUMN IF NOT EXISTS trajectory              TEXT,
  ADD COLUMN IF NOT EXISTS last_state_change_date  DATE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'initiatives_v2_state_enum') THEN
    ALTER TABLE initiatives_v2
      ADD CONSTRAINT initiatives_v2_state_enum
      CHECK (state IS NULL OR state IN ('holding','strengthening','weakening','broken','ambiguous','new'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'initiatives_v2_trajectory_enum') THEN
    ALTER TABLE initiatives_v2
      ADD CONSTRAINT initiatives_v2_trajectory_enum
      CHECK (trajectory IS NULL OR trajectory IN ('improving','stable','deteriorating','volatile','unknown'));
  END IF;
END $$;

-- ============================================================================
-- 2. components — state + trajectory
-- ============================================================================
ALTER TABLE components
  ADD COLUMN IF NOT EXISTS state       TEXT,
  ADD COLUMN IF NOT EXISTS trajectory  TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'components_state_enum') THEN
    ALTER TABLE components
      ADD CONSTRAINT components_state_enum
      CHECK (state IS NULL OR state IN ('holding','strengthening','weakening','broken','ambiguous','new'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'components_trajectory_enum') THEN
    ALTER TABLE components
      ADD CONSTRAINT components_trajectory_enum
      CHECK (trajectory IS NULL OR trajectory IN ('improving','stable','deteriorating','volatile','unknown'));
  END IF;
END $$;

-- ============================================================================
-- 3. schema_migrations ledger
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (7, 'state_and_trajectory', NOW())
ON CONFLICT (version) DO NOTHING;
