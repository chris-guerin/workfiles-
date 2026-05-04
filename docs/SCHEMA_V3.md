# SCHEMA_V3 — queryable framework specification

**Version:** 3.0
**Status:** Specification document. The framework that makes the catalogue analytically operable. Replaces SCHEMA_V2 as the system's primary architectural reference.
**Audience:** Anyone implementing migration 008 and building the signals framework. Specifically Claude Code.
**Reading order:** This document supersedes SCHEMA_V2 for forward design but does not invalidate v2's tables — it restructures their fields and adds the framework that consumes them.

**Architectural principle:** Reasoning happens at the edges. Structuring at the front (Haiku extracts mini_signals into structured fields). Generation at the back (Claude writes emails from structured impacts). Everything in between is SQL. The matching layer that connects mini_signals to catalogue points is data work, not reasoning work — defensible, auditable, deterministic.

---

## 1. Why this exists

The v2 catalogue captured analytical content as prose in text fields. `value_text = "EUR 1,150/kW, declining 8% YoY"` carried analytical data the framework couldn't query against. The result: a catalogue that looks like a database but behaves like a document store with categorical metadata. About 30% of v2's analytical content was queryable; 70% was prose.

Queries that should answer themselves from the catalogue today cannot:

- "How many initiatives are exposed to EU 45Q changes?" — requires structured regulatory-instrument references on components
- "What happens if PEM electrolysis TRL moves from 4 to 7?" — requires structured TRL values and structured threshold operations on claims
- "Show me all attributes that moved more than 10% in the past 30 days" — requires a time-series observations layer
- "Which Shell components share tech_function with BP components?" — requires queryable controlled vocabulary, which exists, but needs surfacing through joins

V3 fixes the underlying structure so SQL can answer questions today's reasoning has to invent.

V3 also adds the missing operational layer: the framework that takes a mini_signal, queries the catalogue to find what it touches, runs LLM interpretation only on validated matches, and generates personalised executive emails per matched impact. This is the system's actual product. Without it the catalogue is decoration.

## 2. The framework, named cleanly

Three pieces, each one queryable structure:

**Catalogue side (restructured from v2).** Components, claims, attributes — but with prose decomposed into structured columns enforceable by attribute_definition.value_type. Reasoning text attached to categorical assignments rather than embedded in them. Claims with structured threshold + attribute references mandatory.

**Mini_signal side (new structure).** Each mini_signal stored as structured extraction fields: named entities, referenced attribute types, quantitative values with units, geographic and temporal scope, signal type. Haiku does the extraction at WF-15A time using a controlled vocabulary that matches the catalogue's vocabularies.

**Matching infrastructure (new).** SQL queries that join structured mini_signals against structured catalogue. Tables that hold the matches as data: signal_candidate_matches, signal_claim_impacts, attribute_observations, generated_signals, generated_emails. Each table is the audit trail of one stage of the framework's operation.

The framework's operational flow:

```
WF-WeeklyNews ingestion
  → Haiku: quality filter (2,000 items → 80 mini_signals)
  → Haiku: structured extraction (80 prose mini_signals → 80 structured rows)
  → INSERT INTO mini_signals_v3
WF-Signal-Routing (new workflow)
  → SQL: match by direct entity → INSERT INTO signal_candidate_matches
  → SQL: match by attribute reference → INSERT INTO signal_candidate_matches
  → SQL: match by tech_function → INSERT INTO signal_candidate_matches
  → SQL: match by dependency edge → INSERT INTO signal_candidate_matches
  → For each candidate match:
    → Sonnet: assess claim impact → INSERT INTO signal_claim_impacts
    → If material: INSERT INTO attribute_observations
    → If material: INSERT INTO generated_signals
  → For each generated_signal:
    → SQL: route to contacts by company × persona
    → For each (signal × contact):
      → Sonnet: write email → INSERT INTO generated_emails (status='draft')
WF-Email-Delivery (separate, async)
  → Pull from generated_emails WHERE status='draft' AND reviewed=true
  → Send via mail merge
  → UPDATE generated_emails SET status='sent', sent_at
```

LLMs do two things only: structure unstructured input at the front, generate prose output at the back. Everything in between is SQL.

## 3. Migration 008 — catalogue restructure

### 3.1 component_attributes restructure

The current `component_attributes.value_text` carries prose-with-embedded-data. Decompose into structured columns. Existing `value_numeric` stays; existing `value_text` stays as the analyst-readable rendering; new structured columns hold the queryable data.

```sql
ALTER TABLE component_attributes
  ADD COLUMN value_unit              TEXT,
  ADD COLUMN velocity_pct_yoy        NUMERIC,
  ADD COLUMN velocity_direction      TEXT
    CHECK (velocity_direction IN ('rising','falling','stable','volatile') OR velocity_direction IS NULL),
  ADD COLUMN as_of_date              DATE,
  ADD COLUMN reasoning_text          TEXT;
```

For attributes where `attribute_definitions.value_type = 'numeric'`, populating require:
- `value_numeric` not null
- `value_unit` not null when the attribute has a unit
- `as_of_date` not null when status is 'populated'

For attributes where `attribute_definitions.value_type = 'categorical'`, populating require:
- `value_categorical` not null (already exists, currently barely used)

For attributes where `attribute_definitions.value_type = 'controlled_vocab'`, populating require:
- `value_controlled_vocab_id` not null (already exists)

A new CHECK constraint enforces the value_type contract:

```sql
ALTER TABLE component_attributes
  ADD CONSTRAINT value_type_contract CHECK (
    value_status != 'populated' OR (
      (
        attribute_def_id IN (SELECT id FROM attribute_definitions WHERE value_type = 'numeric')
        AND value_numeric IS NOT NULL AND as_of_date IS NOT NULL
      )
      OR
      (
        attribute_def_id IN (SELECT id FROM attribute_definitions WHERE value_type = 'categorical')
        AND value_categorical IS NOT NULL
      )
      OR
      (
        attribute_def_id IN (SELECT id FROM attribute_definitions WHERE value_type = 'controlled_vocab')
        AND value_controlled_vocab_id IS NOT NULL
      )
      OR
      (
        attribute_def_id IN (SELECT id FROM attribute_definitions WHERE value_type = 'text')
        AND value_text IS NOT NULL
      )
    )
  );
```

Note: the constraint above uses subqueries which PG CHECK constraints don't directly support. In implementation, this becomes a BEFORE INSERT/UPDATE trigger that enforces the same logic, raising an exception on violation.

### 3.2 claims_v2 restructure

Claims must have structured threshold + attribute reference for the framework to query against. Today ~56% do; the rest are prose-only.

```sql
ALTER TABLE claims_v2
  ALTER COLUMN attribute_def_id SET NOT NULL,
  ALTER COLUMN threshold_op SET NOT NULL,
  ADD COLUMN threshold_direction TEXT
    CHECK (threshold_direction IN ('toward_threshold_increases_confidence',
                                    'toward_threshold_decreases_confidence',
                                    'crossing_falsifies',
                                    'crossing_validates')
           OR threshold_direction IS NULL);

ALTER TABLE claims_v2
  ADD CONSTRAINT structured_threshold CHECK (
    threshold_value_numeric IS NOT NULL OR threshold_value_text IS NOT NULL
  );
```

Existing prose-only claims back-fill: re-population pass walks each claim, parses prose into structured threshold via Haiku, validates, populates structured fields. claim_text remains for human reading.

### 3.3 Reasoning capture columns

State and trajectory carry categorical values (good for query) but no structured reasoning (bad for audit). Add reasoning_text columns to every categorical assignment that drives analytical decisions.

```sql
ALTER TABLE initiatives_v2
  ADD COLUMN state_reasoning      TEXT,
  ADD COLUMN trajectory_reasoning TEXT;

ALTER TABLE components
  ADD COLUMN state_reasoning      TEXT,
  ADD COLUMN trajectory_reasoning TEXT;

ALTER TABLE claims_v2
  ADD COLUMN criticality_reasoning TEXT,
  ADD COLUMN impact_reasoning      TEXT;
```

When state is 'weakening', the reasoning column captures the analyst's why-this-state in 2-3 sentences. The categorical value drives queries; the reasoning makes the assignment defensible.

### 3.4 Component dependencies (new table)

For impact propagation queries — "if X changes, what's affected" — the catalogue needs explicit dependency edges between components. Today these live in prose if anywhere.

```sql
CREATE TABLE component_dependencies (
  id                 SERIAL PRIMARY KEY,
  source_component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  target_component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  dependency_type    TEXT NOT NULL
    CHECK (dependency_type IN ('regulatory','supply','technology','market','commercial','political','geographic')),
  dependency_strength TEXT NOT NULL
    CHECK (dependency_strength IN ('critical','high','medium','low')),
  description        TEXT NOT NULL,
  source_citation    TEXT NOT NULL,
  draft_status       TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_component_id != target_component_id),
  UNIQUE (source_component_id, target_component_id, dependency_type)
);

CREATE INDEX idx_dep_source ON component_dependencies(source_component_id);
CREATE INDEX idx_dep_target ON component_dependencies(target_component_id);
CREATE INDEX idx_dep_type ON component_dependencies(dependency_type);
```

Methodology: when populating a component, surface its dependencies on other components within and across initiatives. The matching framework uses this to walk impact: "regulatory change to RED III affects Component A which depends on Component B which is referenced by Initiative C."

Population is incremental — Shell first, then BP, then EDF. Dependencies that span clients become possible as more catalogue is populated.

### 3.5 Tech function attributes (extension)

`tech_functions` exists as controlled vocabulary. Extend it with structured properties so signals can route by function attributes, not just function name:

```sql
ALTER TABLE tech_functions
  ADD COLUMN current_trl              INTEGER CHECK (current_trl BETWEEN 1 AND 9),
  ADD COLUMN cost_trajectory_pct_yoy  NUMERIC,
  ADD COLUMN cost_trajectory_unit     TEXT,
  ADD COLUMN as_of_date               DATE,
  ADD COLUMN substitution_risk        TEXT
    CHECK (substitution_risk IN ('none','emerging','active','imminent') OR substitution_risk IS NULL);
```

This makes tech_functions a queryable centre of gravity. "Show me all components depending on tech_functions with current_trl < 7 and substitution_risk = 'active'" returns the components most exposed to tech-substitution risk across the entire catalogue.

## 4. Migration 008 — mini_signal structure (new)

The mini_signals table today carries prose. Restructure for query-first operation.

```sql
CREATE TABLE mini_signals_v3 (
  id                       SERIAL PRIMARY KEY,
  source_news_id           INTEGER REFERENCES news(id),
  signal_text              TEXT NOT NULL,
  signal_type              TEXT NOT NULL
    CHECK (signal_type IN ('announcement','decision','data_release','commitment',
                           'commentary','regulatory_change','financial_filing','other')),
  extracted_entities       JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_attribute_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_values         JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_geographic_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_temporal_scope_start DATE,
  extracted_temporal_scope_end   DATE,
  extracted_at             TIMESTAMPTZ NOT NULL,
  extraction_confidence    NUMERIC(4,3) CHECK (extraction_confidence BETWEEN 0 AND 1),
  extraction_model         TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
  source_url               TEXT,
  pub_date                 DATE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signal_entities_gin ON mini_signals_v3 USING GIN (extracted_entities);
CREATE INDEX idx_signal_attr_types_gin ON mini_signals_v3 USING GIN (extracted_attribute_types);
CREATE INDEX idx_signal_geo_gin ON mini_signals_v3 USING GIN (extracted_geographic_scope);
CREATE INDEX idx_signal_pub_date ON mini_signals_v3 (pub_date);
CREATE INDEX idx_signal_signal_type ON mini_signals_v3 (signal_type);
```

GIN indexes on the JSONB arrays make the matching SQL fast at scale. A query "find mini_signals where extracted_entities contains 'EU Hydrogen Bank'" runs in milliseconds against a million-row mini_signals table.

### 4.1 The Haiku extraction prompt

Structured output with controlled vocabulary. The prompt receives:

- The news item text
- The current attribute_definitions vocabulary (61 attribute_name values)
- The current tech_functions vocabulary
- A list of company and project names from the catalogue
- A list of regulatory instrument names referenced in the catalogue

Haiku outputs strict JSON conforming to a schema. No prose. If output doesn't validate against the schema, the extraction is rejected and the news item flagged for review.

```json
{
  "is_signal": true,
  "signal_type": "regulatory_change",
  "extracted_entities": ["EU Hydrogen Bank", "second auction round", "Shell"],
  "extracted_attribute_types": ["regulation_stage", "subsidy_dependency"],
  "extracted_values": {
    "regulation_stage": {
      "value": "in_force",
      "context": "second auction round closed"
    },
    "subsidy_dependency": {
      "value_numeric": 4.20,
      "value_unit": "EUR_per_kg",
      "context": "average strike price",
      "direction": "stable"
    }
  },
  "extracted_geographic_scope": ["EU"],
  "extracted_temporal_scope_start": "2026-04-15",
  "extracted_temporal_scope_end": "2026-04-15",
  "confidence": 0.85
}
```

The contract: extracted_attribute_types only contains values from the controlled vocabulary; extracted_entities are matched at SQL time against components.name, tech_functions.function_name, and a names-index built across the catalogue.

### 4.2 Names index (supporting structure)

For SQL matching of extracted_entities, a denormalised names table speeds joins:

```sql
CREATE TABLE catalogue_names (
  id              SERIAL PRIMARY KEY,
  entity_name     TEXT NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('component','tech_function','company','initiative','regulation','project','partner')),
  reference_id    INTEGER NOT NULL,
  reference_table TEXT NOT NULL,
  aliases         TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_names_entity ON catalogue_names(entity_name);
CREATE INDEX idx_names_aliases_gin ON catalogue_names USING GIN(aliases);
CREATE INDEX idx_names_lower ON catalogue_names(LOWER(entity_name));
```

Populated by trigger when components, tech_functions, etc are inserted. Aliases populated by analyst (e.g., "EU Hydrogen Bank" aliases include "European Hydrogen Bank", "EU H2 Bank", "Hydrogen Bank"). The matching SQL joins extracted_entities against this table for entity resolution.

## 5. Migration 008 — matching framework infrastructure

Five new tables for the framework's operational state.

### 5.1 signal_candidate_matches

```sql
CREATE TABLE signal_candidate_matches (
  id                  SERIAL PRIMARY KEY,
  mini_signal_id      INTEGER NOT NULL REFERENCES mini_signals_v3(id) ON DELETE CASCADE,
  component_id        INTEGER REFERENCES components(id) ON DELETE CASCADE,
  tech_function_id    INTEGER REFERENCES tech_functions(id) ON DELETE CASCADE,
  match_method        TEXT NOT NULL
    CHECK (match_method IN ('direct_name','attribute_reference','tech_function','dependency_chain','geographic_overlap')),
  match_strength      NUMERIC(4,3) NOT NULL CHECK (match_strength BETWEEN 0 AND 1),
  match_basis_text    TEXT NOT NULL,
  matched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (component_id IS NOT NULL OR tech_function_id IS NOT NULL)
);

CREATE INDEX idx_match_signal ON signal_candidate_matches(mini_signal_id);
CREATE INDEX idx_match_component ON signal_candidate_matches(component_id);
CREATE INDEX idx_match_method ON signal_candidate_matches(match_method);
```

Auditable: every match records why it matched. "Why was this signal routed to PEM electrolysis?" — answer: match_method='attribute_reference', match_basis_text='extracted_attribute_types contained "cost_trajectory" and PEM electrolysis has populated cost_trajectory attribute'.

### 5.2 signal_claim_impacts

```sql
CREATE TABLE signal_claim_impacts (
  id                       SERIAL PRIMARY KEY,
  mini_signal_id           INTEGER NOT NULL REFERENCES mini_signals_v3(id) ON DELETE CASCADE,
  candidate_match_id       INTEGER NOT NULL REFERENCES signal_candidate_matches(id) ON DELETE CASCADE,
  claim_id                 INTEGER NOT NULL REFERENCES claims_v2(id) ON DELETE CASCADE,
  impact_direction         TEXT NOT NULL
    CHECK (impact_direction IN ('toward_threshold','away_from_threshold','crossed_threshold','no_change')),
  impact_magnitude         NUMERIC(4,3) NOT NULL CHECK (impact_magnitude BETWEEN 0 AND 1),
  proximity_before         NUMERIC(4,3),
  proximity_after          NUMERIC(4,3),
  is_material              BOOLEAN NOT NULL,
  reasoning_text           TEXT NOT NULL,
  assessment_model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  assessed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessment_confidence    NUMERIC(4,3)
);

CREATE INDEX idx_impact_signal ON signal_claim_impacts(mini_signal_id);
CREATE INDEX idx_impact_claim ON signal_claim_impacts(claim_id);
CREATE INDEX idx_impact_material ON signal_claim_impacts(is_material) WHERE is_material = true;
```

This is where Sonnet's interpretation lands as data. Direction and magnitude are structured; reasoning_text is the analyst-readable rendering of the structured assessment. is_material is the boolean that determines whether this match becomes a generated signal.

### 5.3 attribute_observations

```sql
CREATE TABLE attribute_observations (
  id                  SERIAL PRIMARY KEY,
  component_id        INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  attribute_def_id    INTEGER NOT NULL REFERENCES attribute_definitions(id),
  value_numeric       NUMERIC,
  value_text          TEXT,
  value_unit          TEXT,
  observed_at         TIMESTAMPTZ NOT NULL,
  source_signal_id    INTEGER REFERENCES mini_signals_v3(id),
  source_url          TEXT,
  confidence_band     TEXT CHECK (confidence_band IN ('high','medium','low')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (observed_at);

CREATE TABLE attribute_observations_2026q2 PARTITION OF attribute_observations
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE attribute_observations_2026q3 PARTITION OF attribute_observations
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
-- (continue creating partitions per quarter as time advances)

CREATE INDEX idx_obs_component ON attribute_observations(component_id, attribute_def_id, observed_at DESC);
CREATE INDEX idx_obs_signal ON attribute_observations(source_signal_id);
```

Time-series. Partitioned by quarter so range queries scan only relevant partitions. Every observation links back to the mini_signal that produced it (when applicable). "Show me all attributes that moved more than 10% in past 30 days" runs against this table.

Designed for scale: at 50 clients × 1,500 components × monthly observations × 5 years = ~5 million rows. Quarterly partitioning keeps query time bounded.

### 5.4 generated_signals

```sql
CREATE TABLE generated_signals (
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

CREATE INDEX idx_gensig_company ON generated_signals(company_id, status);
CREATE INDEX idx_gensig_persona ON generated_signals(persona_target);
CREATE INDEX idx_gensig_status ON generated_signals(status, generated_at);
```

The actual signals the system produces. One row per (mini_signal × material claim impact). framing_text is the prose the analyst will see when reviewing; severity drives delivery treatment.

### 5.5 generated_emails

```sql
CREATE TABLE generated_emails (
  id                  SERIAL PRIMARY KEY,
  signal_id           INTEGER NOT NULL REFERENCES generated_signals(id) ON DELETE CASCADE,
  contact_id          INTEGER NOT NULL REFERENCES contacts(id),
  email_subject       TEXT NOT NULL,
  email_body          TEXT NOT NULL,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generation_model    TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','reviewed','sent','suppressed','bounced')),
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  delivery_method     TEXT,
  UNIQUE (signal_id, contact_id)
);

CREATE INDEX idx_email_status ON generated_emails(status, generated_at);
CREATE INDEX idx_email_contact ON generated_emails(contact_id);
```

One email per (generated_signal × contact). The 80→10→350 path lands here.

### 5.6 contacts (referenced by emails)

Existing infrastructure in the legacy Datasette holds 27,473 contacts. Bring into PG as part of migration 008.

```sql
CREATE TABLE contacts (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER REFERENCES companies(id),
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  role_title          TEXT,
  responsibility_area TEXT,
  persona_match       TEXT CHECK (persona_match IN ('operations','strategy','board') OR persona_match IS NULL),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  imported_from       TEXT,
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

CREATE TABLE contact_initiative_interests (
  contact_id          INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  initiative_id       INTEGER NOT NULL REFERENCES initiatives_v2(id) ON DELETE CASCADE,
  interest_strength   TEXT NOT NULL CHECK (interest_strength IN ('primary','secondary','watching')),
  PRIMARY KEY (contact_id, initiative_id)
);

CREATE INDEX idx_contacts_company ON contacts(company_id, active);
CREATE INDEX idx_contacts_persona ON contacts(persona_match);
CREATE INDEX idx_cii_initiative ON contact_initiative_interests(initiative_id);
```

The contact_initiative_interests table is what makes per-person email routing possible. John at Shell covers hydrogen and CCUS; Sarah covers EV charging. SQL routes a generated_signal to John or Sarah based on which initiatives they cover.

## 6. The matching SQL queries

The framework runs four match queries per mini_signal. Each writes structured candidate matches to signal_candidate_matches.

### 6.1 Direct name match

```sql
INSERT INTO signal_candidate_matches
  (mini_signal_id, component_id, match_method, match_strength, match_basis_text)
SELECT
  ms.id,
  cn.reference_id,
  'direct_name',
  0.95,
  'extracted_entity matched component name: ' || entity.value
FROM mini_signals_v3 ms
CROSS JOIN LATERAL jsonb_array_elements_text(ms.extracted_entities) AS entity(value)
JOIN catalogue_names cn ON (
  LOWER(cn.entity_name) = LOWER(entity.value)
  OR LOWER(entity.value) = ANY(SELECT LOWER(unnest(cn.aliases)))
)
WHERE cn.entity_type = 'component'
  AND cn.reference_table = 'components'
  AND ms.id = $1;  -- new mini_signal id
```

Direct hits — signal explicitly names a component. High match_strength, no Sonnet needed for the matching step.

### 6.2 Attribute reference match

```sql
INSERT INTO signal_candidate_matches
  (mini_signal_id, component_id, match_method, match_strength, match_basis_text)
SELECT DISTINCT
  ms.id,
  c.id,
  'attribute_reference',
  0.7,
  'extracted_attribute_types overlapped with populated attributes on component'
FROM mini_signals_v3 ms
CROSS JOIN LATERAL jsonb_array_elements_text(ms.extracted_attribute_types) AS attr_type(value)
JOIN attribute_definitions ad ON ad.attribute_name = attr_type.value
JOIN component_attributes ca ON ca.attribute_def_id = ad.id AND ca.value_status = 'populated'
JOIN components c ON c.id = ca.component_id
WHERE ms.id = $1;
```

Signals that reference attribute types (TRL, cost_trajectory, regulation_stage etc.) match all components that carry those attributes populated.

### 6.3 Tech function match

```sql
INSERT INTO signal_candidate_matches
  (mini_signal_id, component_id, tech_function_id, match_method, match_strength, match_basis_text)
SELECT DISTINCT
  ms.id,
  c.id,
  tf.id,
  'tech_function',
  0.6,
  'extracted_entity matched tech_function shared by this component'
FROM mini_signals_v3 ms
CROSS JOIN LATERAL jsonb_array_elements_text(ms.extracted_entities) AS entity(value)
JOIN tech_functions tf ON LOWER(tf.function_name) = LOWER(entity.value)
JOIN component_attributes ca ON ca.value_controlled_vocab_id = tf.id
JOIN components c ON c.id = ca.component_id
WHERE ms.id = $1;
```

Cross-industry queryability — a signal about "high frequency power conversion" hits every component depending on that tech_function across all clients.

### 6.4 Dependency chain match

```sql
INSERT INTO signal_candidate_matches
  (mini_signal_id, component_id, match_method, match_strength, match_basis_text)
SELECT DISTINCT
  ms.id,
  cd.target_component_id,
  'dependency_chain',
  CASE cd.dependency_strength
    WHEN 'critical' THEN 0.5
    WHEN 'high' THEN 0.4
    WHEN 'medium' THEN 0.3
    ELSE 0.2
  END,
  'matched via dependency_type=' || cd.dependency_type || ' from already-matched component'
FROM signal_candidate_matches scm
JOIN component_dependencies cd ON cd.source_component_id = scm.component_id
JOIN mini_signals_v3 ms ON ms.id = scm.mini_signal_id
WHERE scm.mini_signal_id = $1
  AND scm.match_method != 'dependency_chain'  -- avoid recursive cycles
  AND NOT EXISTS (
    SELECT 1 FROM signal_candidate_matches existing
    WHERE existing.mini_signal_id = scm.mini_signal_id
      AND existing.component_id = cd.target_component_id
  );
```

Walks one hop through the dependency graph. A signal that hits Component A propagates to Component B if A → B is a known dependency. Lower match_strength because the connection is indirect.

## 7. Acceptance tests — queries that must work

The framework is validated against a defined set of queries. These are the system's contract with the analyst.

**State queries** (today, post-migration 008):

```sql
-- Q1: Portfolio risk profile by state and trajectory
SELECT i.name, i.state, i.trajectory, i.current_confidence
FROM initiatives_v2 i
JOIN companies c ON c.id = i.company_id
WHERE c.name = 'Shell'
ORDER BY 
  CASE i.state 
    WHEN 'broken' THEN 1
    WHEN 'weakening' THEN 2
    WHEN 'ambiguous' THEN 3
    WHEN 'holding' THEN 4
    WHEN 'strengthening' THEN 5
    WHEN 'new' THEN 6
  END,
  i.current_confidence;

-- Q2: Components shared across initiatives via tech_function
SELECT tf.function_name, COUNT(DISTINCT c.id) AS component_count, 
       COUNT(DISTINCT i.id) AS initiative_count,
       COUNT(DISTINCT comp.id) AS company_count
FROM tech_functions tf
JOIN component_attributes ca ON ca.value_controlled_vocab_id = tf.id
JOIN components c ON c.id = ca.component_id
JOIN initiatives_v2 i ON i.id = c.initiative_id
JOIN companies comp ON comp.id = i.company_id
GROUP BY tf.id, tf.function_name
HAVING COUNT(DISTINCT comp.id) > 1
ORDER BY company_count DESC;

-- Q3: Claims approaching threshold
SELECT i.name, c.name AS component, cl.claim_text,
       cl.threshold_value_numeric, cl.threshold_unit,
       cl.deadline_date,
       (cl.deadline_date - CURRENT_DATE) AS days_to_deadline
FROM claims_v2 cl
JOIN components c ON c.id = cl.component_id
JOIN initiatives_v2 i ON i.id = cl.initiative_id
WHERE cl.deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '180 days'
  AND cl.threshold_value_numeric IS NOT NULL
ORDER BY cl.deadline_date;
```

**Movement queries** (after observations layer is fed):

```sql
-- Q4: Attributes that moved >10% in past 30 days
SELECT c.name, ad.attribute_name, ad.attribute_label,
       LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at) AS previous_value,
       ao.value_numeric AS current_value,
       (ao.value_numeric - LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at)) 
         / LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at) AS pct_change
FROM attribute_observations ao
JOIN components c ON c.id = ao.component_id
JOIN attribute_definitions ad ON ad.id = ao.attribute_def_id
WHERE ao.observed_at > NOW() - INTERVAL '30 days'
ORDER BY ABS(pct_change) DESC;
```

**Impact queries** (after dependency edges are populated):

```sql
-- Q5: If RED III delays by 12 months, which initiatives are affected?
WITH RECURSIVE impact_chain AS (
  SELECT c.id, c.name, c.initiative_id, 1 AS depth, 'direct'::TEXT AS path_type
  FROM components c
  WHERE c.name ILIKE '%RED III%'
  UNION ALL
  SELECT c2.id, c2.name, c2.initiative_id, ic.depth + 1, 
         CASE ic.depth WHEN 1 THEN 'first_order' ELSE 'second_order' END
  FROM impact_chain ic
  JOIN component_dependencies cd ON cd.source_component_id = ic.id
  JOIN components c2 ON c2.id = cd.target_component_id
  WHERE ic.depth < 3
)
SELECT DISTINCT i.name AS initiative, comp.name AS company,
       array_agg(DISTINCT ic.name) AS components_affected,
       MAX(ic.depth) AS max_chain_depth
FROM impact_chain ic
JOIN initiatives_v2 i ON i.id = ic.initiative_id
JOIN companies comp ON comp.id = i.company_id
GROUP BY i.id, i.name, comp.name
ORDER BY max_chain_depth, comp.name;
```

These five queries are the framework's acceptance test. Migration 008 is complete when each returns correct results. Each one corresponds to an analytical question that today requires reasoning and after migration 008 is answered by data.

## 8. Performance acceptance criteria

Designed for 50 clients (~30,000-50,000 catalogue rows, ~20,000 mini_signals over 5 years, ~5 million observations over 5 years).

- Q1, Q2, Q3 (state queries): under 50ms
- Q4 (movement query): under 500ms across 1 million observation rows
- Q5 (impact propagation): under 200ms across 5,000 dependency edges
- Mini_signal full match cycle (4 SQL queries × 1 mini_signal): under 100ms
- Weekly batch run (80 mini_signals × full matching): under 30 seconds

GIN indexes on JSONB arrays, B-tree indexes on FK columns and date columns, partitioning on observations by quarter. Standard PG techniques. Tested at 100k-row baseline before any client populated; should hold to 50-client scale.

## 9. Migration 008 phasing

Single migration but applied in three phases for rollback safety:

**Phase 1 (one PG transaction):** Add new columns to existing tables (component_attributes, claims_v2, initiatives_v2, components, tech_functions). Add new tables (mini_signals_v3, catalogue_names, contacts, contact_initiative_interests, signal_candidate_matches, signal_claim_impacts, attribute_observations, generated_signals, generated_emails, component_dependencies). Add indexes. Backfill schema_migrations.

**Phase 2 (separate transaction):** Add the value_type contract trigger and the populated → reasoning_text required validation. These are blocking — once added, dishonest data can't land.

**Phase 3 (one-shot script, not part of migration SQL):** Re-population pass. Walks every existing component_attribute and parses prose into structured columns via Haiku. Walks every existing claim_v2 and decomposes prose into structured threshold + attribute reference. Walks every state/trajectory assignment and back-fills reasoning_text from analyst notes if available, marks 'pending_review' otherwise. Validates against the contract, fails on rows that won't conform.

Phase 3 is where most time goes. Each existing v2 row needs Haiku to parse it. Cost: ~400 Haiku calls for full Shell back-fill. Cheap. Time: ~30 minutes if done as a batch.

## 10. Methodology updates required alongside migration 008

The schema enforces structure but methodology has to teach population against it.

**Update INITIATIVE_METHODOLOGY.md:**

- Step 4 (entity identification): for each entity, populate structured value fields, not just prose. AI has to extract value, unit, velocity, direction from sources rather than write prose.
- Step 7 (claim formulation): claims must structurally bind to attribute_def_id and threshold operation. Prose claim_text is the human rendering of the structured claim, not the source of truth.
- Step 9 (state and trajectory assignment): require reasoning_text alongside categorical value.
- New step 11 (component dependencies): for each component, identify its critical dependencies on other components. Populate component_dependencies with type and strength.
- New step 12 (tech_function attributes): when populating a component's tech_function attribute, ensure the referenced tech_function carries current TRL, cost trajectory, substitution risk.

**New methodology document — SIGNAL_FRAMEWORK_METHODOLOGY.md:**

Defines:
- The Haiku extraction prompt with controlled vocabulary references
- The four matching SQL queries and when each is used
- The Sonnet interpretation prompt for claim impact assessment
- The Sonnet email generation prompt with persona-specific framing
- Material threshold for signal generation (when does an impact warrant an email)
- Persona routing rules (which severity goes to which persona)
- Suppression logic (when does a signal get suppressed: duplicate, recently sent, low criticality batch)
- Review queue logic (analyst review of generated_signals before emails go out)

## 11. What this enables

After migration 008 + signals framework:

**Today's open questions become SQL:**

"How many initiatives are exposed to EU 45Q changes?" → `SELECT count(DISTINCT i.id) FROM initiatives_v2 i JOIN components c ON c.initiative_id = i.id JOIN catalogue_names cn ON cn.reference_id = c.id WHERE cn.entity_name = '45Q' OR '45Q' = ANY(cn.aliases)`

"What happens if PEM electrolysis TRL moves from 4 to 7?" → query attribute_observations for current TRL, query claims_v2 for any claim with threshold_op and threshold_value_numeric on TRL attribute against PEM electrolysis components, compute threshold proximity at TRL=7, return list of claims that would cross or approach threshold.

"Which Shell components share dependencies with BP components?" → join component_dependencies across initiatives across companies on overlapping target_component_id.

"Show me all signals received this week that moved attributes by >10%" → query attribute_observations joined to mini_signals where pct_change exceeds threshold and observed_at > NOW() - INTERVAL '7 days'.

**Operationally:**

Mini_signals arrive → SQL routes to catalogue points → Sonnet interprets material impacts → emails generate → analyst review queue → mail merge sends. End-to-end framework, fully audited, queryable at every stage.

**Architecturally:**

Reasoning happens at the edges. Structuring at the front, generation at the back. Everything in between is data. The system's behaviour is consistent week-to-week because SQL produces the same answer for the same input. Halucination cannot leak into the matching layer because matching is data work.

## 12. Versioning

Migration 008 = schema v8 in the schema_migrations ledger. Tables `_v3` suffix where they replace v2 tables (mini_signals_v3 alongside legacy mini_signals). Existing v2 tables stay (initiatives_v2, components, etc.) but gain new columns. Migration 009/010 future work: dependency population pass per company, methodology v3 documentation rollout, query layer rendered as analyst dashboard.

The acceptance test is the queries returning correct answers within the performance bounds. The framework is the operational pipeline. The substrate is the catalogue. All three together are the analytical engine the system has been pointing at since week one.
