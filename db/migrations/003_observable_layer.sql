-- 003_observable_layer.sql
-- Adds the observable layer to the v5 hypothesis register per HYPOTHESIS_MATRIX_v1.md
-- Section 2.2 (the authoritative source for the observable schema) and HEAT_MAPS_AND_GESTATION.md
-- Section 5 (velocity as a first-class concept).
--
-- Schema effect: v5.0 → v5.6.
-- v5.5 was the planned methodology + four-layer-model edits to ARCHITECTURE.md (queued, not
-- yet committed). v5.6 covers the observable-layer schema bump landing now. ARCHITECTURE.md
-- updates per R25 are a separate same-day step after this migration commits.
--
-- This migration replaces the discarded v0 observable schema (WNTBT/FALSIFIER framing) which
-- was wrong: WNTBT and falsifiers are hypothesis-level concepts, not observable-level.
--
-- Three new tables:
--   1. hypothesis_observable          — 20 cols. State-based rows for the four continuous lines
--                                       (tech, market, regulation, ecosystem). Per HM 2.2 Row schema.
--   2. hypothesis_observable_event    — 10 cols. Event-log rows for the competitive line.
--                                       Different shape because competitive is event-flow not state.
--   3. confidence_band_history        — 17 cols. Daily time-series of overall + per-line confidence
--                                       positions and zones. Per HM 4 and 7.1.
--
-- Three column additions to hypothesis_register:
--   appraisal_cadence       TEXT NOT NULL DEFAULT 'weekly'  (HM 5.5)
--   last_appraisal_at       TIMESTAMPTZ NULL
--   current_confidence_band NUMERIC(4,3) DEFAULT 0.500     (HM 4.1)
--
-- One summary view:
--   hypothesis_matrix_summary — per-hypothesis counts (per-line observable counts, competitive
--                               event count, total_matrix_size, role counts).
--
-- Idempotent. Safe to re-run. No BEGIN/COMMIT here — runner manages the transaction.

-- ============================================================================
-- Three column additions to hypothesis_register (v5.0 → v5.6)
-- ============================================================================

ALTER TABLE hypothesis_register
    ADD COLUMN IF NOT EXISTS appraisal_cadence       TEXT NOT NULL DEFAULT 'weekly',
    ADD COLUMN IF NOT EXISTS last_appraisal_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_confidence_band NUMERIC(4,3) DEFAULT 0.500;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appraisal_cadence_enum') THEN
        ALTER TABLE hypothesis_register
            ADD CONSTRAINT appraisal_cadence_enum CHECK (
                appraisal_cadence IN ('daily', 'twice_weekly', 'weekly', 'monthly', 'on_demand')
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'current_confidence_band_range') THEN
        ALTER TABLE hypothesis_register
            ADD CONSTRAINT current_confidence_band_range CHECK (
                current_confidence_band IS NULL
                OR (current_confidence_band >= 0.000 AND current_confidence_band <= 1.000)
            );
    END IF;
END
$$;

COMMENT ON COLUMN hypothesis_register.appraisal_cadence IS
    'Per-hypothesis appraisal tempo. ENUM: daily, twice_weekly, weekly (default), monthly, on_demand. See HYPOTHESIS_MATRIX_v1.md Section 5.5.';
COMMENT ON COLUMN hypothesis_register.last_appraisal_at IS
    'Timestamp of the most recent Claude appraisal pass. NULL until first appraisal. See HM Section 2.1.';
COMMENT ON COLUMN hypothesis_register.current_confidence_band IS
    'Current overall confidence position on the visual bar, 0.000–1.000. Default 0.500 (amber midpoint). See HM Section 4.';

-- ============================================================================
-- New table: hypothesis_observable
-- One row per state-based observable on a continuous line (tech, market, regulation, ecosystem).
-- Per HYPOTHESIS_MATRIX_v1.md Section 2.2 Row schema (continuous observables).
-- ============================================================================

CREATE TABLE IF NOT EXISTS hypothesis_observable (
    id                   BIGSERIAL PRIMARY KEY,
    hyp_id               TEXT NOT NULL REFERENCES hypothesis_register(hyp_id) ON DELETE CASCADE,
    line                 TEXT NOT NULL,
    role                 TEXT NOT NULL,
    parent_path          TEXT,
    name                 TEXT NOT NULL,
    description          TEXT,
    current_state        TEXT,
    current_state_numeric NUMERIC,
    scale_type           TEXT NOT NULL,
    threshold            TEXT,
    threshold_numeric    NUMERIC,
    threshold_direction  TEXT,
    evidence_base        TEXT,
    velocity_30d         NUMERIC,
    velocity_90d         NUMERIC,
    velocity_status      TEXT,
    last_updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_signal_id       TEXT,
    notes                TEXT,

    CONSTRAINT observable_line_enum CHECK (
        line IN ('tech', 'market', 'regulation', 'ecosystem')
    ),
    CONSTRAINT observable_role_enum CHECK (
        role IN ('unlock', 'iteration', 'supporting')
    ),
    CONSTRAINT observable_scale_type_enum CHECK (
        scale_type IN ('TRL_1_9', 'cost_per_unit', 'percentage', 'binary', 'enum', 'freeform', 'currency', 'date')
    ),
    CONSTRAINT observable_threshold_direction_enum CHECK (
        threshold_direction IS NULL OR threshold_direction IN ('above', 'below', 'equal')
    ),
    CONSTRAINT observable_velocity_status_enum CHECK (
        velocity_status IS NULL OR velocity_status IN ('accelerating', 'steady', 'decelerating', 'static')
    )
);

CREATE INDEX IF NOT EXISTS idx_hyp_observable_hyp_id ON hypothesis_observable (hyp_id);
CREATE INDEX IF NOT EXISTS idx_hyp_observable_line   ON hypothesis_observable (line);
CREATE INDEX IF NOT EXISTS idx_hyp_observable_role   ON hypothesis_observable (role);

COMMENT ON TABLE hypothesis_observable IS
    'Continuous-line observables (tech, market, regulation, ecosystem). Per HYPOTHESIS_MATRIX_v1.md Section 2.2.';
COMMENT ON COLUMN hypothesis_observable.line IS
    'Continuous line. ENUM: tech, market, regulation, ecosystem. The competitive line is event-log; see hypothesis_observable_event.';
COMMENT ON COLUMN hypothesis_observable.role IS
    'Observable role in the hypothesis structure. ENUM: unlock (movement here changes the hypothesis materially), iteration (marginal), supporting (evidence but not load-bearing).';
COMMENT ON COLUMN hypothesis_observable.scale_type IS
    'How current_state and threshold should be interpreted. ENUM: TRL_1_9, cost_per_unit, percentage, binary, enum, freeform, currency, date.';
COMMENT ON COLUMN hypothesis_observable.velocity_status IS
    'Computed from update history; second-derivative signal. ENUM: accelerating, steady, decelerating, static. See HEAT_MAPS_AND_GESTATION.md Section 5.';

-- ============================================================================
-- New table: hypothesis_observable_event
-- Event-log rows for the competitive line. Per HYPOTHESIS_MATRIX_v1.md Section 2.2
-- Row schema (event-log observables — competitive).
-- ============================================================================

CREATE TABLE IF NOT EXISTS hypothesis_observable_event (
    event_id             BIGSERIAL PRIMARY KEY,
    hyp_id               TEXT NOT NULL REFERENCES hypothesis_register(hyp_id) ON DELETE CASCADE,
    actor                TEXT NOT NULL,
    event_type           TEXT NOT NULL,
    event_description    TEXT,
    event_date           DATE NOT NULL,
    implication          TEXT,
    implication_severity TEXT,
    source_signals       TEXT,
    last_updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT event_type_enum CHECK (
        event_type IN ('partnership', 'acquisition', 'capacity_announcement', 'exit', 'investment', 'regulatory_action', 'other')
    ),
    CONSTRAINT event_implication_severity_enum CHECK (
        implication_severity IS NULL OR implication_severity IN ('minor', 'material', 'major')
    )
);

CREATE INDEX IF NOT EXISTS idx_observable_event_hyp_id     ON hypothesis_observable_event (hyp_id);
CREATE INDEX IF NOT EXISTS idx_observable_event_event_date ON hypothesis_observable_event (event_date);
CREATE INDEX IF NOT EXISTS idx_observable_event_actor      ON hypothesis_observable_event (actor);

COMMENT ON TABLE hypothesis_observable_event IS
    'Event-log observables for the competitive line. Each row = one named-actor event with implication. Per HYPOTHESIS_MATRIX_v1.md Section 2.2.';
COMMENT ON COLUMN hypothesis_observable_event.event_type IS
    'ENUM: partnership, acquisition, capacity_announcement, exit, investment, regulatory_action, other.';
COMMENT ON COLUMN hypothesis_observable_event.implication_severity IS
    'ENUM: minor, material, major. Per HM 2.2 row schema. NULL pending operator assessment.';
COMMENT ON COLUMN hypothesis_observable_event.source_signals IS
    'Pipe-delimited signal references. Free-form in v5.6; structured in v6.';

-- ============================================================================
-- New table: confidence_band_history
-- Daily time-series of overall + per-line confidence positions and zones per hypothesis.
-- Per HYPOTHESIS_MATRIX_v1.md Section 4 and Section 7.1.
-- Per-line column prefixes are short (tech_, market_, reg_, eco_, comp_) following the v5
-- Section C convention; the line ENUM in hypothesis_observable uses long names.
-- ============================================================================

CREATE TABLE IF NOT EXISTS confidence_band_history (
    id               BIGSERIAL PRIMARY KEY,
    hyp_id           TEXT NOT NULL REFERENCES hypothesis_register(hyp_id) ON DELETE CASCADE,

    overall_position NUMERIC(4,3) NOT NULL,
    overall_zone     TEXT NOT NULL,

    tech_position    NUMERIC(4,3),
    tech_zone        TEXT,
    market_position  NUMERIC(4,3),
    market_zone      TEXT,
    reg_position     NUMERIC(4,3),
    reg_zone         TEXT,
    eco_position     NUMERIC(4,3),
    eco_zone         TEXT,
    comp_position    NUMERIC(4,3),
    comp_zone        TEXT,

    narrative        TEXT,
    appraisal_id     BIGINT,                                -- FK to future appraisal_log; nullable until that table exists
    recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT cbh_overall_position_range CHECK (overall_position >= 0.000 AND overall_position <= 1.000),
    CONSTRAINT cbh_overall_zone_enum      CHECK (overall_zone IN ('red', 'amber', 'green')),

    CONSTRAINT cbh_tech_position_range    CHECK (tech_position   IS NULL OR (tech_position   >= 0.000 AND tech_position   <= 1.000)),
    CONSTRAINT cbh_tech_zone_enum         CHECK (tech_zone       IS NULL OR tech_zone       IN ('red', 'amber', 'green')),
    CONSTRAINT cbh_market_position_range  CHECK (market_position IS NULL OR (market_position >= 0.000 AND market_position <= 1.000)),
    CONSTRAINT cbh_market_zone_enum       CHECK (market_zone     IS NULL OR market_zone     IN ('red', 'amber', 'green')),
    CONSTRAINT cbh_reg_position_range     CHECK (reg_position    IS NULL OR (reg_position    >= 0.000 AND reg_position    <= 1.000)),
    CONSTRAINT cbh_reg_zone_enum          CHECK (reg_zone        IS NULL OR reg_zone        IN ('red', 'amber', 'green')),
    CONSTRAINT cbh_eco_position_range     CHECK (eco_position    IS NULL OR (eco_position    >= 0.000 AND eco_position    <= 1.000)),
    CONSTRAINT cbh_eco_zone_enum          CHECK (eco_zone        IS NULL OR eco_zone        IN ('red', 'amber', 'green')),
    CONSTRAINT cbh_comp_position_range    CHECK (comp_position   IS NULL OR (comp_position   >= 0.000 AND comp_position   <= 1.000)),
    CONSTRAINT cbh_comp_zone_enum         CHECK (comp_zone       IS NULL OR comp_zone       IN ('red', 'amber', 'green'))
);

CREATE INDEX IF NOT EXISTS idx_cbh_hyp_id              ON confidence_band_history (hyp_id);
CREATE INDEX IF NOT EXISTS idx_cbh_recorded_at         ON confidence_band_history (recorded_at);
CREATE INDEX IF NOT EXISTS idx_cbh_hyp_id_recorded_at  ON confidence_band_history (hyp_id, recorded_at DESC);

COMMENT ON TABLE confidence_band_history IS
    'Daily time-series of overall + per-line confidence positions and zones per hypothesis. Per HM Section 4.';
COMMENT ON COLUMN confidence_band_history.appraisal_id IS
    'FK to future appraisal_log table. Nullable until appraisal_log exists. No FK constraint in v5.6.';

-- ============================================================================
-- Summary view: hypothesis_matrix_summary
-- Per-hypothesis aggregations: observable counts per line, competitive event count,
-- total_matrix_size, role counts. LEFT JOIN from hypothesis_register so every hypothesis
-- appears even with zero observables.
-- ============================================================================

CREATE OR REPLACE VIEW hypothesis_matrix_summary AS
SELECT
    h.hyp_id,
    h.register,
    h.sector,
    h.phase,
    h.status,
    h.appraisal_cadence,
    h.last_appraisal_at,
    h.current_confidence_band,

    -- per-line observable counts
    COALESCE(o.tech_observable_count,   0) AS tech_observable_count,
    COALESCE(o.market_observable_count, 0) AS market_observable_count,
    COALESCE(o.reg_observable_count,    0) AS reg_observable_count,
    COALESCE(o.eco_observable_count,    0) AS eco_observable_count,

    -- competitive event count (separate table)
    COALESCE(e.competitive_event_count, 0) AS competitive_event_count,

    -- total matrix size (continuous observables + competitive events)
    COALESCE(o.tech_observable_count,   0)
      + COALESCE(o.market_observable_count, 0)
      + COALESCE(o.reg_observable_count,    0)
      + COALESCE(o.eco_observable_count,    0)
      + COALESCE(e.competitive_event_count, 0) AS total_matrix_size,

    -- role counts (continuous observables only; events have no role attribute)
    COALESCE(o.unlock_count,     0) AS unlock_count,
    COALESCE(o.iteration_count,  0) AS iteration_count,
    COALESCE(o.supporting_count, 0) AS supporting_count

FROM hypothesis_register h
LEFT JOIN (
    SELECT
        hyp_id,
        COUNT(*) FILTER (WHERE line = 'tech')              AS tech_observable_count,
        COUNT(*) FILTER (WHERE line = 'market')            AS market_observable_count,
        COUNT(*) FILTER (WHERE line = 'regulation')        AS reg_observable_count,
        COUNT(*) FILTER (WHERE line = 'ecosystem')         AS eco_observable_count,
        COUNT(*) FILTER (WHERE role = 'unlock')            AS unlock_count,
        COUNT(*) FILTER (WHERE role = 'iteration')         AS iteration_count,
        COUNT(*) FILTER (WHERE role = 'supporting')        AS supporting_count
    FROM hypothesis_observable
    GROUP BY hyp_id
) o ON o.hyp_id = h.hyp_id
LEFT JOIN (
    SELECT
        hyp_id,
        COUNT(*) AS competitive_event_count
    FROM hypothesis_observable_event
    GROUP BY hyp_id
) e ON e.hyp_id = h.hyp_id;

COMMENT ON VIEW hypothesis_matrix_summary IS
    'Per-hypothesis matrix summary: observable counts per line, competitive event count, total_matrix_size, role counts. Dashboard data source.';
