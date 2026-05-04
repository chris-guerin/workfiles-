-- 013_hard_evidence_count.sql
-- Methodology v1.2 — denormalised hard_evidence_count on
-- technology_application_pairs.
--
-- Schema effect: v10.0 -> v10.1. Additive — single column on existing
-- table plus a trigger that maintains it.
--
-- Rationale: medium confidence is a wide band (per Phase 5 batch 1 report).
-- Some medium pairs sit at 0 hard-evidence rows; others sit at 2. The schema
-- needs to surface the difference without changing the confidence_band
-- vocabulary (still high/medium/low). hard_evidence_count makes the
-- "medium with hard_evidence_count >= 2" partition queryable.
--
-- "Hard evidence" definition (per procedure v1.1):
--   evidence_type IN ('peer_reviewed','company_filing','government_data')
--   OR (evidence_type = 'operator_disclosure' AND evidence_strength = 'high')
--
-- Idempotent. Runner manages the transaction.

-- ============================================================================
-- 1. Add column
-- ============================================================================
ALTER TABLE technology_application_pairs
  ADD COLUMN IF NOT EXISTS hard_evidence_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pair_hard_evidence_count
  ON technology_application_pairs(hard_evidence_count);

-- ============================================================================
-- 2. Trigger function: recompute hard_evidence_count for affected pair_id(s)
-- ============================================================================
CREATE OR REPLACE FUNCTION recompute_pair_hard_evidence_count()
RETURNS TRIGGER AS $$
DECLARE
  affected_pair_ids INTEGER[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_pair_ids := ARRAY[OLD.pair_id];
  ELSIF TG_OP = 'UPDATE' THEN
    affected_pair_ids := ARRAY[OLD.pair_id, NEW.pair_id];
  ELSE
    affected_pair_ids := ARRAY[NEW.pair_id];
  END IF;

  UPDATE technology_application_pairs tap
  SET hard_evidence_count = (
    SELECT COUNT(*)::INTEGER
    FROM pair_evidence pe
    WHERE pe.pair_id = tap.id
      AND (
        pe.evidence_type IN ('peer_reviewed','company_filing','government_data')
        OR (pe.evidence_type = 'operator_disclosure' AND pe.evidence_strength = 'high')
      )
  )
  WHERE tap.id = ANY(affected_pair_ids);

  RETURN NULL;  -- AFTER trigger
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Triggers on pair_evidence (INSERT, UPDATE, DELETE)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_pair_evidence_after_ins_upd_del ON pair_evidence;
CREATE TRIGGER trg_pair_evidence_after_ins_upd_del
AFTER INSERT OR UPDATE OR DELETE ON pair_evidence
FOR EACH ROW
EXECUTE FUNCTION recompute_pair_hard_evidence_count();

-- ============================================================================
-- 4. Back-fill existing pairs (one-shot — runs at migration apply time)
-- ============================================================================
UPDATE technology_application_pairs tap
SET hard_evidence_count = (
  SELECT COUNT(*)::INTEGER
  FROM pair_evidence pe
  WHERE pe.pair_id = tap.id
    AND (
      pe.evidence_type IN ('peer_reviewed','company_filing','government_data')
      OR (pe.evidence_type = 'operator_disclosure' AND pe.evidence_strength = 'high')
    )
);

-- ============================================================================
-- schema_migrations row
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (13, 'hard_evidence_count_v10_1', NOW())
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, applied_at = EXCLUDED.applied_at;
