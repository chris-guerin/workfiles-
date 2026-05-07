-- 017_schema_separation.sql
-- Reorganise the PostgreSQL database into four named schemas.
--
-- Any fresh Claude instance can understand this database by reading
-- the schema names: pipeline = data in flight, ontology = technology
-- knowledge, catalogue = client intelligence, contacts = CRM. public
-- is empty by design.
--
-- Schema effect: v10.4 -> v10.5. Reorganisational only — no rows moved,
-- no columns altered, no FKs broken (PG rewrites FK constraint targets
-- when ALTER TABLE ... SET SCHEMA runs).
--
-- Idempotent: every ALTER TABLE wrapped in a DO block that no-ops if
-- the table already lives in the target schema. Runner manages the
-- transaction.

-- ============================================================================
-- 1. Schemas
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS pipeline;
CREATE SCHEMA IF NOT EXISTS ontology;
CREATE SCHEMA IF NOT EXISTS catalogue;
CREATE SCHEMA IF NOT EXISTS contacts;

-- Helper: idempotent move. Skips if the table already lives in target.
CREATE OR REPLACE FUNCTION pg_temp.move_table(p_table TEXT, p_target TEXT)
RETURNS VOID AS $$
DECLARE
  current_schema_name TEXT;
BEGIN
  SELECT n.nspname INTO current_schema_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = p_table
    AND n.nspname IN ('public','pipeline','ontology','catalogue','contacts');
  IF current_schema_name IS NULL THEN
    RAISE NOTICE 'skip: table % not found in any tracked schema', p_table;
    RETURN;
  END IF;
  IF current_schema_name = p_target THEN
    RAISE NOTICE 'skip: table % already in %', p_table, p_target;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE %I.%I SET SCHEMA %I', current_schema_name, p_table, p_target);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. PIPELINE — data in flight (signal ingest, classification, output)
-- ============================================================================
SELECT pg_temp.move_table('news',                          'pipeline');
SELECT pg_temp.move_table('mini_signals',                  'pipeline');
SELECT pg_temp.move_table('mini_signals_v3',               'pipeline');
SELECT pg_temp.move_table('signal_horizon_log',            'pipeline');
SELECT pg_temp.move_table('signal_candidate_matches',      'pipeline');
SELECT pg_temp.move_table('signal_claim_impacts',          'pipeline');
SELECT pg_temp.move_table('signal_soft_impacts',           'pipeline');
SELECT pg_temp.move_table('generated_signals',             'pipeline');
SELECT pg_temp.move_table('generated_emails',              'pipeline');
SELECT pg_temp.move_table('catalogue_names',               'pipeline');  -- name index for matching
SELECT pg_temp.move_table('recommendations',               'pipeline');  -- pipeline output (currently empty)
SELECT pg_temp.move_table('schema_migrations',             'pipeline');  -- meta — flagged in run report

-- attribute_observations is a partitioned table. PG requires each partition
-- to be moved separately; the parent's SET SCHEMA does not cascade.
SELECT pg_temp.move_table('attribute_observations',          'pipeline');
SELECT pg_temp.move_table('attribute_observations_2026q2',   'pipeline');
SELECT pg_temp.move_table('attribute_observations_2026q3',   'pipeline');
SELECT pg_temp.move_table('attribute_observations_2026q4',   'pipeline');
SELECT pg_temp.move_table('attribute_observations_2027q1',   'pipeline');
SELECT pg_temp.move_table('attribute_observations_2027q2',   'pipeline');

-- ============================================================================
-- 3. ONTOLOGY — technology knowledge layer (cross-client compounding asset)
-- ============================================================================
SELECT pg_temp.move_table('technologies',                  'ontology');
SELECT pg_temp.move_table('applications',                  'ontology');
SELECT pg_temp.move_table('technology_application_pairs',  'ontology');
SELECT pg_temp.move_table('pair_evidence',                 'ontology');
SELECT pg_temp.move_table('pair_adjacencies',              'ontology');
SELECT pg_temp.move_table('component_pair_links',          'ontology');  -- bridge → ontology per spec
SELECT pg_temp.move_table('tech_functions',                'ontology');  -- physical-principle vocab

-- ============================================================================
-- 4. CATALOGUE — client intelligence (initiatives, components, hypotheses)
-- ============================================================================
SELECT pg_temp.move_table('companies',                     'catalogue');
SELECT pg_temp.move_table('initiatives_v2',                'catalogue');
SELECT pg_temp.move_table('components',                    'catalogue');
SELECT pg_temp.move_table('component_attributes',          'catalogue');
SELECT pg_temp.move_table('claims_v2',                     'catalogue');
SELECT pg_temp.move_table('component_dependencies',        'catalogue');
SELECT pg_temp.move_table('attribute_definitions',         'catalogue');  -- vocab for component_attributes
SELECT pg_temp.move_table('initiative_assumptions',        'catalogue');
SELECT pg_temp.move_table('strategic_tensions',            'catalogue');
SELECT pg_temp.move_table('tension_affected_initiatives',  'catalogue');
SELECT pg_temp.move_table('tension_affected_components',   'catalogue');
SELECT pg_temp.move_table('tension_evidence',              'catalogue');
SELECT pg_temp.move_table('reframings',                    'catalogue');
SELECT pg_temp.move_table('reframing_evidence',            'catalogue');

-- Legacy v1 / observable-layer / hypothesis-register tables — retained,
-- moved to catalogue so public is empty:
SELECT pg_temp.move_table('initiatives',                   'catalogue');
SELECT pg_temp.move_table('entities',                      'catalogue');
SELECT pg_temp.move_table('links',                         'catalogue');
SELECT pg_temp.move_table('signals',                       'catalogue');
SELECT pg_temp.move_table('hypothesis_register',           'catalogue');
SELECT pg_temp.move_table('hypothesis_observable',         'catalogue');
SELECT pg_temp.move_table('hypothesis_observable_event',   'catalogue');
SELECT pg_temp.move_table('confidence_band_history',       'catalogue');
SELECT pg_temp.move_table('heat_map_aggregates',           'catalogue');
SELECT pg_temp.move_table('competitive_events',            'catalogue');

-- ============================================================================
-- 5. CONTACTS — CRM data
-- ============================================================================
SELECT pg_temp.move_table('contacts',                      'contacts');
SELECT pg_temp.move_table('contact_initiative_interests',  'contacts');

-- ============================================================================
-- 6. search_path so unprefixed queries resolve under all four schemas
-- ============================================================================
ALTER DATABASE railway
  SET search_path = pipeline, ontology, catalogue, contacts, public;

ALTER ROLE CURRENT_USER
  SET search_path = pipeline, ontology, catalogue, contacts, public;

-- Apply to current session so verification queries downstream of this
-- migration in the same connection resolve unprefixed names. Future
-- connections pick up the ALTER DATABASE / ALTER ROLE settings automatically.
SET search_path = pipeline, ontology, catalogue, contacts, public;

-- ============================================================================
-- schema_migrations row (now lives in pipeline.schema_migrations after moves)
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (17, 'schema_separation_v10_5', NOW())
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, applied_at = EXCLUDED.applied_at;
