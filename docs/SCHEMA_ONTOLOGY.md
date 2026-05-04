# SCHEMA_ONTOLOGY — technology × application ontology layer

**Version:** 1.0
**Status:** Specification document. The cross-client compounding asset. Sits ABOVE client catalogues (`components`, `claims_v2`, `component_attributes`); referenced by them.
**Audience:** anyone implementing migration 012 or populating ontology rows from a client initiative.
**Reading order:** read after `SCHEMA_V3.md`. The ontology layer assumes the v3 framework exists — this document specifies what sits above it.

**Architectural principle.** Client catalogues describe what a specific company is doing (Shell's Industrial CCUS initiative, BP's blue hydrogen, EDF's nuclear EPR). The ontology describes what the world is doing — the canonical (technology × application) pairs that make up the technology landscape, classified by horizon and carrying evidence trails. A client component points to one or more ontology pairs. When BP and Shell both bet on `post_combustion_amine × industrial_point_source_decarbonisation`, that is the same ontology pair seen from two client angles, not two duplicate rows.

---

## 1. Why this layer exists

The v3 catalogue was designed initiative-first, client-specific. That works for surfacing one client's posture. It does not compound across clients.

Three concrete failures absent the ontology:

- **Cross-client signal routing duplicates work.** A 45Q sunset signal hits Shell's `US_45Q_TAX_CREDIT` and BP's `US_45Q_TAX_CREDIT` as two independent entities. Sonnet has to assess the impact twice; the analyst has to review twice. The ontology gives both clients' components a single canonical regulatory anchor, so the assessment runs once and routes twice.

- **H3 surfacing is not real without a horizon-bearing structure ABOVE the client catalogue.** A client's components carry `state` and `trajectory` but those are derived from the client's strategic posture. The ontology carries horizon classification (H1/H2/H3) at the *industry* level — what is the (technology × application) pair *actually* at, regardless of what any one company is doing. That is the layer that lets the system answer "show me everywhere this client is exposed to H3 dependencies" with SQL.

- **Adjacency analysis has no home.** "Post-combustion amine for industrial point-source decarbonisation" is adjacent to "post-combustion amine for power-sector decarbonisation" (same tech, different application) and to "DAC for CDR voluntary market" (substitute pathway for the same end goal). Without an ontology layer, those adjacencies are buried in component prose. With it, adjacency walks are SQL.

The ontology is the cross-client compounding asset. Each client catalogue references it; populating one client adds evidence and adjacencies that benefit every other.

## 2. Architectural relationship to v3

```
┌─────────────────────────────────────────────────────────────────┐
│  ONTOLOGY LAYER (this document)                                 │
│  ─────────────────────────────────────────────────              │
│  technologies  applications  technology_application_pairs       │
│  pair_evidence  pair_adjacencies                                │
│  Cross-client. Horizon-classified. Evidence-bearing.            │
└─────────────────────────┬───────────────────────────────────────┘
                          │ component_pair_links
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT CATALOGUE (SCHEMA_V3, migrations 008/011)               │
│  ─────────────────────────────────────────────────              │
│  initiatives_v2  components  component_attributes  claims_v2    │
│  initiative_assumptions  strategic_tensions  reframings         │
│  Client-specific. Initiative-first. Posture-bearing.            │
└─────────────────────────────────────────────────────────────────┘
```

The ontology never references a client component. The client component references one or more ontology pairs via `component_pair_links`. This direction matters: dropping a client (offboarding Shell) does not damage the ontology; dropping the ontology would break every client catalogue that depends on it. The ontology has greater longevity than any one client engagement.

`tech_functions` (existing v3 vocabulary) sits BETWEEN the two layers conceptually. A `tech_function` is a physical-principle vocabulary entry; the ontology's `technologies` table extends each `tech_function` into one or more named technology variants suitable for pairing with applications. `tech_function = industrial_post_combustion_co2_capture` is one row; the corresponding `technologies` rows are `post_combustion_amine_capture`, `post_combustion_solvent_next_gen`, `post_combustion_membrane`, etc. — the operational variants the market actually distinguishes.

## 3. Core tables

### 3.1 technologies

Canonical technology entries. One row per recognisably distinct technology, identified by name and tied (where applicable) to a `tech_function` for the physical-principle layer.

```sql
CREATE TABLE technologies (
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

CREATE INDEX idx_technology_function ON technologies(tech_function_id);
CREATE INDEX idx_technology_trl ON technologies(current_trl) WHERE current_trl IS NOT NULL;
```

`technology_name` is canonical (snake_case, stable, joinable). `technology_label` is the analyst-readable rendering. `tech_function_id` is nullable because some technologies span multiple tech_functions (e.g. integrated capture-and-storage offerings).

### 3.2 applications

Canonical applications — the end-uses or markets a technology serves. Decoupled from technology so a single technology can be paired with multiple applications.

```sql
CREATE TABLE applications (
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

CREATE INDEX idx_application_domain ON applications(application_domain);
CREATE INDEX idx_application_maturity ON applications(market_maturity);
```

`application_domain` is high-level routing (industrial vs power vs transport). `market_maturity` is the application's standing as a market, separate from any one technology's standing within it.

### 3.3 technology_application_pairs

The heart of the ontology. Each row is a (technology × application) pair carrying horizon classification, confidence, trajectory, and a free-text reasoning column for analyst defensibility.

```sql
CREATE TABLE technology_application_pairs (
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
  hard_evidence_count      INTEGER NOT NULL DEFAULT 0,  -- v10.1 (migration 013); maintained by trigger on pair_evidence
  draft_status             TEXT NOT NULL DEFAULT 'draft_unreviewed',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (technology_id, application_id)
);

CREATE INDEX idx_pair_horizon ON technology_application_pairs(horizon);
CREATE INDEX idx_pair_confidence ON technology_application_pairs(confidence_band);
CREATE INDEX idx_pair_trajectory ON technology_application_pairs(trajectory);
CREATE INDEX idx_pair_flagged ON technology_application_pairs(is_flagged_for_review) WHERE is_flagged_for_review = TRUE;
CREATE INDEX idx_pair_technology ON technology_application_pairs(technology_id);
CREATE INDEX idx_pair_application ON technology_application_pairs(application_id);
```

Constraints:

- `horizon` is the structural classification per the rubric in `/docs/methodology/ontology_population_procedure.md` Step 3. H1/H2/H3 only — no "transitional" — pairs that straddle a horizon boundary go into the lower horizon and carry that explicitly in `horizon_reasoning`.
- `confidence_band` defaults to `medium`. `low` MUST set `is_flagged_for_review = TRUE` with `flag_reason` populated (per methodology Step 6).
- `last_reclassified_at` updates on every horizon change. The trajectory and reclassification cadence are how the ontology stays current under signal flow.
- `pair_label` is the analyst-readable rendering ("Post-combustion amine capture × industrial point-source decarbonisation"); `(technology_id, application_id)` is the structural identifier.

### 3.4 pair_evidence

Each pair must carry at least one evidence row. Evidence is auditable: type, citation, URL, recorded date.

```sql
CREATE TABLE pair_evidence (
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

CREATE INDEX idx_pair_evidence_pair ON pair_evidence(pair_id);
CREATE INDEX idx_pair_evidence_type ON pair_evidence(evidence_type);
CREATE INDEX idx_pair_evidence_strength ON pair_evidence(evidence_strength);
```

Confidence band → evidence type mapping (per methodology):

- **high confidence** requires ≥2 `evidence_type IN ('peer_reviewed','company_filing','government_data')` rows with `evidence_strength = 'high'`
- **medium confidence** requires ≥1 row with `evidence_type IN ('analyst_report','industry_body','operator_disclosure')` and `evidence_strength >= 'medium'`
- **low confidence** when only `news` or `other` evidence is available, OR when sources conflict materially

`supports_horizon` is nullable to allow generic background evidence (TRL benchmarks, market sizing) that does not itself argue a specific horizon.

### 3.5 pair_adjacencies

Adjacency edges between pairs. Walks let the analyst answer "what's structurally near this bet?"

```sql
CREATE TABLE pair_adjacencies (
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
  CHECK (source_pair_id != target_pair_id),
  UNIQUE (source_pair_id, target_pair_id, adjacency_type)
);

CREATE INDEX idx_adjacency_source ON pair_adjacencies(source_pair_id);
CREATE INDEX idx_adjacency_target ON pair_adjacencies(target_pair_id);
CREATE INDEX idx_adjacency_type ON pair_adjacencies(adjacency_type);
```

Adjacency types defined:

- `same_technology_different_application` — post-combustion amine capture × industrial point-source ↔ post-combustion amine capture × power sector
- `same_application_different_technology` — post-combustion amine × industrial point-source ↔ pre-combustion capture × industrial point-source
- `predecessor_successor` — first-generation amine capture ↔ next-generation solvent capture (the latter is the temporal heir)
- `substitute` — post-combustion amine capture × industrial point-source ↔ DAC × CDR voluntary market (different technology, different application, but the second is a substitute pathway for the same decarbonisation goal)
- `complement` — capture technology × industrial point-source ↔ CO2 transport infrastructure × industrial point-source (one pair enables the other)
- `subscale_to_scale` — pilot deployment of a tech × specific application ↔ commercial-scale deployment of the same tech × same application (used when both pilot and commercial appear as distinct pairs in early years)

Methodology requires ≥2 adjacencies per pair (per Step 4). Adjacencies are directional but the analyst-walking semantics treat them as bidirectional: the queries below all UNION source/target lookups.

### 3.6 component_pair_links

Linkage from v3 client catalogue (components) to ontology pairs.

```sql
CREATE TABLE component_pair_links (
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

CREATE INDEX idx_cpl_component ON component_pair_links(component_id);
CREATE INDEX idx_cpl_pair ON component_pair_links(pair_id);
CREATE INDEX idx_cpl_role ON component_pair_links(link_role);
```

`link_role` semantics:

- `primary` — this component is essentially "this client's instance of this pair" (Shell's Quest is a primary instance of `post_combustion_amine × industrial_point_source_decarbonisation`)
- `secondary` — the pair is a meaningful but not principal anchor (a regulatory component might link `secondary` to several pairs that depend on the regulation)
- `exposure_only` — the component is exposed to movement in this pair without being an instance of it (a market component exposed to substitution by a different pair)

A single component can link to multiple pairs (a `tech` component spanning two applications; a `regulation` component touching every pair within its jurisdictional reach). A single pair can link to many components across many clients — that is the cross-client compounding by design.

## 4. Horizon classification semantics

The horizon classification is the structural assignment that drives every downstream surfacing query. The full rubric lives in `/docs/methodology/ontology_population_procedure.md` Step 3 and is the source of truth for population work; the summary here exists for queryability.

| Horizon | Definition | Markers (any one is sufficient) |
|---------|------------|----------------------------------|
| **H1**  | Current commercial operation. The pair has commercial deployments at scale today. | Multiple commercial-scale deployments; FIDs taken with capacity coming online within 24 months; regulatory frameworks in force; capital flowing without subsidy gating |
| **H2**  | 3-7 year viability. The pair has demonstrated technical feasibility at pilot or first-commercial scale and is approaching or in early commercial conversion. | Pilot or first-of-a-kind operational; FIDs being considered 2026-2030; regulatory frameworks in late-stage development; cost trajectory clear; subsidy or policy support material but expected to remain in place through commercial transition |
| **H3**  | 5+ year structural. The pair carries technical or market uncertainty that puts commercial viability beyond a 5-year window from today. | Technology demonstrated but not at commercial scale; applications speculative or pre-FID at scale; regulatory frameworks formative or absent; cost trajectory unclear or unfavourable at current price points |

Critical disambiguations:

- **Same technology can be H1 in one application and H3 in another.** Post-combustion amine capture × industrial point-source decarbonisation is H2 (Quest, Northern Lights at FOAK commercial scale; subsidy-dependent, regulatory frameworks tightening). Post-combustion amine × power-sector decarbonisation is H3 (no commercial-scale operating; economics uncompetitive against renewables-plus-storage at current carbon prices).
- **H1 does not mean "low risk."** H1 means "operating at scale today." A regulation with strong implementation but weak political durability (45Q with IRA-repeal exposure) does not move out of H1 because of trajectory — trajectory is captured separately.
- **H3 does not mean "speculative" alone.** H3 covers structural uncertainty about whether commercial viability will be reached within the relevant strategic window. A high-TRL technology serving an application that has not yet emerged as a market is H3.

## 5. The heat-map view

The ontology drives a heat-map surface — for any client, show every pair the client touches, classified by horizon, with confidence bands and trajectory.

The supporting queries:

1. **Client × horizon heat map.** "Show me all pairs Shell touches, by horizon class and confidence band." Joins `component_pair_links` → `components` → `initiatives_v2` → `companies` and aggregates over `technology_application_pairs.horizon`.

2. **Cross-client overlap.** "Which pairs are touched by both Shell and BP?" Group by `pair_id`, count distinct `companies.id`, filter to ≥2.

3. **H3 exposure walk.** "For Shell, list every H3 pair touched plus its adjacencies — including pairs Shell does not yet touch." Walks `component_pair_links` for Shell to find anchor H3 pairs, then `pair_adjacencies` outward one hop.

4. **Trajectory-flagged pairs.** "Pairs where trajectory='weakening' OR is_flagged_for_review=TRUE, joined to clients exposed." Surface to the analyst as a daily review queue.

5. **Substitution risk surface.** "For each H1 or H2 pair Shell touches, show substitute pairs (adjacency_type='substitute') and their horizon. Substitutes that are H2 against an H1 incumbent are the substitution risk hotspots."

These queries land as views in a follow-on migration once the population set is large enough to support them; for migration 012 the schema supports them all but no view layer is added.

## 6. Acceptance test queries

The migration is validated against the following queries returning sensible results once Industrial CCUS is populated.

**Q1 — pair count by horizon and confidence:**

```sql
SELECT horizon, confidence_band, COUNT(*) AS pair_count
FROM technology_application_pairs
GROUP BY horizon, confidence_band
ORDER BY horizon, confidence_band;
```

**Q2 — flagged-for-review queue:**

```sql
SELECT tap.pair_label, tap.horizon, tap.confidence_band, tap.flag_reason,
       COUNT(pe.id) AS evidence_count
FROM technology_application_pairs tap
LEFT JOIN pair_evidence pe ON pe.pair_id = tap.id
WHERE tap.is_flagged_for_review = TRUE
GROUP BY tap.id, tap.pair_label, tap.horizon, tap.confidence_band, tap.flag_reason
ORDER BY tap.confidence_band, tap.pair_label;
```

**Q3 — Shell × ontology heat map:**

```sql
SELECT i.name AS initiative,
       c.name AS component,
       tap.pair_label,
       tap.horizon,
       tap.confidence_band,
       tap.trajectory,
       cpl.link_role
FROM components c
JOIN initiatives_v2 i ON i.id = c.initiative_id
JOIN companies co ON co.id = i.company_id
JOIN component_pair_links cpl ON cpl.component_id = c.id
JOIN technology_application_pairs tap ON tap.id = cpl.pair_id
WHERE co.name = 'Shell'
ORDER BY i.name, c.name, tap.horizon;
```

**Q4 — adjacency walk from a pair:**

```sql
WITH anchor AS (
  SELECT id FROM technology_application_pairs
  WHERE pair_label ILIKE 'Post-combustion amine%industrial point-source%'
)
SELECT a.adjacency_type, a.adjacency_strength,
       neighbour.pair_label AS neighbour_pair,
       neighbour.horizon AS neighbour_horizon,
       a.reasoning_text
FROM pair_adjacencies a
JOIN technology_application_pairs neighbour ON neighbour.id = a.target_pair_id
WHERE a.source_pair_id = (SELECT id FROM anchor)
UNION ALL
SELECT a.adjacency_type, a.adjacency_strength,
       neighbour.pair_label AS neighbour_pair,
       neighbour.horizon AS neighbour_horizon,
       a.reasoning_text
FROM pair_adjacencies a
JOIN technology_application_pairs neighbour ON neighbour.id = a.source_pair_id
WHERE a.target_pair_id = (SELECT id FROM anchor)
ORDER BY adjacency_type, adjacency_strength;
```

**Q5 — evidence quality audit:**

```sql
SELECT tap.pair_label, tap.confidence_band,
       COUNT(pe.id) AS evidence_count,
       COUNT(pe.id) FILTER (WHERE pe.evidence_type IN ('peer_reviewed','company_filing','government_data')) AS hard_evidence_count,
       COUNT(pe.id) FILTER (WHERE pe.evidence_strength = 'high') AS high_strength_count,
       COUNT(pe.id) FILTER (WHERE pe.source_url IS NOT NULL) AS evidence_with_url
FROM technology_application_pairs tap
LEFT JOIN pair_evidence pe ON pe.pair_id = tap.id
GROUP BY tap.id, tap.pair_label, tap.confidence_band
ORDER BY tap.confidence_band, tap.pair_label;
```

These five queries are the migration's contract. The migration is complete when all five execute successfully against the post-CCUS-population schema and return non-trivial rows.

## 7. Versioning

Migration 012 = schema v9.0 → v10.0. Tables prefixed `technologies`, `applications`, `technology_application_pairs`, `pair_evidence`, `pair_adjacencies`, `component_pair_links`. No existing v3 tables modified — additive only.

Subsequent migrations:

- **013** (planned) — population script for adjacent client (BP H3 hydrogen) reusing CCUS pairs where overlap exists. Adds rows, not schema.
- **014** (planned) — view layer for the heat-map surface, drawn from the queries above.
- **015** (planned) — soft-data integration. `pair_evidence` extended to FK `mini_signals_v3` so the signal pipeline can mark pairs with reinforcing/contradicting evidence as it runs.

## 8. Discipline

Every operation against the ontology is governed by `/docs/methodology/ontology_population_procedure.md`. The procedure is binding:

- No pair without explicit horizon classification per the Step 3 rubric
- No pair without ≥1 specific source citation (no "industry knowledge")
- No pair without ≥2 adjacencies recorded
- `confidence_band='low'` triggers automatic flag with `flag_reason` populated
- Every population run reports back to the self-marking output specified in Step 7

The methodology document is the source of truth for population work; this schema document is the source of truth for the structure being populated.
