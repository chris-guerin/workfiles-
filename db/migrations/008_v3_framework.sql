-- 008_v3_framework.sql
-- v3 framework per /docs/SCHEMA_V3.md sections 3, 4, 5.
--
-- Schema effect: v7.1 → v8.0. Additive — v2 tables retain all data and
-- continue to work; v3 framework sits alongside.
--
-- This file covers Phase 1 of migration 008 only:
--   - new columns on existing v2 tables
--   - new tables for v3 framework + dependencies + observations
--     + signal pipeline state + contacts
--   - indexes
--   - schema_migrations row
--
-- The value-type-contract trigger lives in 008_phase2_contract.sql.
-- The data back-fill is a runtime script, not part of this migration.
--
-- Strict spec transcription. Per user prompt: do NOT add NOT NULL
-- constraints to existing claims_v2 columns nor the structured_threshold
-- CHECK at this stage — Phase 3 back-fill happens first, those become
-- enforceable later.
--
-- No BEGIN/COMMIT here — runner manages the transaction.

-- ============================================================================
-- 3.1 component_attributes — new columns
-- ============================================================================
ALTER TABLE component_attributes
  ADD COLUMN IF NOT EXISTS value_unit         TEXT,
  ADD COLUMN IF NOT EXISTS velocity_pct_yoy   NUMERIC,
  ADD COLUMN IF NOT EXISTS velocity_direction TEXT,
  ADD COLUMN IF NOT EXISTS as_of_date         DATE,
  ADD COLUMN IF NOT EXISTS reasoning_text     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'component_attributes_velocity_direction_check') THEN
    ALTER TABLE component_attributes
      ADD CONSTRAINT component_attributes_velocity_direction_check
      CHECK (velocity_direction IS NULL OR velocity_direction IN ('rising','falling','stable','volatile'));
  END IF;
END $$;

-- Extend value_status to allow 'pending_analyst_review' (Phase 3 back-fill
-- uses this when Haiku-parsing of v2 prose into v3 structured columns fails
-- and analyst review is required). Two CHECK constraints reference
-- value_status — the enum check and the partial-row enforcement check —
-- both must be replaced.
ALTER TABLE component_attributes DROP CONSTRAINT IF EXISTS component_attributes_value_status_check;
ALTER TABLE component_attributes DROP CONSTRAINT IF EXISTS component_attributes_check;
ALTER TABLE component_attributes DROP CONSTRAINT IF EXISTS component_attributes_partial_row_check;

ALTER TABLE component_attributes
  ADD CONSTRAINT component_attributes_value_status_check
  CHECK (value_status IN ('populated','not_in_source','not_applicable','pending','pending_analyst_review'));

-- Partial-row enforcement: pending_analyst_review behaves like pending
-- (no source_citation / reason required; preserves the original v2 prose
-- in value_text for analyst review).
ALTER TABLE component_attributes
  ADD CONSTRAINT component_attributes_partial_row_check
  CHECK (
    (value_status = 'populated'              AND source_citation       IS NOT NULL) OR
    (value_status = 'not_in_source'          AND not_in_source_reason  IS NOT NULL) OR
    (value_status = 'not_applicable'         AND not_applicable_reason IS NOT NULL) OR
    (value_status = 'pending')                                                      OR
    (value_status = 'pending_analyst_review')
  );

-- ============================================================================
-- 3.2 claims_v2 — threshold_direction (only). NOT NULL on existing
-- attribute_def_id and threshold_op intentionally deferred per user prompt;
-- structured_threshold CHECK also deferred (would fail on existing
-- prose-only claims).
-- ============================================================================
ALTER TABLE claims_v2
  ADD COLUMN IF NOT EXISTS threshold_direction TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_v2_threshold_direction_check') THEN
    ALTER TABLE claims_v2
      ADD CONSTRAINT claims_v2_threshold_direction_check
      CHECK (threshold_direction IS NULL OR threshold_direction IN (
        'toward_threshold_increases_confidence',
        'toward_threshold_decreases_confidence',
        'crossing_falsifies',
        'crossing_validates'
      ));
  END IF;
END $$;

-- ============================================================================
-- 3.3 Reasoning capture columns
-- ============================================================================
ALTER TABLE initiatives_v2
  ADD COLUMN IF NOT EXISTS state_reasoning      TEXT,
  ADD COLUMN IF NOT EXISTS trajectory_reasoning TEXT;

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS state_reasoning      TEXT,
  ADD COLUMN IF NOT EXISTS trajectory_reasoning TEXT;

ALTER TABLE claims_v2
  ADD COLUMN IF NOT EXISTS criticality_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS impact_reasoning      TEXT;

-- ============================================================================
-- 3.4 component_dependencies (new table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_dependencies (
  id                  SERIAL PRIMARY KEY,
  source_component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  target_component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  dependency_type     TEXT NOT NULL
    CHECK (dependency_type IN ('regulatory','supply','technology','market','commercial','political','geographic')),
  dependency_strength TEXT NOT NULL
    CHECK (dependency_strength IN ('critical','high','medium','low')),
  description         TEXT NOT NULL,
  source_citation     TEXT NOT NULL,
  draft_status        TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_component_id != target_component_id),
  UNIQUE (source_component_id, target_component_id, dependency_type)
);

CREATE INDEX IF NOT EXISTS idx_dep_source ON component_dependencies(source_component_id);
CREATE INDEX IF NOT EXISTS idx_dep_target ON component_dependencies(target_component_id);
CREATE INDEX IF NOT EXISTS idx_dep_type   ON component_dependencies(dependency_type);

-- ============================================================================
-- 3.5 tech_functions extension
-- ============================================================================
ALTER TABLE tech_functions
  ADD COLUMN IF NOT EXISTS current_trl              INTEGER,
  ADD COLUMN IF NOT EXISTS cost_trajectory_pct_yoy  NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_trajectory_unit     TEXT,
  ADD COLUMN IF NOT EXISTS as_of_date               DATE,
  ADD COLUMN IF NOT EXISTS substitution_risk        TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_functions_current_trl_check') THEN
    ALTER TABLE tech_functions
      ADD CONSTRAINT tech_functions_current_trl_check
      CHECK (current_trl IS NULL OR (current_trl BETWEEN 1 AND 9));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tech_functions_substitution_risk_check') THEN
    ALTER TABLE tech_functions
      ADD CONSTRAINT tech_functions_substitution_risk_check
      CHECK (substitution_risk IS NULL OR substitution_risk IN ('none','emerging','active','imminent'));
  END IF;
END $$;

-- ============================================================================
-- 4. mini_signals_v3
-- ============================================================================
CREATE TABLE IF NOT EXISTS mini_signals_v3 (
  id                              SERIAL PRIMARY KEY,
  source_news_id                  INTEGER REFERENCES news(id),
  signal_text                     TEXT NOT NULL,
  signal_type                     TEXT NOT NULL
    CHECK (signal_type IN ('announcement','decision','data_release','commitment',
                           'commentary','regulatory_change','financial_filing','other')),
  extracted_entities              JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_attribute_types       JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_values                JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_geographic_scope      JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_temporal_scope_start  DATE,
  extracted_temporal_scope_end    DATE,
  extracted_at                    TIMESTAMPTZ NOT NULL,
  extraction_confidence           NUMERIC(4,3),
  extraction_model                TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
  source_url                      TEXT,
  pub_date                        DATE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mini_signals_v3_extraction_confidence_check') THEN
    ALTER TABLE mini_signals_v3
      ADD CONSTRAINT mini_signals_v3_extraction_confidence_check
      CHECK (extraction_confidence IS NULL OR (extraction_confidence BETWEEN 0 AND 1));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_signal_entities_gin     ON mini_signals_v3 USING GIN (extracted_entities);
CREATE INDEX IF NOT EXISTS idx_signal_attr_types_gin   ON mini_signals_v3 USING GIN (extracted_attribute_types);
CREATE INDEX IF NOT EXISTS idx_signal_geo_gin          ON mini_signals_v3 USING GIN (extracted_geographic_scope);
CREATE INDEX IF NOT EXISTS idx_signal_pub_date         ON mini_signals_v3 (pub_date);
CREATE INDEX IF NOT EXISTS idx_signal_signal_type      ON mini_signals_v3 (signal_type);

-- ============================================================================
-- 4.2 catalogue_names (matching support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS catalogue_names (
  id              SERIAL PRIMARY KEY,
  entity_name     TEXT NOT NULL,
  entity_type     TEXT NOT NULL
    CHECK (entity_type IN ('component','tech_function','company','initiative','regulation','project','partner')),
  reference_id    INTEGER NOT NULL,
  reference_table TEXT NOT NULL,
  aliases         TEXT[] DEFAULT '{}'::text[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_names_entity      ON catalogue_names(entity_name);
CREATE INDEX IF NOT EXISTS idx_names_aliases_gin ON catalogue_names USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_names_lower       ON catalogue_names(LOWER(entity_name));

-- ============================================================================
-- 5.1 signal_candidate_matches
-- ============================================================================
CREATE TABLE IF NOT EXISTS signal_candidate_matches (
  id               SERIAL PRIMARY KEY,
  mini_signal_id   INTEGER NOT NULL REFERENCES mini_signals_v3(id) ON DELETE CASCADE,
  component_id     INTEGER REFERENCES components(id) ON DELETE CASCADE,
  tech_function_id INTEGER REFERENCES tech_functions(id) ON DELETE CASCADE,
  match_method     TEXT NOT NULL
    CHECK (match_method IN ('direct_name','attribute_reference','tech_function','dependency_chain','geographic_overlap')),
  match_strength   NUMERIC(4,3) NOT NULL CHECK (match_strength BETWEEN 0 AND 1),
  match_basis_text TEXT NOT NULL,
  matched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (component_id IS NOT NULL OR tech_function_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_match_signal    ON signal_candidate_matches(mini_signal_id);
CREATE INDEX IF NOT EXISTS idx_match_component ON signal_candidate_matches(component_id);
CREATE INDEX IF NOT EXISTS idx_match_method    ON signal_candidate_matches(match_method);

-- ============================================================================
-- 5.2 signal_claim_impacts
-- ============================================================================
CREATE TABLE IF NOT EXISTS signal_claim_impacts (
  id                    SERIAL PRIMARY KEY,
  mini_signal_id        INTEGER NOT NULL REFERENCES mini_signals_v3(id) ON DELETE CASCADE,
  candidate_match_id    INTEGER NOT NULL REFERENCES signal_candidate_matches(id) ON DELETE CASCADE,
  claim_id              INTEGER NOT NULL REFERENCES claims_v2(id) ON DELETE CASCADE,
  impact_direction      TEXT NOT NULL
    CHECK (impact_direction IN ('toward_threshold','away_from_threshold','crossed_threshold','no_change')),
  impact_magnitude      NUMERIC(4,3) NOT NULL CHECK (impact_magnitude BETWEEN 0 AND 1),
  proximity_before      NUMERIC(4,3),
  proximity_after       NUMERIC(4,3),
  is_material           BOOLEAN NOT NULL,
  reasoning_text        TEXT NOT NULL,
  assessment_model      TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  assessed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessment_confidence NUMERIC(4,3)
);

CREATE INDEX IF NOT EXISTS idx_impact_signal   ON signal_claim_impacts(mini_signal_id);
CREATE INDEX IF NOT EXISTS idx_impact_claim    ON signal_claim_impacts(claim_id);
CREATE INDEX IF NOT EXISTS idx_impact_material ON signal_claim_impacts(is_material) WHERE is_material = true;

-- ============================================================================
-- 5.3 attribute_observations (PARTITIONED BY RANGE on observed_at)
-- ============================================================================
CREATE TABLE IF NOT EXISTS attribute_observations (
  id               SERIAL,
  component_id     INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  attribute_def_id INTEGER NOT NULL REFERENCES attribute_definitions(id),
  value_numeric    NUMERIC,
  value_text       TEXT,
  value_unit       TEXT,
  observed_at      TIMESTAMPTZ NOT NULL,
  source_signal_id INTEGER REFERENCES mini_signals_v3(id),
  source_url       TEXT,
  confidence_band  TEXT CHECK (confidence_band IN ('high','medium','low')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, observed_at)
) PARTITION BY RANGE (observed_at);

-- 5 quarterly partitions covering 2026-Q2 through 2027-Q2 (12-month forward window)
CREATE TABLE IF NOT EXISTS attribute_observations_2026q2 PARTITION OF attribute_observations
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS attribute_observations_2026q3 PARTITION OF attribute_observations
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS attribute_observations_2026q4 PARTITION OF attribute_observations
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS attribute_observations_2027q1 PARTITION OF attribute_observations
  FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS attribute_observations_2027q2 PARTITION OF attribute_observations
  FOR VALUES FROM ('2027-04-01') TO ('2027-07-01');

CREATE INDEX IF NOT EXISTS idx_obs_component ON attribute_observations(component_id, attribute_def_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_signal    ON attribute_observations(source_signal_id);

-- ============================================================================
-- 5.6 contacts (referenced by emails) — declared before generated_signals so
-- emails FK can resolve. Existing 27,473 Datasette contacts not yet imported;
-- table sits empty awaiting Phase 3+ population.
-- ============================================================================
CREATE TABLE IF NOT EXISTS contacts (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER REFERENCES companies(id),
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  role_title          TEXT,
  responsibility_area TEXT,
  persona_match       TEXT,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  imported_from       TEXT,
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_persona_match_check') THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_persona_match_check
      CHECK (persona_match IS NULL OR persona_match IN ('operations','strategy','board'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contact_initiative_interests (
  contact_id        INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  initiative_id     INTEGER NOT NULL REFERENCES initiatives_v2(id) ON DELETE CASCADE,
  interest_strength TEXT NOT NULL CHECK (interest_strength IN ('primary','secondary','watching')),
  PRIMARY KEY (contact_id, initiative_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_company   ON contacts(company_id, active);
CREATE INDEX IF NOT EXISTS idx_contacts_persona   ON contacts(persona_match);
CREATE INDEX IF NOT EXISTS idx_cii_initiative     ON contact_initiative_interests(initiative_id);

-- ============================================================================
-- 5.4 generated_signals
-- ============================================================================
CREATE TABLE IF NOT EXISTS generated_signals (
  id                  SERIAL PRIMARY KEY,
  mini_signal_id      INTEGER NOT NULL REFERENCES mini_signals_v3(id) ON DELETE CASCADE,
  claim_impact_id     INTEGER NOT NULL REFERENCES signal_claim_impacts(id),
  initiative_id       INTEGER NOT NULL REFERENCES initiatives_v2(id),
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  severity            TEXT NOT NULL CHECK (severity IN ('alert','brief','watch')),
  persona_target      TEXT NOT NULL CHECK (persona_target IN ('operations','strategy','board')),
  framing_text        TEXT NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','reviewed','sent','suppressed')),
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  suppression_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_gensig_company  ON generated_signals(company_id, status);
CREATE INDEX IF NOT EXISTS idx_gensig_persona  ON generated_signals(persona_target);
CREATE INDEX IF NOT EXISTS idx_gensig_status   ON generated_signals(status, generated_at);

-- ============================================================================
-- 5.5 generated_emails
-- ============================================================================
CREATE TABLE IF NOT EXISTS generated_emails (
  id               SERIAL PRIMARY KEY,
  signal_id        INTEGER NOT NULL REFERENCES generated_signals(id) ON DELETE CASCADE,
  contact_id       INTEGER NOT NULL REFERENCES contacts(id),
  email_subject    TEXT NOT NULL,
  email_body       TEXT NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generation_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','reviewed','sent','suppressed','bounced')),
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  delivery_method  TEXT,
  UNIQUE (signal_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_email_status  ON generated_emails(status, generated_at);
CREATE INDEX IF NOT EXISTS idx_email_contact ON generated_emails(contact_id);

-- ============================================================================
-- schema_migrations row v8
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (8, 'v3_framework', NOW())
ON CONFLICT (version) DO NOTHING;
