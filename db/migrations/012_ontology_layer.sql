-- 012_ontology_layer.sql
-- Technology × application ontology layer per /docs/SCHEMA_ONTOLOGY.md.
--
-- Schema effect: v9.0 -> v10.0. Additive — no existing v3 tables modified.
--
-- 6 new tables: technologies, applications, technology_application_pairs,
-- pair_evidence, pair_adjacencies, component_pair_links.
--
-- Idempotent. Runner manages the transaction.

-- ============================================================================
-- 3.1 technologies
-- ============================================================================
CREATE TABLE IF NOT EXISTS technologies (
  id                       SERIAL PRIMARY KEY,
  technology_name          TEXT NOT NULL UNIQUE,
  technology_label         TEXT NOT NULL,
  tech_function_id         INTEGER REFERENCES tech_functions(id) ON DELETE SET NULL,
  description              TEXT NOT NULL,
  current_trl              INTEGER CHECK (current_trl IS NULL OR current_trl BETWEEN 1 AND 9),
  trl_as_of_date           DATE,
  cost_trajectory_pct_yoy  NUMERIC,
  cost_trajectory_unit     TEXT,
  substitution_risk        TEXT
    CHECK (substitution_risk IS NULL OR substitution_risk IN ('none','emerging','active','imminent')),
  source_citation          TEXT NOT NULL,
  draft_status             TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technology_function ON technologies(tech_function_id);
CREATE INDEX IF NOT EXISTS idx_technology_trl      ON technologies(current_trl) WHERE current_trl IS NOT NULL;

-- ============================================================================
-- 3.2 applications
-- ============================================================================
CREATE TABLE IF NOT EXISTS applications (
  id                       SERIAL PRIMARY KEY,
  application_name         TEXT NOT NULL UNIQUE,
  application_label        TEXT NOT NULL,
  application_domain       TEXT NOT NULL
    CHECK (application_domain IN ('industrial','power','transport','built_environment','agricultural','data_centre','consumer','financial','cross_domain')),
  description              TEXT NOT NULL,
  market_maturity          TEXT
    CHECK (market_maturity IS NULL OR market_maturity IN ('frontier','emerging','growing','mature','declining')),
  source_citation          TEXT NOT NULL,
  draft_status             TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_domain   ON applications(application_domain);
CREATE INDEX IF NOT EXISTS idx_application_maturity ON applications(market_maturity) WHERE market_maturity IS NOT NULL;

-- ============================================================================
-- 3.3 technology_application_pairs
-- ============================================================================
CREATE TABLE IF NOT EXISTS technology_application_pairs (
  id                       SERIAL PRIMARY KEY,
  technology_id            INTEGER NOT NULL REFERENCES technologies(id) ON DELETE CASCADE,
  application_id           INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  pair_label               TEXT NOT NULL,
  horizon                  TEXT NOT NULL CHECK (horizon IN ('H1','H2','H3')),
  horizon_reasoning        TEXT NOT NULL,
  confidence_band          TEXT NOT NULL CHECK (confidence_band IN ('high','medium','low')),
  confidence_reasoning     TEXT NOT NULL,
  trajectory               TEXT NOT NULL
    CHECK (trajectory IN ('improving','holding','weakening','volatile','unknown')),
  trajectory_reasoning     TEXT,
  is_flagged_for_review    BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason              TEXT,
  last_reclassified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  draft_status             TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (technology_id, application_id),
  CHECK (
    confidence_band <> 'low' OR (is_flagged_for_review = TRUE AND flag_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pair_horizon     ON technology_application_pairs(horizon);
CREATE INDEX IF NOT EXISTS idx_pair_confidence  ON technology_application_pairs(confidence_band);
CREATE INDEX IF NOT EXISTS idx_pair_trajectory  ON technology_application_pairs(trajectory);
CREATE INDEX IF NOT EXISTS idx_pair_flagged     ON technology_application_pairs(is_flagged_for_review)
  WHERE is_flagged_for_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_pair_technology  ON technology_application_pairs(technology_id);
CREATE INDEX IF NOT EXISTS idx_pair_application ON technology_application_pairs(application_id);

-- ============================================================================
-- 3.4 pair_evidence
-- ============================================================================
CREATE TABLE IF NOT EXISTS pair_evidence (
  id                       SERIAL PRIMARY KEY,
  pair_id                  INTEGER NOT NULL REFERENCES technology_application_pairs(id) ON DELETE CASCADE,
  evidence_type            TEXT NOT NULL
    CHECK (evidence_type IN ('peer_reviewed','company_filing','analyst_report','government_data',
                             'industry_body','news','operator_disclosure','other')),
  evidence_strength        TEXT NOT NULL CHECK (evidence_strength IN ('high','medium','low')),
  evidence_text            TEXT NOT NULL,
  source_citation          TEXT NOT NULL,
  source_url               TEXT,
  publication_date         DATE,
  supports_horizon         TEXT CHECK (supports_horizon IS NULL OR supports_horizon IN ('H1','H2','H3')),
  recorded_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by              TEXT
);

CREATE INDEX IF NOT EXISTS idx_pair_evidence_pair     ON pair_evidence(pair_id);
CREATE INDEX IF NOT EXISTS idx_pair_evidence_type     ON pair_evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_pair_evidence_strength ON pair_evidence(evidence_strength);

-- ============================================================================
-- 3.5 pair_adjacencies
-- ============================================================================
CREATE TABLE IF NOT EXISTS pair_adjacencies (
  id                       SERIAL PRIMARY KEY,
  source_pair_id           INTEGER NOT NULL REFERENCES technology_application_pairs(id) ON DELETE CASCADE,
  target_pair_id           INTEGER NOT NULL REFERENCES technology_application_pairs(id) ON DELETE CASCADE,
  adjacency_type           TEXT NOT NULL
    CHECK (adjacency_type IN ('same_technology_different_application',
                              'same_application_different_technology',
                              'predecessor_successor',
                              'substitute',
                              'complement',
                              'subscale_to_scale')),
  adjacency_strength       TEXT NOT NULL CHECK (adjacency_strength IN ('strong','moderate','weak')),
  reasoning_text           TEXT NOT NULL,
  source_citation          TEXT,
  recorded_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_pair_id <> target_pair_id),
  UNIQUE (source_pair_id, target_pair_id, adjacency_type)
);

CREATE INDEX IF NOT EXISTS idx_adjacency_source ON pair_adjacencies(source_pair_id);
CREATE INDEX IF NOT EXISTS idx_adjacency_target ON pair_adjacencies(target_pair_id);
CREATE INDEX IF NOT EXISTS idx_adjacency_type   ON pair_adjacencies(adjacency_type);

-- ============================================================================
-- 3.6 component_pair_links
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_pair_links (
  id                       SERIAL PRIMARY KEY,
  component_id             INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  pair_id                  INTEGER NOT NULL REFERENCES technology_application_pairs(id) ON DELETE CASCADE,
  link_role                TEXT NOT NULL
    CHECK (link_role IN ('primary','secondary','exposure_only')),
  reasoning_text           TEXT NOT NULL,
  source_citation          TEXT,
  recorded_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (component_id, pair_id)
);

CREATE INDEX IF NOT EXISTS idx_cpl_component ON component_pair_links(component_id);
CREATE INDEX IF NOT EXISTS idx_cpl_pair      ON component_pair_links(pair_id);
CREATE INDEX IF NOT EXISTS idx_cpl_role      ON component_pair_links(link_role);

-- ============================================================================
-- schema_migrations row
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (12, 'ontology_layer_v10', NOW())
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, applied_at = EXCLUDED.applied_at;
