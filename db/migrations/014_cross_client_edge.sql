-- 014_cross_client_edge.sql
-- Methodology v1.3 — denormalised is_cross_client_edge on
-- pair_adjacencies.
--
-- Schema effect: v10.1 -> v10.2. Additive — single column on existing
-- table plus two triggers that maintain it.
--
-- Rationale: batch 2 end-of-run report identified the analyst need to
-- surface "structural connections across the portfolio" without
-- recomputing the (pair_adjacencies + component_pair_links + components
-- + initiatives_v2 + companies) join each time. is_cross_client_edge
-- denormalises whether source_pair_id and target_pair_id are touched
-- by *different* companies via component_pair_links.
--
-- Two triggers:
--   1. ON pair_adjacencies INSERT/UPDATE: recompute the flag for
--      the row.
--   2. ON component_pair_links INSERT/UPDATE/DELETE: recompute the
--      flag for ALL adjacency rows whose source_pair_id OR
--      target_pair_id matches the changed component's pair_id —
--      so a new client linking to an existing pair retroactively
--      marks its adjacency edges as cross-client.
--
-- Default FALSE if either pair has no component_pair_links yet —
-- the flag becomes TRUE only when both pairs are linked AND the
-- companies sets are not equal (or there's at least one company in
-- one set not in the other).
--
-- Idempotent. Runner manages the transaction.

-- ============================================================================
-- 1. Add column
-- ============================================================================
ALTER TABLE pair_adjacencies
  ADD COLUMN IF NOT EXISTS is_cross_client_edge BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_adjacency_cross_client
  ON pair_adjacencies(is_cross_client_edge)
  WHERE is_cross_client_edge = TRUE;

-- ============================================================================
-- 2. Helper function: compute cross_client for one adjacency row
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_adjacency_cross_client(p_source INTEGER, p_target INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  src_companies INTEGER[];
  tgt_companies INTEGER[];
BEGIN
  -- companies touching source pair
  SELECT array_agg(DISTINCT i.company_id)
    INTO src_companies
  FROM component_pair_links cpl
  JOIN components c ON c.id = cpl.component_id
  JOIN initiatives_v2 i ON i.id = c.initiative_id
  WHERE cpl.pair_id = p_source;

  -- companies touching target pair
  SELECT array_agg(DISTINCT i.company_id)
    INTO tgt_companies
  FROM component_pair_links cpl
  JOIN components c ON c.id = cpl.component_id
  JOIN initiatives_v2 i ON i.id = c.initiative_id
  WHERE cpl.pair_id = p_target;

  -- If either set is empty, edge is not cross-client (yet)
  IF src_companies IS NULL OR tgt_companies IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Cross-client if there's at least one company in src not in tgt,
  -- OR at least one company in tgt not in src (i.e. sets differ).
  -- Equivalently: union > intersection.
  IF EXISTS (
    SELECT 1 FROM unnest(src_companies) AS s WHERE s != ALL(tgt_companies)
  ) OR EXISTS (
    SELECT 1 FROM unnest(tgt_companies) AS t WHERE t != ALL(src_companies)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Trigger function on pair_adjacencies (INSERT/UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION recompute_adjacency_cross_client_self()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_cross_client_edge := compute_adjacency_cross_client(NEW.source_pair_id, NEW.target_pair_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pair_adjacency_before_ins_upd ON pair_adjacencies;
CREATE TRIGGER trg_pair_adjacency_before_ins_upd
BEFORE INSERT OR UPDATE OF source_pair_id, target_pair_id ON pair_adjacencies
FOR EACH ROW
EXECUTE FUNCTION recompute_adjacency_cross_client_self();

-- ============================================================================
-- 4. Trigger function on component_pair_links — recompute affected
-- adjacency rows when a link is created/deleted/updated
-- ============================================================================
CREATE OR REPLACE FUNCTION recompute_adjacency_cross_client_on_link_change()
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

  -- Recompute every adjacency row whose source_pair_id or target_pair_id
  -- is in affected_pair_ids.
  UPDATE pair_adjacencies pa
  SET is_cross_client_edge = compute_adjacency_cross_client(pa.source_pair_id, pa.target_pair_id)
  WHERE pa.source_pair_id = ANY(affected_pair_ids)
     OR pa.target_pair_id = ANY(affected_pair_ids);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cpl_after_ins_upd_del_recompute_adj ON component_pair_links;
CREATE TRIGGER trg_cpl_after_ins_upd_del_recompute_adj
AFTER INSERT OR UPDATE OR DELETE ON component_pair_links
FOR EACH ROW
EXECUTE FUNCTION recompute_adjacency_cross_client_on_link_change();

-- ============================================================================
-- 5. Back-fill — recompute is_cross_client_edge for every existing
-- pair_adjacencies row.
-- ============================================================================
UPDATE pair_adjacencies pa
SET is_cross_client_edge = compute_adjacency_cross_client(pa.source_pair_id, pa.target_pair_id);

-- ============================================================================
-- schema_migrations row
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (14, 'cross_client_edge_v10_2', NOW())
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, applied_at = EXCLUDED.applied_at;
