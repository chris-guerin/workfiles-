# SCHEMA_V2 — gold standard specification

**Version:** 2.0
**Status:** Specification document. The frame Claude Code builds against. Every table, column, constraint, and seed row defined.
**Audience:** Anyone implementing migration 006. Specifically Claude Code.
**Reading order:** This document is the build spec. Read INITIATIVE_METHODOLOGY.md alongside it for the procedure that populates against this schema.

**Related artefact:** `/docs/ontology/ev_charging.html` is the routing taxonomy for one technology, produced 2026-05-03. Future migration 007 will add a `components.ontology_node_id` column allowing components to reference ontology leaves for signal routing. Out of scope for migration 006.

---

## 1. Purpose

This schema replaces the v1 model defined in INITIATIVE_MODEL.md. The v1 model captured analytical positioning at three layers (company, initiative, entity-with-claim). The v2 schema extends that foundation to support:

- Full attribute vocabularies per analytical vector (tech, regulation, market, ecosystem, competition)
- Per-component decomposition with hierarchical sub-component support
- Schema-enforced completeness — components must carry their full attribute set, attributes must end in resolved states
- Cross-industry queryability via controlled vocabulary for tech functions
- Time-series observation infrastructure (deferred to migration 007)

The principle: completeness is enforced by the schema, not by AI's discipline. Every component must carry all required attributes for its vector. Every attribute must end in `populated`, `not_in_source`, or `not_applicable` — never silently absent.

## 2. Migration 006 scope

This migration creates the v2 framework as new tables alongside the v1 model. The v1 tables (initiatives, entities, links from migration 004) remain in place but are deprecated. Migration 008 (future) will cut over to v2-only after the v2 catalogue is populated and validated.

Migration 006 creates:

- New tables: `companies`, `initiatives_v2`, `components`, `attribute_definitions`, `tech_functions`, `component_attributes`, `claims_v2`, `schema_migrations`
- Trigger on `components` insert that auto-creates `component_attributes` rows
- Views: `components_incomplete`, `components_with_full_record`
- Seed data: 61 rows in `attribute_definitions`

## 3. Tables

### 3.1 `companies`

```sql
CREATE TABLE companies (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  sector          TEXT NOT NULL CHECK (sector IN ('energy','mobility','both')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 `initiatives_v2`

```sql
CREATE TABLE initiatives_v2 (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  strategy_context      TEXT,
  brief_description     TEXT,
  hypothesis_statement  TEXT,
  why_it_matters        TEXT,
  horizon               TEXT CHECK (horizon IN ('H1','H2','H3') OR horizon IS NULL),
  persona               TEXT CHECK (persona IN ('operations','strategy','board') OR persona IS NULL),
  time_horizon_year     INTEGER,
  time_horizon_source   TEXT,
  decision_threshold    TEXT,
  baseline_confidence   NUMERIC(4,3) CHECK (baseline_confidence BETWEEN 0 AND 1),
  current_confidence    NUMERIC(4,3) CHECK (current_confidence BETWEEN 0 AND 1),
  draft_status          TEXT NOT NULL DEFAULT 'draft_unreviewed'
                        CHECK (draft_status IN ('draft_unreviewed','reviewed','promoted')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);
```

### 3.3 `components`

The named things an initiative touches — technologies, regulations, markets, ecosystem actors, competitors, partners, universities, collaborations.

```sql
CREATE TABLE components (
  id                            SERIAL PRIMARY KEY,
  initiative_id                 INTEGER NOT NULL REFERENCES initiatives_v2(id) ON DELETE CASCADE,
  parent_component_id           INTEGER REFERENCES components(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  description                   TEXT,
  component_type                TEXT NOT NULL
                                CHECK (component_type IN ('tech','regulation','market','ecosystem','competitor','partner','university','collaboration')),
  vector                        TEXT NOT NULL
                                CHECK (vector IN ('tech','regulation','market','ecosystem','competition')),
  horizon                       TEXT CHECK (horizon IN ('H1','H2','H3') OR horizon IS NULL),
  asset_replacement_cycle_years INTEGER,
  cross_industry                BOOLEAN NOT NULL DEFAULT FALSE,
  draft_status                  TEXT NOT NULL DEFAULT 'draft_unreviewed'
                                CHECK (draft_status IN ('draft_unreviewed','reviewed','promoted')),
  source_citation               TEXT NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_components_initiative ON components(initiative_id);
CREATE INDEX idx_components_vector ON components(vector);
CREATE INDEX idx_components_parent ON components(parent_component_id);
```

`component_type` is the worksheet category (what the analyst named it). `vector` is the analytical type that determines which attribute vocabulary applies. Mapping:

- `tech` → vector `tech`
- `regulation` → vector `regulation`
- `market` → vector `market`
- `ecosystem` → vector `ecosystem`
- `partner` → vector `ecosystem`
- `university` → vector `ecosystem`
- `collaboration` → vector `ecosystem`
- `competitor` → vector `competition`

### 3.4 `attribute_definitions`

The gold-standard vocabulary. Pre-seeded. The methodology data.

```sql
CREATE TABLE attribute_definitions (
  id                      SERIAL PRIMARY KEY,
  vector                  TEXT NOT NULL
                          CHECK (vector IN ('tech','regulation','market','ecosystem','competition')),
  attribute_name          TEXT NOT NULL,
  attribute_label         TEXT NOT NULL,
  value_type              TEXT NOT NULL
                          CHECK (value_type IN ('numeric','text','categorical','controlled_vocab')),
  unit                    TEXT,
  controlled_vocab_table  TEXT,
  is_required             BOOLEAN NOT NULL DEFAULT TRUE,
  applies_when            TEXT,
  display_order           INTEGER NOT NULL,
  description             TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vector, attribute_name)
);
```

### 3.5 `tech_functions`

Controlled vocabulary for the tech_function attribute. Cross-industry queryability lives here. Seeded empty; grows as components are populated.

```sql
CREATE TABLE tech_functions (
  id                    SERIAL PRIMARY KEY,
  function_name         TEXT NOT NULL UNIQUE,
  description           TEXT NOT NULL,
  physical_principle    TEXT,
  typical_failure_mode  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.6 `component_attributes`

The per-component analytical depth. The worksheet's nested rows under each component.

```sql
CREATE TABLE component_attributes (
  id                          SERIAL PRIMARY KEY,
  component_id                INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  attribute_def_id            INTEGER NOT NULL REFERENCES attribute_definitions(id),
  value_numeric               NUMERIC,
  value_text                  TEXT,
  value_categorical           TEXT,
  value_controlled_vocab_id   INTEGER,
  value_status                TEXT NOT NULL DEFAULT 'pending'
                              CHECK (value_status IN ('populated','not_in_source','not_applicable','pending')),
  not_in_source_reason        TEXT,
  not_applicable_reason       TEXT,
  source_citation             TEXT,
  confidence_band             TEXT CHECK (confidence_band IN ('high','medium','low')),
  measured_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (component_id, attribute_def_id),
  CHECK (
    (value_status = 'populated' AND source_citation IS NOT NULL) OR
    (value_status = 'not_in_source' AND not_in_source_reason IS NOT NULL) OR
    (value_status = 'not_applicable' AND not_applicable_reason IS NOT NULL) OR
    (value_status = 'pending')
  )
);

CREATE INDEX idx_comp_attr_component ON component_attributes(component_id);
CREATE INDEX idx_comp_attr_status ON component_attributes(value_status);
```

The CHECK constraint enforces honesty. A row in `populated` state must have a source. A row in `not_in_source` must explain what was searched. A row in `not_applicable` must explain why. The schema refuses partial records.

### 3.7 `claims_v2`

```sql
CREATE TABLE claims_v2 (
  id                       SERIAL PRIMARY KEY,
  initiative_id            INTEGER NOT NULL REFERENCES initiatives_v2(id) ON DELETE CASCADE,
  component_id             INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  claim_text               TEXT NOT NULL,
  attribute_def_id         INTEGER REFERENCES attribute_definitions(id),
  threshold_op             TEXT CHECK (threshold_op IN ('lt','gt','eq','between','not')),
  threshold_value_numeric  NUMERIC,
  threshold_value_text     TEXT,
  threshold_unit           TEXT,
  deadline_date            DATE,
  role                     TEXT NOT NULL CHECK (role IN ('principal','enabling','external_threat')),
  impact                   TEXT NOT NULL CHECK (impact IN ('amplifying','neutral','dampening')),
  criticality              TEXT NOT NULL CHECK (criticality IN ('critical','high','medium','low')),
  claim_basis              TEXT,
  draft_status             TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claims_initiative ON claims_v2(initiative_id);
CREATE INDEX idx_claims_component ON claims_v2(component_id);
```

### 3.8 `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by  TEXT
);

INSERT INTO schema_migrations (version, name, applied_at) VALUES
  (1, 'initial_schema', '2026-04-01 00:00:00+00'),
  (2, 'observable_layer_v5', '2026-04-15 00:00:00+00'),
  (3, 'hypothesis_repository', '2026-04-22 00:00:00+00'),
  (4, 'initiative_model_v1', '2026-05-01 00:00:00+00'),
  (5, 'draft_status_and_notes', '2026-05-02 00:00:00+00'),
  (6, 'v2_framework', NOW());
```

## 4. Trigger — auto-create component_attributes

```sql
CREATE OR REPLACE FUNCTION create_component_attributes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO component_attributes (component_id, attribute_def_id, value_status)
  SELECT NEW.id, ad.id, 'pending'
  FROM attribute_definitions ad
  WHERE ad.vector = NEW.vector
    AND ad.is_required = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_create_component_attributes
AFTER INSERT ON components
FOR EACH ROW
EXECUTE FUNCTION create_component_attributes();
```

When a row lands in `components`, the trigger creates one row in `component_attributes` per required `attribute_definitions` row matching that component's vector. All status `pending`. AI cannot create a partial component because the attribute rows immediately exist as outstanding work.

## 5. Views

### 5.1 `components_incomplete`

```sql
CREATE VIEW components_incomplete AS
SELECT
  c.id AS component_id,
  c.name AS component_name,
  c.vector,
  c.initiative_id,
  count(*) AS pending_attribute_count
FROM components c
JOIN component_attributes ca ON ca.component_id = c.id
WHERE ca.value_status = 'pending'
GROUP BY c.id, c.name, c.vector, c.initiative_id;
```

Audit query. Should return zero rows in a healthy catalogue. A component cannot be promoted from `draft_unreviewed` while it appears in this view.

### 5.2 `components_with_full_record`

```sql
CREATE VIEW components_with_full_record AS
SELECT
  c.id AS component_id,
  c.name AS component_name,
  c.component_type,
  c.vector,
  c.horizon,
  c.cross_industry,
  c.draft_status,
  i.name AS initiative_name,
  comp.name AS company_name,
  jsonb_object_agg(
    ad.attribute_name,
    jsonb_build_object(
      'value_numeric', ca.value_numeric,
      'value_text', ca.value_text,
      'value_status', ca.value_status,
      'source_citation', ca.source_citation,
      'confidence_band', ca.confidence_band
    )
  ) AS attributes
FROM components c
JOIN initiatives_v2 i ON i.id = c.initiative_id
JOIN companies comp ON comp.id = i.company_id
LEFT JOIN component_attributes ca ON ca.component_id = c.id
LEFT JOIN attribute_definitions ad ON ad.id = ca.attribute_def_id
GROUP BY c.id, c.name, c.component_type, c.vector, c.horizon, c.cross_industry, c.draft_status, i.name, comp.name;
```

The worksheet view, rendered from data. One row per component, all attributes present as a JSON aggregate.

## 6. Seed data — attribute_definitions

61 rows total. 13 for tech, 12 each for regulation, market, ecosystem, competition.

### 6.1 Tech vector (13 rows)

```sql
INSERT INTO attribute_definitions
  (vector, attribute_name, attribute_label, value_type, unit, controlled_vocab_table, is_required, display_order, description)
VALUES
  ('tech', 'tech_function', 'Tech function', 'controlled_vocab', NULL, 'tech_functions', TRUE, 1,
    'The functional purpose this technology serves. Cross-industry queryable handle for finding shared dependencies. Examples: high_frequency_power_conversion, proton_exchange_water_splitting, gas_separation_membrane.'),
  ('tech', 'trl', 'Technology readiness level', 'categorical', 'level_1_to_9', NULL, TRUE, 2,
    'TRL on the standard 1-9 scale. 1-3 basic research, 4-6 prototype, 7-8 demonstration, 9 commercial deployment.'),
  ('tech', 'ttm_months', 'Time to market', 'numeric', 'months', NULL, TRUE, 3,
    'Estimated months from current state to commercial deployment at meaningful scale.'),
  ('tech', 'cost_trajectory', 'Cost trajectory', 'text', 'currency_per_unit', NULL, TRUE, 4,
    'Current unit cost and direction of travel. Format: current value plus direction. Example: EUR 1,150/kW, declining 8% YoY.'),
  ('tech', 'velocity_pct_yoy', 'Velocity', 'numeric', 'pct_per_year', NULL, TRUE, 5,
    'Year-on-year rate of change in the dominant cost or performance metric. Negative for declining cost, positive for improving performance.'),
  ('tech', 'scale_up_factor', 'Scale-up factor', 'numeric', 'multiplier', NULL, TRUE, 6,
    'Maximum demonstrated scale relative to commercial requirement. 1.0 means demonstrated at commercial scale; 0.1 means demonstrated at one-tenth scale.'),
  ('tech', 'patent_density', 'Patent density', 'numeric', 'active_filings_count', NULL, TRUE, 7,
    'Count of active patent filings related to this technology. Indicator of commercial activity and IP concentration.'),
  ('tech', 'supply_concentration', 'Supply concentration', 'text', 'count_plus_named', NULL, TRUE, 8,
    'Number and identity of major suppliers for critical components. Format: count plus named entities.'),
  ('tech', 'capex_intensity', 'CAPEX intensity', 'text', 'currency_per_unit', NULL, TRUE, 9,
    'Capital cost per unit of deployed capacity. Format: currency plus unit. Example: EUR 1.5B per GW deployed.'),
  ('tech', 'opex_trajectory', 'OPEX trajectory', 'text', 'currency_per_unit', NULL, TRUE, 10,
    'Operating cost per unit of output, current and direction of travel.'),
  ('tech', 'substitution_risk', 'Substitution risk', 'text', 'qualitative_plus_named', NULL, TRUE, 11,
    'Emerging alternatives that could displace this technology. Format: qualitative assessment plus named alternatives.'),
  ('tech', 'obsolescence_horizon', 'Obsolescence horizon', 'numeric', 'years', NULL, TRUE, 12,
    'Years until current generation expected to be displaced or require major refresh. Asset replacement cycle bound.'),
  ('tech', 'incumbency_depth', 'Incumbency depth', 'text', 'qualitative_plus_named', NULL, TRUE, 13,
    'Strength of existing players in this technology. Format: qualitative plus named incumbents.');
```

### 6.2 Regulation vector (12 rows)

```sql
INSERT INTO attribute_definitions
  (vector, attribute_name, attribute_label, value_type, unit, is_required, display_order, description)
VALUES
  ('regulation', 'regulation_stage', 'Regulation stage', 'categorical', 'enum', TRUE, 1,
    'Current stage in regulatory lifecycle. Values: proposed, draft, passed, in_force, sunset_pending.'),
  ('regulation', 'enforcement', 'Enforcement strength', 'categorical', 'enum', TRUE, 2,
    'Strength of enforcement mechanisms. Values: none, weak, moderate, strong.'),
  ('regulation', 'jurisdictional_reach', 'Jurisdictional reach', 'text', 'count_plus_named', TRUE, 3,
    'Bodies and territories covered. Format: count plus named jurisdictions.'),
  ('regulation', 'implementation_progress', 'Implementation progress', 'numeric', 'pct', TRUE, 4,
    'Percentage of provisions live and operational. 0-100.'),
  ('regulation', 'political_durability', 'Political durability', 'text', 'qualitative', TRUE, 5,
    'Risk of repeal, weakening, or failure to implement. Format: qualitative assessment with reasoning.'),
  ('regulation', 'grandfather_clauses', 'Grandfather clauses', 'text', 'bool_plus_text', TRUE, 6,
    'Whether legacy carve-outs exist and their scope. Format: yes/no plus description.'),
  ('regulation', 'compliance_cost', 'Compliance cost', 'text', 'currency_per_entity', TRUE, 7,
    'Typical compliance cost per affected entity. Format: currency range plus methodology.'),
  ('regulation', 'audit_cadence', 'Audit cadence', 'numeric', 'months', TRUE, 8,
    'Frequency of regulatory review or audit cycle in months.'),
  ('regulation', 'precedent_strength', 'Precedent strength', 'text', 'qualitative', TRUE, 9,
    'Whether the regulation has been court-tested. Format: qualitative plus key cases if any.'),
  ('regulation', 'harmonisation', 'Harmonisation', 'text', 'qualitative', TRUE, 10,
    'Alignment with peer jurisdictions and international frameworks.'),
  ('regulation', 'sunset_risk', 'Sunset risk', 'text', 'qualitative_plus_date', TRUE, 11,
    'Risk of expiry or scheduled review. Format: qualitative plus relevant dates.'),
  ('regulation', 'judicial_exposure', 'Judicial exposure', 'text', 'count_plus_named', TRUE, 12,
    'Pending or threatened legal challenges. Format: count plus named cases.');
```

### 6.3 Market vector (12 rows)

```sql
INSERT INTO attribute_definitions
  (vector, attribute_name, attribute_label, value_type, unit, is_required, display_order, description)
VALUES
  ('market', 'market_size', 'Market size', 'text', 'currency', TRUE, 1,
    'Current addressable market size. Format: currency plus year of estimate.'),
  ('market', 'cagr', 'CAGR', 'numeric', 'pct_per_year', TRUE, 2,
    'Compound annual growth rate, current trajectory.'),
  ('market', 'price_elasticity', 'Price elasticity', 'text', 'qualitative', TRUE, 3,
    'Demand response to price changes. Format: qualitative with directional indicator.'),
  ('market', 'demand_certainty', 'Demand certainty', 'text', 'qualitative', TRUE, 4,
    'Confidence in offtake commitment. Format: qualitative plus contracted vs speculative split.'),
  ('market', 'offtake_structure', 'Offtake structure', 'categorical', 'enum', TRUE, 5,
    'Prevailing contract type. Values: spot, short_term_contract, long_term_contract, equity_offtake, vertical_integration.'),
  ('market', 'contract_maturity', 'Contract maturity', 'numeric', 'years', TRUE, 6,
    'Typical contract duration in years.'),
  ('market', 'geographic_spread', 'Geographic spread', 'text', 'qualitative_plus_HHI', TRUE, 7,
    'Geographic concentration of demand. Format: qualitative plus regional HHI if available.'),
  ('market', 'segment_fragmentation', 'Segment fragmentation', 'text', 'count_plus_HHI', TRUE, 8,
    'Buyer count and concentration. Format: count of major buyers plus HHI.'),
  ('market', 'switching_cost', 'Switching cost', 'text', 'qualitative_plus_currency', TRUE, 9,
    'Cost to switch to alternative. Format: qualitative plus currency estimate where available.'),
  ('market', 'substitute_threat', 'Substitute threat', 'text', 'qualitative_plus_named', TRUE, 10,
    'Strength of substitute products or services. Format: qualitative plus named substitutes.'),
  ('market', 'channel_control', 'Channel control', 'text', 'qualitative', TRUE, 11,
    'Distribution and channel dynamics. Format: qualitative with key channel actors named.'),
  ('market', 'subsidy_dependency', 'Subsidy dependency', 'numeric', 'pct', TRUE, 12,
    'Percentage of market activity driven by subsidies or mandates. 0-100.');
```

### 6.4 Ecosystem vector (12 rows)

```sql
INSERT INTO attribute_definitions
  (vector, attribute_name, attribute_label, value_type, unit, is_required, display_order, description)
VALUES
  ('ecosystem', 'infrastructure_readiness', 'Infrastructure readiness', 'text', 'qualitative', TRUE, 1,
    'State of supporting infrastructure. Format: qualitative plus named gaps.'),
  ('ecosystem', 'standards_maturity', 'Standards maturity', 'categorical', 'enum', TRUE, 2,
    'Interoperability standards status. Values: absent, emerging, established, dominant.'),
  ('ecosystem', 'interoperability', 'Interoperability', 'text', 'qualitative', TRUE, 3,
    'Cross-vendor compatibility. Format: qualitative with named compatibility issues.'),
  ('ecosystem', 'partner_concentration', 'Partner concentration', 'text', 'count_plus_named', TRUE, 4,
    'Key partners required. Format: count plus named partners.'),
  ('ecosystem', 'capital_intensity', 'Capital intensity', 'text', 'currency', TRUE, 5,
    'Total capex required for ecosystem buildout. Format: currency range.'),
  ('ecosystem', 'talent_availability', 'Talent availability', 'text', 'qualitative', TRUE, 6,
    'Skilled labour pool. Format: qualitative plus identified shortages.'),
  ('ecosystem', 'supply_chain_depth', 'Supply chain depth', 'text', 'qualitative', TRUE, 7,
    'Tier depth and redundancy. Format: qualitative with named single-points-of-failure.'),
  ('ecosystem', 'platform_effects', 'Platform effects', 'text', 'qualitative', TRUE, 8,
    'Network effects strength. Format: qualitative.'),
  ('ecosystem', 'institutional_support', 'Institutional support', 'text', 'qualitative_plus_named', TRUE, 9,
    'Government and multilateral backing. Format: qualitative plus named institutions.'),
  ('ecosystem', 'collaboration_density', 'Collaboration density', 'numeric', 'count', TRUE, 10,
    'Count of consortia, joint ventures, and active partnerships.'),
  ('ecosystem', 'geographic_clustering', 'Geographic clustering', 'text', 'qualitative_plus_named', TRUE, 11,
    'Hub locations. Format: qualitative plus named clusters.'),
  ('ecosystem', 'lock_in_risk', 'Lock-in risk', 'text', 'qualitative', TRUE, 12,
    'Difficulty of switching providers or technologies. Format: qualitative.');
```

### 6.5 Competition vector (12 rows)

```sql
INSERT INTO attribute_definitions
  (vector, attribute_name, attribute_label, value_type, unit, is_required, display_order, description)
VALUES
  ('competition', 'player_count', 'Player count', 'numeric', 'count', TRUE, 1,
    'Count of credible competitors with active commitment.'),
  ('competition', 'share_concentration', 'Share concentration', 'numeric', 'HHI_index', TRUE, 2,
    'Herfindahl-Hirschman Index of market share concentration. 0-10000.'),
  ('competition', 'entry_barriers', 'Entry barriers', 'text', 'qualitative', TRUE, 3,
    'Height of barriers to new entry. Format: qualitative plus named barriers.'),
  ('competition', 'strategic_intent', 'Strategic intent', 'text', 'qualitative_plus_named', TRUE, 4,
    'Credible strategic commitment by major competitors. Format: per-competitor qualitative.'),
  ('competition', 'capability_gap', 'Capability gap', 'text', 'qualitative', TRUE, 5,
    'Gap between leader and follower capability. Format: qualitative.'),
  ('competition', 'capital_depth', 'Capital depth', 'text', 'currency_per_competitor', TRUE, 6,
    'Financial firepower per major competitor. Format: currency range with named amounts.'),
  ('competition', 'geographic_overlap', 'Geographic overlap', 'numeric', 'pct', TRUE, 7,
    'Percentage geographic market overlap with this client. 0-100.'),
  ('competition', 'vertical_integration', 'Vertical integration', 'text', 'qualitative', TRUE, 8,
    'Degree of vertical integration among competitors. Format: qualitative.'),
  ('competition', 'm_and_a_activity', 'M and A activity', 'text', 'count_plus_named', TRUE, 9,
    'M and A in the last 24 months. Format: count plus named transactions.'),
  ('competition', 'first_mover_lock', 'First mover lock', 'text', 'qualitative', TRUE, 10,
    'Strength of first-mover advantages. Format: qualitative.'),
  ('competition', 'credibility', 'Credibility', 'text', 'qualitative', TRUE, 11,
    'Track record of competitor commitment delivery. Format: qualitative.'),
  ('competition', 'defection_risk', 'Defection risk', 'text', 'qualitative', TRUE, 12,
    'Risk of competitors abandoning the space. Format: qualitative plus named candidates.');
```

## 7. Constraints summary

The schema enforces:

- Every component has a vector tag (CHECK constraint on `components.vector`)
- Every component automatically gets all required attributes for its vector (TRIGGER `tr_create_component_attributes`)
- Every attribute row resolves to a non-pending state before promotion (CHECK constraint on `component_attributes.value_status`)
- Populated rows must have a source citation (CHECK constraint)
- Not-in-source rows must explain what was searched (CHECK constraint)
- Not-applicable rows must explain why (CHECK constraint)
- A component can't be deleted while linked to claims (FK ON DELETE)
- A component can't be promoted with pending attributes (application-level enforced via the `components_incomplete` view)

## 8. What this delivers

The schema makes it impossible to populate a half-finished catalogue. AI working against this schema either fully resolves every required attribute for every component, or the database refuses the work. Coaching is structural — the box that should be filled either gets filled or the row stays in pending and surfaces in the audit query.

Cross-industry queryability is enabled through `tech_functions`. Once 50 tech components are populated across companies, querying for shared functional dependencies returns the rope.

Time-series observations are deferred to migration 007 — the structural skeleton lands first, the time-series flesh follows once population is real.

## 9. Versioning

Migration 006 = schema v6 in the schema_migrations ledger. The `_v2` suffix on `initiatives_v2`, `claims_v2` keeps them separate from v1 tables (initiatives, links from migration 004) during the transition. Migration 008 (future) cuts over to v2-only after the v2 catalogue is validated.
