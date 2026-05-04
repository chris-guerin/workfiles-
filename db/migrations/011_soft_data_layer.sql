-- 011_soft_data_layer.sql
-- v3 soft data layer per /docs/SCHEMA_V3.md section 13.
--
-- Schema effect: v8.1 -> v9.0. Additive — no v3 hard-data tables touched
-- except mini_signals_v3 (4 new columns).
--
-- 8 new tables: initiative_assumptions, strategic_tensions,
-- tension_affected_initiatives, tension_affected_components,
-- tension_evidence, reframings, reframing_evidence, signal_soft_impacts.
--
-- Idempotent. Runner manages the transaction.

-- ============================================================================
-- 13.4 mini_signals_v3 extension (do first; signal tables below FK to it)
-- ============================================================================
ALTER TABLE mini_signals_v3
  ADD COLUMN IF NOT EXISTS soft_signal_type      TEXT,
  ADD COLUMN IF NOT EXISTS soft_signal_subject   TEXT,
  ADD COLUMN IF NOT EXISTS soft_signal_direction TEXT,
  ADD COLUMN IF NOT EXISTS soft_signal_reasoning TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mini_signals_v3_soft_signal_type_check') THEN
    ALTER TABLE mini_signals_v3
      ADD CONSTRAINT mini_signals_v3_soft_signal_type_check
      CHECK (soft_signal_type IS NULL OR soft_signal_type IN ('assumption_evidence','tension_evidence','reframe_evidence','none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mini_signals_v3_soft_signal_direction_check') THEN
    ALTER TABLE mini_signals_v3
      ADD CONSTRAINT mini_signals_v3_soft_signal_direction_check
      CHECK (soft_signal_direction IS NULL OR soft_signal_direction IN ('reinforcing','contradicting','clarifying'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_minisignal_soft_type ON mini_signals_v3(soft_signal_type)
  WHERE soft_signal_type IS NOT NULL AND soft_signal_type != 'none';

-- ============================================================================
-- 13.1 initiative_assumptions
-- ============================================================================
CREATE TABLE IF NOT EXISTS initiative_assumptions (
  id                          SERIAL PRIMARY KEY,
  initiative_id               INTEGER NOT NULL REFERENCES initiatives_v2(id) ON DELETE CASCADE,
  assumption_text             TEXT NOT NULL,
  assumption_role             TEXT NOT NULL
    CHECK (assumption_role IN ('supports','constrains','enables','protects','threatens')),
  horizon                     TEXT NOT NULL CHECK (horizon IN ('H1','H2','H3')),
  contradiction_mechanism     TEXT NOT NULL,
  contradiction_evidence_type TEXT
    CHECK (contradiction_evidence_type IN ('regulatory','market','technological','behavioural','geopolitical','none_required')
           OR contradiction_evidence_type IS NULL),
  fragility_score             NUMERIC(3,2) CHECK (fragility_score IS NULL OR (fragility_score BETWEEN 0 AND 1)),
  status                      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','contradicted','validated','obsolete')),
  source_citation             TEXT,
  reasoning_text              TEXT,
  draft_status                TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at            TIMESTAMPTZ,
  last_status_change_at       TIMESTAMPTZ,
  UNIQUE (initiative_id, assumption_text)
);

CREATE INDEX IF NOT EXISTS idx_assumption_initiative ON initiative_assumptions(initiative_id);
CREATE INDEX IF NOT EXISTS idx_assumption_status     ON initiative_assumptions(status) WHERE status != 'obsolete';
CREATE INDEX IF NOT EXISTS idx_assumption_horizon    ON initiative_assumptions(horizon);
CREATE INDEX IF NOT EXISTS idx_assumption_role       ON initiative_assumptions(assumption_role);

-- ============================================================================
-- 13.2 strategic_tensions + link tables + evidence
-- ============================================================================
CREATE TABLE IF NOT EXISTS strategic_tensions (
  id                  SERIAL PRIMARY KEY,
  tension_name        TEXT NOT NULL,
  tension_statement   TEXT NOT NULL,
  tension_type        TEXT NOT NULL
    CHECK (tension_type IN ('substitution','timing','capital_allocation','demand_shift','regulatory_arbitrage','regime_change','cross_horizon')),
  scope               TEXT NOT NULL
    CHECK (scope IN ('within_initiative','cross_initiative','cross_company','cross_industry','portfolio_level')),
  primary_horizon     TEXT NOT NULL CHECK (primary_horizon IN ('H1','H2','H3')),
  primary_company_id  INTEGER REFERENCES companies(id),
  reasoning_text      TEXT NOT NULL,
  source_citation     TEXT,
  status              TEXT NOT NULL DEFAULT 'emerging'
    CHECK (status IN ('emerging','established','receding','resolved','dismissed')),
  draft_status        TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reinforced_at  TIMESTAMPTZ,
  resolution_date     DATE,
  resolution_text     TEXT
);

CREATE TABLE IF NOT EXISTS tension_affected_initiatives (
  tension_id        INTEGER NOT NULL REFERENCES strategic_tensions(id) ON DELETE CASCADE,
  initiative_id     INTEGER NOT NULL REFERENCES initiatives_v2(id) ON DELETE CASCADE,
  exposure_type     TEXT NOT NULL CHECK (exposure_type IN ('reinforces','threatens','reframes','marginal')),
  exposure_strength TEXT NOT NULL CHECK (exposure_strength IN ('critical','high','medium','low')),
  PRIMARY KEY (tension_id, initiative_id)
);

CREATE TABLE IF NOT EXISTS tension_affected_components (
  tension_id      INTEGER NOT NULL REFERENCES strategic_tensions(id) ON DELETE CASCADE,
  component_id    INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  exposure_type   TEXT NOT NULL CHECK (exposure_type IN ('central','peripheral','indirect')),
  PRIMARY KEY (tension_id, component_id)
);

CREATE TABLE IF NOT EXISTS tension_evidence (
  id                  SERIAL PRIMARY KEY,
  tension_id          INTEGER NOT NULL REFERENCES strategic_tensions(id) ON DELETE CASCADE,
  source_signal_id    INTEGER REFERENCES mini_signals_v3(id) ON DELETE SET NULL,
  evidence_text       TEXT NOT NULL,
  evidence_direction  TEXT NOT NULL CHECK (evidence_direction IN ('reinforcing','contradicting','clarifying')),
  source_url          TEXT,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by         TEXT
);

CREATE INDEX IF NOT EXISTS idx_tension_status   ON strategic_tensions(status) WHERE status NOT IN ('resolved','dismissed');
CREATE INDEX IF NOT EXISTS idx_tension_type     ON strategic_tensions(tension_type);
CREATE INDEX IF NOT EXISTS idx_tension_horizon  ON strategic_tensions(primary_horizon);
CREATE INDEX IF NOT EXISTS idx_tension_company  ON strategic_tensions(primary_company_id) WHERE primary_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tension_evidence_signal ON tension_evidence(source_signal_id);

-- ============================================================================
-- 13.3 reframings + evidence
-- ============================================================================
CREATE TABLE IF NOT EXISTS reframings (
  id                          SERIAL PRIMARY KEY,
  subject_type                TEXT NOT NULL CHECK (subject_type IN ('tech_function','market','component','regulatory_domain','industry')),
  subject_id                  INTEGER,  -- application-layer FK semantics per subject_type
  subject_name                TEXT NOT NULL,
  reframe_text                TEXT NOT NULL,
  from_frame                  TEXT NOT NULL,
  to_frame                    TEXT NOT NULL,
  source_citation             TEXT,
  confidence_band             TEXT CHECK (confidence_band IN ('high','medium','low') OR confidence_band IS NULL),
  status                      TEXT NOT NULL DEFAULT 'emerging'
    CHECK (status IN ('emerging','established','receding','rejected')),
  draft_status                TEXT NOT NULL DEFAULT 'draft_unreviewed',
  first_observed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reinforced_at          TIMESTAMPTZ,
  promotion_to_established_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reframing_evidence (
  id                  SERIAL PRIMARY KEY,
  reframing_id        INTEGER NOT NULL REFERENCES reframings(id) ON DELETE CASCADE,
  source_signal_id    INTEGER REFERENCES mini_signals_v3(id) ON DELETE SET NULL,
  evidence_text       TEXT NOT NULL,
  evidence_strength   TEXT CHECK (evidence_strength IN ('strong','moderate','weak') OR evidence_strength IS NULL),
  source_url          TEXT,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reframing_subject        ON reframings(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_reframing_status         ON reframings(status);
CREATE INDEX IF NOT EXISTS idx_reframing_evidence_signal ON reframing_evidence(source_signal_id);

-- ============================================================================
-- 13.5 signal_soft_impacts (with XOR check on assumption/tension/reframing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS signal_soft_impacts (
  id                      SERIAL PRIMARY KEY,
  mini_signal_id          INTEGER NOT NULL REFERENCES mini_signals_v3(id) ON DELETE CASCADE,
  impact_type             TEXT NOT NULL CHECK (impact_type IN ('assumption','tension','reframing')),
  assumption_id           INTEGER REFERENCES initiative_assumptions(id),
  tension_id              INTEGER REFERENCES strategic_tensions(id),
  reframing_id            INTEGER REFERENCES reframings(id),
  impact_direction        TEXT NOT NULL CHECK (impact_direction IN ('reinforces','contradicts','clarifies','marginal')),
  impact_magnitude        NUMERIC(3,2) CHECK (impact_magnitude IS NULL OR (impact_magnitude BETWEEN 0 AND 1)),
  is_material             BOOLEAN NOT NULL DEFAULT FALSE,
  reasoning_text          TEXT NOT NULL,
  assessment_model        TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  assessed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT signal_soft_impacts_xor CHECK (
    (impact_type = 'assumption' AND assumption_id IS NOT NULL AND tension_id IS NULL     AND reframing_id IS NULL) OR
    (impact_type = 'tension'    AND tension_id    IS NOT NULL AND assumption_id IS NULL AND reframing_id IS NULL) OR
    (impact_type = 'reframing'  AND reframing_id  IS NOT NULL AND assumption_id IS NULL AND tension_id    IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_soft_impact_signal     ON signal_soft_impacts(mini_signal_id);
CREATE INDEX IF NOT EXISTS idx_soft_impact_assumption ON signal_soft_impacts(assumption_id) WHERE assumption_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soft_impact_tension    ON signal_soft_impacts(tension_id)    WHERE tension_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soft_impact_reframing  ON signal_soft_impacts(reframing_id)  WHERE reframing_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soft_impact_material   ON signal_soft_impacts(is_material) WHERE is_material = true;

-- ============================================================================
-- schema_migrations row
-- ============================================================================
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (11, 'soft_data_layer', NOW())
ON CONFLICT (version) DO NOTHING;
