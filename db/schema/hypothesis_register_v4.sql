-- hypothesis_register_v4.sql
-- Postgres schema for the hypothesis register, schema v4.
--
-- Source of truth: ARCHITECTURE.md Section 8 (the hypothesis register) and
-- the live Apps Script doGet endpoint surveyed 2026-04-28 BST.
--
-- Column count and naming: this file mirrors the 45 distinct columns observed
-- in the live Apps Script payload. ARCHITECTURE.md R14 states v4 is "frozen at
-- 49 columns". Resolution is deferred to a follow-up reconciliation pass; this
-- schema captures the live state. See SESSION.md Open Question 1 (2026-04-28).
--
-- Whitespace normalisation: the Sheet column header `system_layer` carries a
-- trailing space in the live payload (`system_layer `). The migration script
-- maps the trailing-space variant to this clean column name. Treated as a
-- Sheet header bug, not a schema feature.
--
-- Pipe-delimited fields (companies, signal_types, falsifiers, primary_sources,
-- related_hyp_ids) are stored as TEXT verbatim. Normalisation to junction
-- tables or arrays is deferred to a future schema bump (would be v5).
--
-- R14 enforcement: schema changes require a versioned bump and a corresponding
-- update to ARCHITECTURE.md. Do not edit columns silently.

BEGIN;

CREATE TABLE IF NOT EXISTS hypothesis_register (

    -- ---- identity ----
    hyp_id                       TEXT PRIMARY KEY,
    -- Permissive format CHECK; can be tightened in v5 once register prefix conventions are stable.
    -- Observed prefixes: BET_C, BET_I, BET_E, BET_M, BET_SC, BET_X, SH-, BP-, VW-, SHELL_H3_, etc.
    CONSTRAINT hyp_id_format CHECK (hyp_id ~ '^[A-Z0-9_-]{3,32}$'),

    -- ---- top-level descriptors ----
    sector                       TEXT NOT NULL,         -- e.g. ENERGY, MOBILITY, CHEMICALS, LIFE_SCIENCES, FOOD, MANUFACTURING
    system_layer                 TEXT,                  -- e.g. technology, regulation, market, ecosystem, geography (note: maps from "system_layer " in live Sheet)
    hypothesis_theme             TEXT,
    probability                  NUMERIC,               -- 0-100; intermediate scores allowed
    confidence_score             NUMERIC,
    urgency_score                NUMERIC,
    window_status                TEXT,                  -- e.g. active, closed
    window_date                  TEXT,                  -- free-form, e.g. "Q4 2026" (not ISO; kept as TEXT for round-trip fidelity)
    horizon_months               INTEGER,
    current_step                 INTEGER,
    step_conditions              TEXT,
    "trigger"                    TEXT,                  -- quoted: `trigger` is a non-reserved keyword in PG, quoted here for clarity
    if_true                      TEXT,                  -- action posture if hypothesis resolves true
    if_false                     TEXT,                  -- action posture if hypothesis falsified
    companies                    TEXT,                  -- pipe-delimited, e.g. "SHELL|BP|EXXONMOBIL|CHEVRON"

    -- ---- technology bucket (R16: technology) ----
    tech_critical_pathways       TEXT,
    tech_bottlenecks             TEXT,
    tech_credible_actors         TEXT,
    tech_trajectory_changers     TEXT,
    tech_displacement_risks      TEXT,

    -- ---- regulation bucket (R16: regulation) ----
    reg_load_bearing             TEXT,
    reg_gaps_blockers            TEXT,
    reg_decision_makers          TEXT,
    reg_unlock_delay_kill        TEXT,

    -- ---- market bucket (R16: cost/economics — labelled mkt_ in v4) ----
    mkt_critical_conditions      TEXT,
    mkt_economic_gap             TEXT,
    mkt_who_commits              TEXT,
    mkt_deal_structure           TEXT,

    -- ---- ecosystem bucket (R16: ecosystem) ----
    eco_missing_dependencies     TEXT,
    eco_required_partnerships    TEXT,
    eco_who_moves_first          TEXT,
    eco_derisking_commitment     TEXT,

    -- ---- geography bucket (NOT in R16's five-bucket list; v4 schema artefact) ----
    -- R16 names tech, cost, regulation, ecosystem, competitive. v4 has geo_* but no competitive_*.
    -- Reconciliation deferred. See SESSION.md Open Question on bucket alignment.
    geo_leading                  TEXT,
    geo_excluded                 TEXT,
    geo_shift_matters            TEXT,

    -- ---- signal/source/falsifier metadata ----
    signal_types                 TEXT,                  -- pipe-delimited
    falsifiers                   TEXT,                  -- pipe-delimited
    primary_sources              TEXT,                  -- pipe-delimited
    related_hyp_ids              TEXT,                  -- pipe-delimited, e.g. "BET_E007|BET_E008"

    -- ---- lifecycle and ownership ----
    phase                        TEXT,                  -- DIVERGENT, CONVERGING, TRIGGER_READY, RESOLVED
    rate_limiting_bucket         TEXT,
    owner                        TEXT,
    last_updated                 TEXT,                  -- TEXT (not TIMESTAMP) because live data has empty strings; promote in v5
    notes                        TEXT
);

-- ---- indexes ----
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_sector       ON hypothesis_register (sector);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_phase        ON hypothesis_register (phase);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_window_status ON hypothesis_register (window_status);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_owner        ON hypothesis_register (owner);

-- ---- soft R15 four-tests view ----
-- Surfaces rows that fail R15's hypothesis-validity tests. Not a CHECK constraint
-- because the live register may contain rows that violate this; we want to
-- surface them on every load, not block the load.
CREATE OR REPLACE VIEW hypothesis_register_r15_violations AS
SELECT
    hyp_id,
    CASE WHEN falsifiers IS NULL OR falsifiers = ''       THEN 'falsifiable'      END AS missing_falsifiable,
    CASE WHEN if_true IS NULL OR if_false IS NULL
         OR if_true = '' OR if_false = ''                 THEN 'business_linked'  END AS missing_business_linked,
    CASE WHEN horizon_months IS NULL OR horizon_months <= 0 THEN 'time_bound'     END AS missing_time_bound
FROM hypothesis_register
WHERE
    falsifiers IS NULL OR falsifiers = ''
    OR if_true IS NULL OR if_true = ''
    OR if_false IS NULL OR if_false = ''
    OR horizon_months IS NULL OR horizon_months <= 0;

COMMENT ON TABLE  hypothesis_register IS 'Hypothesis register v4. 45 columns mirror live Apps Script doGet payload as of 2026-04-28. See ARCHITECTURE.md Section 8 and R14.';
COMMENT ON VIEW   hypothesis_register_r15_violations IS 'Surfaces rows that fail R15 four-tests (falsifiable, business_linked, time_bound). Reviewed in monthly calibration cycle.';
COMMENT ON COLUMN hypothesis_register.hyp_id IS 'Natural key. Format permissive in v4; tighten in v5.';
COMMENT ON COLUMN hypothesis_register.system_layer IS 'Maps from Sheet header "system_layer " (trailing space). Migration script normalises.';

COMMIT;
