-- 009_contact_extensions.sql
-- Extends PG contacts table with columns to preserve Datasette source data
-- on the way in. Also extends companies.sector CHECK to allow 'unknown' so
-- auto-created companies (Datasette company names not yet in PG) can land
-- without fabricating a sector classification.
--
-- Schema effect: v8.0 → v8.1. Additive.
--
-- Idempotent. Safe to re-run.

-- ============================================================================
-- 1. companies.sector — allow 'unknown' for Datasette auto-imports
-- ============================================================================
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_sector_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_sector_check
  CHECK (sector IN ('energy','mobility','both','unknown'));

-- ============================================================================
-- 2. contacts — preserve Datasette source columns
-- ============================================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS datasette_contact_id  TEXT,
  ADD COLUMN IF NOT EXISTS datasette_entity_id   TEXT,
  ADD COLUMN IF NOT EXISTS datasette_persona_id  TEXT,
  ADD COLUMN IF NOT EXISTS original_company_name TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url          TEXT,
  ADD COLUMN IF NOT EXISTS dept                  TEXT,
  ADD COLUMN IF NOT EXISTS seniority             TEXT,
  ADD COLUMN IF NOT EXISTS tier                  INTEGER,
  ADD COLUMN IF NOT EXISTS hq_location           TEXT,
  ADD COLUMN IF NOT EXISTS comm_style            TEXT,
  ADD COLUMN IF NOT EXISTS content_depth         TEXT,
  ADD COLUMN IF NOT EXISTS tech_interests        JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS strategies            JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS signal_types          JSONB DEFAULT '[]'::jsonb;

-- Unique on the Datasette PK so we can also dedupe by source id (in addition
-- to the existing UNIQUE (email)).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_contacts_datasette_id'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX idx_contacts_datasette_id ON contacts(datasette_contact_id) WHERE datasette_contact_id IS NOT NULL';
  END IF;
END $$;

-- B-tree on company_id (already had partial idx_contacts_company; this one
-- is plain so it covers all queries that filter just by company).
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_seniority  ON contacts(seniority);

-- ============================================================================
-- 3. schema_migrations
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (9, 'contact_extensions', NOW())
ON CONFLICT (version) DO NOTHING;
