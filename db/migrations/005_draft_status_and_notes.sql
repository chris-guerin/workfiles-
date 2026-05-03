-- 005_draft_status_and_notes.sql
-- Adds draft_status to initiatives/entities/links plus a notes column
-- on initiatives for baseline_confidence reasoning + scoping commentary
-- per /docs/INITIATIVE_METHODOLOGY.md.
--
-- Schema effect: v6.0 → v6.1. Additive only.
--
-- draft_status enum:
--   'draft_unreviewed'  — first-pass population, all step-10 criteria passed
--   'draft_incomplete'  — first-pass population, one or more criteria flagged
--   'reviewed'          — analyst-reviewed and approved
--   'live'              — in production signal flow (default)
--
-- Default 'live' so future rows that don't specify behave as production by
-- default. Population scripts insert with 'draft_unreviewed' or
-- 'draft_incomplete' explicitly.
--
-- Idempotent. Safe to re-run. No BEGIN/COMMIT here — runner manages the transaction.

-- ============================================================================
-- 1. initiatives — add notes + draft_status
-- ============================================================================

ALTER TABLE initiatives
  ADD COLUMN IF NOT EXISTS notes        TEXT,
  ADD COLUMN IF NOT EXISTS draft_status TEXT NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'initiatives_draft_status_enum') THEN
    ALTER TABLE initiatives
      ADD CONSTRAINT initiatives_draft_status_enum
      CHECK (draft_status IN ('draft_unreviewed','draft_incomplete','reviewed','live'));
  END IF;
END $$;

-- ============================================================================
-- 2. entities — add draft_status
-- ============================================================================

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS draft_status TEXT NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entities_draft_status_enum') THEN
    ALTER TABLE entities
      ADD CONSTRAINT entities_draft_status_enum
      CHECK (draft_status IN ('draft_unreviewed','draft_incomplete','reviewed','live'));
  END IF;
END $$;

-- ============================================================================
-- 3. links — add draft_status
-- ============================================================================

ALTER TABLE links
  ADD COLUMN IF NOT EXISTS draft_status TEXT NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'links_draft_status_enum') THEN
    ALTER TABLE links
      ADD CONSTRAINT links_draft_status_enum
      CHECK (draft_status IN ('draft_unreviewed','draft_incomplete','reviewed','live'));
  END IF;
END $$;
