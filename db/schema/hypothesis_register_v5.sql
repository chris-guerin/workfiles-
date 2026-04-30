-- hypothesis_register_v5.sql
-- Postgres schema for the unified hypothesis register, schema v5.
--
-- Supersedes v4 (45 cols observed live 28 April; 49 cols in 25 March CSV/HTML).
-- See /db/schema/v5_design.md for the design doc, mapping table, and decision rationale.
-- See ARCHITECTURE.md v5.3 Section 8 (the hypothesis register) and Section 19 R14 (schema freeze, v5.0).
--
-- Three-section structure:
--   A. Core identity (16 cols) — spine joining the layers
--   B. Decision layer (30 cols) — outward-facing, commercial framing
--   C. Bucket layer (30 cols) — inward-facing, R16 buckets + signal/falsifier metadata
--
-- R14: schema frozen at v5.0. Schema changes require explicit version bump per Section 19.8.
-- R16: five canonical buckets (technology, cost, regulation, ecosystem, competitive). Geography is a
--      cross-cutting modifier. Section C carries three legacy geo_* cols as documented exceptions
--      (deprecate when Build L per-metric table ships). Section C has no comp_* cols today;
--      competitive coverage is a known register-level gap, enforced at per-metric level by Build L.
-- R15: four-tests (falsifiable, directional, business-linked, time-bound) surfaced via the
--      hypothesis_register_r15_violations view (soft enforcement; load is not blocked).
--
-- Whitespace normalisation note: live Sheet header `system_layer` carries a trailing space
-- (`system_layer `). Migration script normalises to clean column.
--
-- Pipe-delimited fields (company_tags, topic_tags, initiative_tags, persona_tags, routing_geography,
-- industry_tags, target_accounts, signal_types, falsifiers, primary_sources, related_hyp_ids) stored
-- as TEXT verbatim. Junction-table normalisation deferred to v6.

BEGIN;

CREATE TABLE IF NOT EXISTS hypothesis_register (

    -- ============================================================================
    -- Section A — core identity (16 cols)
    -- The spine that joins the decision and bucket layers.
    -- ============================================================================

    hyp_id                          TEXT PRIMARY KEY,
    -- Permissive format CHECK; tighten in v6 once register prefix conventions are stable.
    -- Observed prefixes: BET_C, BET_I, BET_E, BET_M, BET_SC, BET_X, SH-, BP-, VW-, SHELL_H3_, etc.
    CONSTRAINT hyp_id_format CHECK (hyp_id ~ '^[A-Z0-9_-]{3,32}$'),

    register                        TEXT NOT NULL,
    CONSTRAINT register_enum CHECK (register IN ('PERSONAL', 'INDUSTRY', 'SECTOR', 'CLIENT_ACCOUNT')),
    -- Explicit register column NEW in v5. hyp_id prefix remains as convention but `register` is canonical.

    sector                          TEXT NOT NULL,
    -- Free-form to absorb cross-sector hypotheses; observed values: ENERGY, MOBILITY, CHEMICALS,
    -- LIFE_SCIENCES, FOOD, MANUFACTURING, CROSS.

    system_layer                    TEXT,
    -- Maps from Sheet header `system_layer ` (trailing space). Migration script normalises.

    hypothesis_theme                TEXT,
    -- The 25 March CSV's `title` is collapsed into `hypothesis_theme` (semantic equivalence).

    owner                           TEXT,
    -- Human persona name, e.g. "Chris Guerin".

    status                          TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT status_enum CHECK (status IN ('ACTIVE', 'RETIRED', 'DRAFT')),
    -- Administrative state. Distinct from `phase` and `window_status`.

    phase                           TEXT NOT NULL DEFAULT 'DIVERGENT',
    CONSTRAINT phase_enum CHECK (phase IN ('DIVERGENT', 'CONVERGING', 'TRIGGER_READY', 'RESOLVED')),
    -- Methodological phase per ARCHITECTURE.md Section 3.4 / R6.

    schema_version                  TEXT NOT NULL DEFAULT 'v5',

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                      TEXT,
    last_updated                    TIMESTAMPTZ,
    -- Promoted from TEXT (v4) to TIMESTAMPTZ. Migration parses string values where present.
    last_updated_by                 TEXT,

    resolved_outcome                TEXT,
    CONSTRAINT resolved_outcome_enum CHECK (
        resolved_outcome IS NULL OR resolved_outcome IN ('TRUE', 'FALSE', 'DISPLACED')
    ),
    -- NULL until phase = RESOLVED. Per Section 3.4.

    resolved_date                   DATE,
    -- NULL until phase = RESOLVED.

    notes                           TEXT,

    -- ============================================================================
    -- Section B — decision layer (30 cols)
    -- Outward-facing commercial framing; drawn primarily from 25 March CSV.
    -- ============================================================================

    probability                     NUMERIC,
    -- 0–100; intermediate scores allowed.
    confidence_score                NUMERIC,
    urgency_score                   NUMERIC,
    probability_last_changed        DATE,
    probability_last_changed_note   TEXT,
    current_step                    INTEGER,
    total_steps                     INTEGER,
    step_conditions                 TEXT,

    window_status                   TEXT,
    -- Was CSV `window` and live `window_status`. Unified to `window_status`.
    -- No CHECK enum: live data has 6 values (open / active / future / closing plus 2 anomalous
    -- quarter-strings). Standardisation deferred to a v5.x cleanup sweep when canonical values
    -- are agreed.

    window_closes_at                TEXT,
    -- Was CSV `window_closes` and live `window_date`. Free-form text ("Q4 2026", "H2 2027").
    -- Originally typed DATE in v5.0 draft; changed to TEXT pre-deploy 29 April 09:58 BST when
    -- pre-flight showed 100% of source values are quarter/half-year strings, not parseable as DATE.
    -- Promotion to a structured (year, quarter) representation is a v6 question.

    horizon_months                  INTEGER,
    decision_window_reason          TEXT,
    decision_type                   TEXT,
    decision                        TEXT,
    -- The actual decision being made.

    decision_threshold              TEXT,
    -- Hypothesis-level evidence threshold. Distinct from per-metric thresholds (Build L).

    decision_owner_role             TEXT,
    decision_owner_function         TEXT,
    decision_owner_name             TEXT,

    decision_if_true                TEXT,
    -- Was live `if_true` and CSV `decision_if_true`. Unified to CSV name to match Section B convention.
    decision_if_false               TEXT,

    risk_if_wrong                   TEXT,
    upside_if_right                 TEXT,

    wntbt_next                      TEXT,
    -- Hypothesis-level "what needs to be true next" — curated narrative.
    -- WNTBT also lives at bucket level (text fields in Section C) and per-metric (Build L future).

    target_accounts                 TEXT,
    -- Pipe-delimited account list.

    company_tags                    TEXT,
    -- Was live `companies` and CSV `company_tags`. Unified to CSV name. Pipe-delimited.
    topic_tags                      TEXT,
    initiative_tags                 TEXT,
    persona_tags                    TEXT,

    routing_geography               TEXT,
    -- Was CSV `geography_tags`. Renamed to disambiguate from operational geography in Section C.
    -- Drops the `_tags` pluralisation pattern of the other Section B tag columns; deliberate.

    industry_tags                   TEXT,

    -- ============================================================================
    -- Section C — bucket layer (30 cols)
    -- Inward-facing operational substrate per R16 canonical buckets;
    -- drawn primarily from 28 April live register.
    -- ============================================================================

    -- ---- technology bucket (R16: technology) ----
    tech_critical_pathways          TEXT,
    tech_bottlenecks                TEXT,
    tech_credible_actors            TEXT,
    tech_trajectory_changers        TEXT,
    tech_displacement_risks         TEXT,

    -- ---- regulation bucket (R16: regulation) ----
    reg_load_bearing                TEXT,
    reg_gaps_blockers               TEXT,
    reg_decision_makers             TEXT,
    reg_unlock_delay_kill           TEXT,

    -- ---- cost bucket (R16: cost — renamed from v4 mkt_*) ----
    cost_critical_conditions        TEXT,
    cost_economic_gap               TEXT,
    cost_who_commits                TEXT,
    cost_deal_structure             TEXT,

    -- ---- ecosystem bucket (R16: ecosystem) ----
    eco_missing_dependencies        TEXT,
    eco_required_partnerships       TEXT,
    eco_who_moves_first             TEXT,
    eco_derisking_commitment        TEXT,

    -- ---- geography (LEGACY, documented exception per R16) ----
    -- R16 v5.3: geography is a cross-cutting modifier, not a peer bucket.
    -- These three columns capture analyst commentary at hypothesis level; deprecate when
    -- Build L's per-metric table ships with proper geography slicing.
    geo_leading                     TEXT,
    geo_excluded                    TEXT,
    geo_shift_matters               TEXT,

    -- ---- competitive bucket: NOT YET PRESENT ----
    -- R16 v5.3 names competitive as canonical. Section C has no comp_* cols today.
    -- Known register-level gap; enforced at per-metric level by Build L (no metric ships
    -- without bucket label, including competitive). Do not add comp_* columns silently —
    -- requires methodology pass on what good competitive content looks like.

    -- ---- trigger ----
    "trigger"                       TEXT,
    -- Quoted: `trigger` is a non-reserved keyword in PG. The event that fires ACT.

    -- ---- signal / falsifier / source / dependency metadata ----
    signal_types                    TEXT,
    -- Pipe-delimited.
    signal_priority                 TEXT,
    signal_weighting_rule           TEXT,
    last_signal_id                  TEXT,
    falsifiers                      TEXT,
    -- Pipe-delimited.
    primary_sources                 TEXT,
    -- Was CSV `primary_sources_expected` and live `primary_sources`. Unified to live name.
    shared_dependency               TEXT,
    related_hyp_ids                 TEXT,
    -- Pipe-delimited.
    rate_limiting_bucket            TEXT
    -- Which bucket is the bottleneck for this hypothesis.
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hypothesis_register_register       ON hypothesis_register (register);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_sector         ON hypothesis_register (sector);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_phase          ON hypothesis_register (phase);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_status         ON hypothesis_register (status);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_window_status  ON hypothesis_register (window_status);
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_owner          ON hypothesis_register (owner);

-- Partial index for the live read path (excludes RETIRED hypotheses).
CREATE INDEX IF NOT EXISTS idx_hypothesis_register_active
    ON hypothesis_register (register, sector, phase)
    WHERE status = 'ACTIVE';

-- ============================================================================
-- R15 four-tests violations view
-- Soft enforcement (does not block the load). Reviewed in monthly calibration cycle.
-- ============================================================================

CREATE OR REPLACE VIEW hypothesis_register_r15_violations AS
SELECT
    hyp_id,
    register,
    sector,
    phase,
    CASE WHEN falsifiers IS NULL OR falsifiers = ''            THEN 'falsifiable'      END AS missing_falsifiable,
    CASE WHEN decision_if_true IS NULL OR decision_if_true = ''
         OR decision_if_false IS NULL OR decision_if_false = '' THEN 'business_linked' END AS missing_business_linked,
    CASE WHEN horizon_months IS NULL OR horizon_months <= 0    THEN 'time_bound'       END AS missing_time_bound
FROM hypothesis_register
WHERE
    falsifiers IS NULL OR falsifiers = ''
    OR decision_if_true IS NULL OR decision_if_true = ''
    OR decision_if_false IS NULL OR decision_if_false = ''
    OR horizon_months IS NULL OR horizon_months <= 0;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE  hypothesis_register IS
    'Hypothesis register v5.0. 76 cols in three sections: A core (16), B decision (30), C bucket (30). '
    'Unifies the 25 March decision-centric schema (49 cols) with the 28 April bucket-centric live schema (45 cols). '
    'See ARCHITECTURE.md v5.3 Section 8 and R14.';

COMMENT ON VIEW   hypothesis_register_r15_violations IS
    'Surfaces rows that fail R15 four-tests (falsifiable, business_linked, time_bound). '
    'Reviewed in monthly calibration cycle. Soft enforcement; does not block inserts.';

COMMENT ON COLUMN hypothesis_register.hyp_id IS
    'Natural key. Format CHECK is permissive in v5; tighten in v6.';

COMMENT ON COLUMN hypothesis_register.register IS
    'NEW in v5. ENUM: PERSONAL / INDUSTRY / SECTOR / CLIENT_ACCOUNT. '
    'hyp_id prefix remains as convention but this column is canonical for filtering and joins.';

COMMENT ON COLUMN hypothesis_register.system_layer IS
    'Maps from Sheet header "system_layer " (trailing space). Migration normalises.';

COMMENT ON COLUMN hypothesis_register.phase IS
    'Methodological phase per Section 3.4 / R6. Distinct from `status` (administrative) and `window_status` (current window).';

COMMENT ON COLUMN hypothesis_register.routing_geography IS
    'Was v4 `geography_tags`. Renamed to disambiguate from operational geo_* in Section C. Pipe-delimited.';

COMMENT ON COLUMN hypothesis_register.cost_critical_conditions IS
    'R16 cost bucket. Renamed from v4 `mkt_critical_conditions` to align with R16 canonical naming.';

COMMENT ON COLUMN hypothesis_register.geo_leading IS
    'LEGACY, documented exception per R16. Geography is a cross-cutting modifier, not a peer bucket. Deprecate when Build L per-metric table ships.';

COMMIT;
