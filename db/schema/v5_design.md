# Hypothesis register schema v5 — design document

**Status:** Phase 1 design draft, 28 April 2026 ~16:30 BST. For Chris review before Phase 2 SQL implementation.
**Supersedes:** `hypothesis_register_v4.sql` (28 April Phase 1 stand-down) and the 25 March "v4 FINAL" CSV/HTML schema.
**Cross-reference:** ARCHITECTURE.md Sections 3 (methodology), 8 (hypothesis register), 16 (Build E), 19.5 (R14, R15, R16). All four will be updated in Phase 2 per R25.

---

## 1. Purpose and framing

The Signal Engine's hypothesis register exists to do two jobs at once:

- **Function 1 — signal filter.** Per Section 3.5, "the hypothesis register is the filter; without the filter, there is no Signal Engine." Every signal entering the system is evaluated against the register's metric stacks and bucket conditions. This is the *inward* job: a noise-to-signal substrate aligned to R16's bucket invariants.
- **Function 2 — consulting instrument.** Per Section 12, "clients buy structured engagements that use the Signal Engine to validate their hypotheses." The register is also the substrate on which client-facing decision narratives are built. This is the *outward* job: decision framing, ownership, action, accounts.

Until 28 April these were assumed to be one schema. The 28 April diagnostic showed they are two layers of the same hypothesis. v5 unifies them deliberately rather than pretending one is a refactor of the other.

The unified schema has three sections:

- **Section A — core identity** (16 cols). The spine that joins the layers. Stable across both functions: identifier, register, sector, ownership, lifecycle state, audit timestamps.
- **Section B — decision layer** (30 cols). Outward-facing. The commercial framing: probability, decision, owner, threshold, if-true/if-false posture, target accounts, tags. Drawn primarily from the 25 March CSV/HTML.
- **Section C — bucket layer** (column count pending Q6/Q9 resolution). Inward-facing operational substrate aligning to R16's five canonical buckets (tech / cost / reg / eco / competitive). Drawn primarily from the 28 April live register, with `mkt_*` renamed to `cost_*` per R16 canonical naming. Geography handling and the missing competitive bucket are escalated as Q6 and Q9.

**Total: 76 columns under the leanest scenario** (Q6 option (c) drops `geo_*` and Q9 accepts the competitive gap → 73 cols), **up to ~80 cols** under the richest scenario (Q6 option (b) renames + adds `comp_*` → ~80 cols). Within the 75–90 target either way.

The register has 118 active rows (live count, 28 April). Hard cap remains 150 per Section 8.

---

## 2. Column inventory and source mapping

Legend for **Source** column:
- `25M` — present in 25 March CSV/HTML "v4 FINAL"
- `28A` — present in 28 April live Apps Script doGet
- `25M+28A` — present in both with the same name (16 columns)
- `25M→` — present in 25 March, renamed in v5 (specify rename)
- `28A→` — present in 28 April, renamed in v5
- `NEW` — new in v5, not in either source

| # | Column | Section | Type | NULL | Source | Notes |
|---|---|---|---|---|---|---|
| 1 | `hyp_id` | A | TEXT PK | NN | 25M+28A | Permissive format CHECK; tighten in v6 once register prefixes stabilise |
| 2 | `register` | A | TEXT | NN | NEW | ENUM CHECK: PERSONAL / INDUSTRY / SECTOR / CLIENT_ACCOUNT. Resolves Q5: explicit, not parsed from prefix |
| 3 | `sector` | A | TEXT | NN | 25M+28A | ENUM-ish: ENERGY / MOBILITY / CHEMICALS / LIFE_SCIENCES / FOOD / MANUFACTURING / CROSS |
| 4 | `system_layer` | A | TEXT | – | 25M+28A | Note: live header is `system_layer ` with trailing space; migration normalises |
| 5 | `hypothesis_theme` | A | TEXT | – | 25M+28A | CSV's `title` is collapsed into this column (semantic equivalence; no information loss seen in samples) |
| 6 | `owner` | A | TEXT | – | 25M+28A | Human owner; persona name e.g. "Chris Guerin" |
| 7 | `status` | A | TEXT | NN | 25M | ENUM CHECK: ACTIVE / RETIRED / DRAFT. Administrative; not the same as `phase` or `window_status` |
| 8 | `phase` | A | TEXT | NN | 28A | ENUM CHECK: DIVERGENT / CONVERGING / TRIGGER_READY / RESOLVED. Methodological per Section 3.4 / R6 |
| 9 | `schema_version` | A | TEXT | NN | NEW | Default 'v5'. Lets us evolve without losing provenance |
| 10 | `created_at` | A | TIMESTAMPTZ | NN | NEW | Default `now()` |
| 11 | `created_by` | A | TEXT | – | NEW | Audit trail |
| 12 | `last_updated` | A | TIMESTAMPTZ | – | 25M+28A | Promoted from TEXT; live and CSV both store as text today |
| 13 | `last_updated_by` | A | TEXT | – | NEW | Audit trail |
| 14 | `resolved_outcome` | A | TEXT | – | 25M | ENUM CHECK when not null: TRUE / FALSE / DISPLACED. Per Section 3.4. NULL until phase=RESOLVED |
| 15 | `resolved_date` | A | DATE | – | 25M | NULL until phase=RESOLVED |
| 16 | `notes` | A | TEXT | – | 25M+28A | |
| | | | | | | |
| 17 | `probability` | B | NUMERIC | – | 25M+28A | 0–100 |
| 18 | `confidence_score` | B | NUMERIC | – | 25M+28A | 0–100 |
| 19 | `urgency_score` | B | NUMERIC | – | 25M+28A | 0–100 |
| 20 | `probability_last_changed` | B | DATE | – | 25M | |
| 21 | `probability_last_changed_note` | B | TEXT | – | 25M | |
| 22 | `current_step` | B | INTEGER | – | 25M+28A | |
| 23 | `total_steps` | B | INTEGER | – | 25M | |
| 24 | `step_conditions` | B | TEXT | – | 25M+28A | |
| 25 | `window_status` | B | TEXT | – | 25M→ + 28A | CSV `window` → v5 `window_status` (matches live name). ENUM CHECK: open / closed / pending |
| 26 | `window_closes_at` | B | DATE | – | 25M→ + 28A→ | CSV `window_closes` → v5 `window_closes_at`; live `window_date` → v5 `window_closes_at`. Free-form strings ("Q4 2026") need parsing during migration |
| 27 | `horizon_months` | B | INTEGER | – | 25M+28A | |
| 28 | `decision_window_reason` | B | TEXT | – | 25M | |
| 29 | `decision_type` | B | TEXT | – | 25M | |
| 30 | `decision` | B | TEXT | – | 25M | The actual decision being made |
| 31 | `decision_threshold` | B | TEXT | – | 25M | Hypothesis-level evidence threshold; **distinct from per-metric thresholds** (resolves Q3) |
| 32 | `decision_owner_role` | B | TEXT | – | 25M | |
| 33 | `decision_owner_function` | B | TEXT | – | 25M | |
| 34 | `decision_owner_name` | B | TEXT | – | 25M | |
| 35 | `decision_if_true` | B | TEXT | – | 25M + 28A→ | live `if_true` → v5 `decision_if_true`. Resolves Q2: pick CSV name to match section convention |
| 36 | `decision_if_false` | B | TEXT | – | 25M + 28A→ | Same pattern as `decision_if_true` |
| 37 | `risk_if_wrong` | B | TEXT | – | 25M | |
| 38 | `upside_if_right` | B | TEXT | – | 25M | |
| 39 | `wntbt_next` | B | TEXT | – | 25M | Hypothesis-level "what needs to be true next." Resolves Q1: WNTBT lives at two granularities |
| 40 | `target_accounts` | B | TEXT | – | 25M | Pipe-delimited account list |
| 41 | `company_tags` | B | TEXT | – | 25M + 28A→ | live `companies` → v5 `company_tags`. Pipe-delimited |
| 42 | `topic_tags` | B | TEXT | – | 25M | Pipe-delimited |
| 43 | `initiative_tags` | B | TEXT | – | 25M | Pipe-delimited |
| 44 | `persona_tags` | B | TEXT | – | 25M | Pipe-delimited |
| 45 | `routing_geography` | B | TEXT | – | 25M→ | Pipe-delimited. CSV `geography_tags` → v5 `routing_geography` (Q7 decision; resolves the geography ambiguity by explicit naming). Note: drops the `_tags` pluralisation pattern of the other Section B tag columns; deliberate per chat |
| 46 | `industry_tags` | B | TEXT | – | 25M | Pipe-delimited |
| | | | | | | |
| 47 | `tech_critical_pathways` | C | TEXT | – | 28A | |
| 48 | `tech_bottlenecks` | C | TEXT | – | 28A | |
| 49 | `tech_credible_actors` | C | TEXT | – | 28A | |
| 50 | `tech_trajectory_changers` | C | TEXT | – | 28A | |
| 51 | `tech_displacement_risks` | C | TEXT | – | 28A | |
| 52 | `reg_load_bearing` | C | TEXT | – | 28A | |
| 53 | `reg_gaps_blockers` | C | TEXT | – | 28A | |
| 54 | `reg_decision_makers` | C | TEXT | – | 28A | |
| 55 | `reg_unlock_delay_kill` | C | TEXT | – | 28A | |
| 56 | `cost_critical_conditions` | C | TEXT | – | 28A→ | live `mkt_critical_conditions` → v5 `cost_critical_conditions`. Renamed to match R16's canonical "cost" bucket |
| 57 | `cost_economic_gap` | C | TEXT | – | 28A→ | live `mkt_economic_gap` → v5 `cost_economic_gap` |
| 58 | `cost_who_commits` | C | TEXT | – | 28A→ | live `mkt_who_commits` → v5 `cost_who_commits` |
| 59 | `cost_deal_structure` | C | TEXT | – | 28A→ | live `mkt_deal_structure` → v5 `cost_deal_structure` |
| 60 | `eco_missing_dependencies` | C | TEXT | – | 28A | |
| 61 | `eco_required_partnerships` | C | TEXT | – | 28A | |
| 62 | `eco_who_moves_first` | C | TEXT | – | 28A | |
| 63 | `eco_derisking_commitment` | C | TEXT | – | 28A | |
| 64 | `geo_leading` | C | TEXT | – | 28A | Q6(a) — kept; legacy/documented exception per R16 rationale — keep / rename to `routing_op_geography_leading` / drop |
| 65 | `geo_excluded` | C | TEXT | – | 28A | Q6(a) — kept; legacy/documented exception per R16 rationale — same |
| 66 | `geo_shift_matters` | C | TEXT | – | 28A | Q6(a) — kept; legacy/documented exception per R16 rationale — same |
| 67 | `trigger` | C | TEXT (quoted) | – | 28A | The event that fires ACT on this hypothesis |
| 68 | `signal_types` | C | TEXT | – | 25M+28A | Pipe-delimited |
| 69 | `signal_priority` | C | TEXT | – | 25M | |
| 70 | `signal_weighting_rule` | C | TEXT | – | 25M | |
| 71 | `last_signal_id` | C | TEXT | – | 25M | Pointer to most recent signal that touched this hypothesis |
| 72 | `falsifiers` | C | TEXT | – | 25M+28A | Pipe-delimited |
| 73 | `primary_sources` | C | TEXT | – | 25M→ + 28A | CSV `primary_sources_expected` → v5 `primary_sources` (matches live, more concise) |
| 74 | `shared_dependency` | C | TEXT | – | 25M | The metric/dependency shared with related hypotheses |
| 75 | `related_hyp_ids` | C | TEXT | – | 25M+28A | Pipe-delimited |
| 76 | `rate_limiting_bucket` | C | TEXT | – | 28A | Which bucket is the bottleneck for this hypothesis |

**Source totals (post-Q1–Q5 / Q7 sign-off; Q6 / Q9 still open):**
- Both 25M+28A (same name): 16 columns
- Both with rename: 5 columns (`window` / `window_closes` / `window_date` → `window_status` / `window_closes_at`; `if_true` / `if_false` → `decision_if_true` / `decision_if_false`; `primary_sources_expected` → `primary_sources`)
- 25M with v5 rename: 1 column (`geography_tags` → `routing_geography`)
- 28A with v5 rename: 4 columns (`mkt_*` → `cost_*`)
- 25M only: 25 columns
- 28A only (excl. mkt→cost): 20 columns + 3 columns (`geo_*`) pending Q6
- NEW in v5: 6 columns (`register`, `schema_version`, `created_at`, `created_by`, `last_updated_by`, plus the type-promotion of `last_updated`)
- **PENDING (Q6/Q9):** `geo_*` (3 cols) keep/rename/drop; `comp_*` (~4 cols) add or accept gap

---

## 3. Open questions — answered (Q1–Q5 signed off by chat 16:35 BST; Q7 decided; Q8 confirmed parked)

The chat handoff named five questions to surface before Phase 1 ends. Chat sign-off received. My design judgement on each, retained as the canonical answer:

**Q1. Where does WNTBT live?**
Three granularities. (a) **Hypothesis-level** as a curated narrative in `wntbt_next` (Section B). One canonical "what we're watching next" per hypothesis. (b) **Bucket-level** implicitly in the Section C text fields — each `tech_*`, `reg_*`, `mkt_*`, `eco_*`, `geo_*` column articulates the WNTBT for that bucket as text. (c) **Per-metric** as structured `current_state / threshold / required_slope / observed_slope / gap / mechanism` per R16, in a future `hypothesis_metrics` table that ships with Build L (trajectory layer). v5 covers (a) and (b). v5 does not yet have (c); R16's per-metric structure is target-state for Build L, not v5 today.

**Q2. Overlap representation — `if_true` vs `decision_if_true`?**
Same column, picked CSV name. Live `if_true` migrates to v5 `decision_if_true`. Same pattern for `if_false`. Reason: matches Section B's decision-layer naming convention; future ambiguity (e.g. if a bucket-layer "if X is true" condition arises) is avoided by the `decision_` prefix. The migration script in tomorrow's session does the rename.

**Q3. `decision_threshold` — derived from metric thresholds or independent?**
Independent. `decision_threshold` is the hypothesis-level evidence threshold ("the level at which the client commits or reverses the decision"). Per-metric thresholds are R16 invariants on individual metrics in the Build L `hypothesis_metrics` table. Different concepts. v5 keeps `decision_threshold` in Section B. The relationship is "decision_threshold is the gate; per-metric thresholds are the inputs that determine whether the gate has been cleared." In Build L the relationship can be made computable; in v5 it's curated text.

**Q4. Status transitions — phase model, `window_status`, or both?**
Three distinct fields, all kept:
- `phase` (Section A) — methodological state per Section 3.4. ENUM: DIVERGENT / CONVERGING / TRIGGER_READY / RESOLVED. Driven by R6 (trajectory state, once Build L ships).
- `status` (Section A) — administrative state. ENUM: ACTIVE / RETIRED / DRAFT.
- `window_status` (Section B) — current decision-window state. ENUM: open / closed / pending.

These answer different questions. Phase = where is this hypothesis in its life cycle. Status = is it in the active register. Window = is the decision actionable right now. CHECK constraints enforce each ENUM.

**Q5. `related_hyp_ids` and the four-register structure — explicit register column or implicit?**
Explicit. New v5 column `register` with ENUM CHECK (PERSONAL / INDUSTRY / SECTOR / CLIENT_ACCOUNT). `hyp_id` prefix remains as convention but `register` is canonical for filtering and joins. `related_hyp_ids` stays as TEXT (pipe-delimited) in v5. Junction-table normalisation is a v6 question; v5's job is preserving existing structure 1:1 with sensible additions.

---

## 4. Open questions — chat decisions and live escalations

### Resolved by chat (16:35 BST)

**Q6 was reframed.** Chat pushed back on the original framing (which would have weakened R16 by confining its bucket constraint to the future Build L per-metric table). The corrected framing: **R16's five buckets — technology, cost, regulation, ecosystem, competitive — are the canonical structural drivers across the methodology. Geography is a cross-cutting modifier, not a sixth peer bucket.** Section C's `system_layer` dimension must align to R16's five buckets, not preserve a 5-axis tech/reg/mkt/eco/geo grouping. Direct downstream consequences applied to this design:
- `mkt_*` (4 cols) renamed to `cost_*`. Applied in mapping table.
- The fate of `geo_*` (3 cols) and the absence of `comp_*` are now methodology questions, not schema questions. Surfaced as the live Q6 (geo) and Q9 (comp) below.

**Q7 decided.** `geography_tags` → `routing_geography`. Applied. Note: drops the `_tags` pluralisation pattern of the other Section B tag columns (`company_tags`, `topic_tags`, etc.). Deliberate per chat — clarity over consistency.

**Q8 confirmed parked.** Six `*_tags` columns stay TEXT pipe-delimited in v5 (`company_tags`, `topic_tags`, `initiative_tags`, `persona_tags`, `industry_tags`, plus the new `routing_geography`). Junction-table normalisation is a v6 question. v6 note carried into Section 7 below.

### Resolved by chat (16:45 BST)

**Q6 — option (a). Keep `geo_*` in v5 with R16 doc note.** Reasoning per chat: option (c) would discard 3 cols × 118 rows of free-text analyst commentary against an aspirational Build L that does not exist; paper trade. Option (b) creates two routing-prefixed concepts and adds 4 NULL `comp_*` cols on day one; cosmetic alignment. Option (a) is honest — geography is documented in R16 as a cross-cutting modifier; legacy `geo_*` columns are documented exceptions with deprecation path tied to Build L. Applied.

**Q9 — option (i). Accept competitive gap with doc note.** Adding `comp_*` NULL across 118 rows isn't filling the gap; it pretends. Documenting the gap as known-incomplete coverage at register level, with Build L's per-metric table as the forcing function (no metric ships without bucket label including competitive), is the real fix. Applied.

**Final Section C structure (30 cols):** 5 tech_* + 4 reg_* + 4 cost_* + 4 eco_* + 3 geo_* + 1 trigger + 9 signal/falsifier/source/dependency metadata + 4 (signal_priority, signal_weighting_rule, last_signal_id, rate_limiting_bucket — these are the 9 + 4 above; recounting cleanly: 5+4+4+4+3 = 20 bucket descriptors, 1 trigger, 9 metadata = 30).

**Final v5 total:** 16 (A) + 30 (B) + 30 (C) = **76 columns.**

### (Original Q6/Q9 escalation block — superseded by the resolutions above)

**Q6 (live). Geography in v5 — three options.**
The chat reframing settles that geography is a cross-cutting modifier rather than a peer bucket. The schema implementation question remains open: what happens to the live `geo_leading` / `geo_excluded` / `geo_shift_matters` columns?

- **Option (a) — keep `geo_*` in v5 with R16-mismatch doc note.** Minimal schema change. Preserves live data 1:1 (lowest migration risk). Doc note in R16 acknowledges the register has a `geo_*` block alongside the five canonical buckets, treated as a hypothesis-level convenience that does not appear in the per-metric table. Costs: keeps a methodology mismatch in plain sight.
- **Option (b) — rename `geo_*` to `routing_op_geography_*` (3 cols) and add `comp_*` (~4 cols) for the missing competitive bucket.** Aligns Section C with R16 perfectly. New `comp_*` cols are NULL on initial load (no source data) and populated as hypotheses get reviewed. Costs: most schema change; adds 4 cols of empty data; introduces a second routing-style concept (`routing_geography` in B vs `routing_op_geography_*` in C) that may itself confuse.
- **Option (c) — drop `geo_*` entirely; geography becomes a slicing variable on every metric in Build L.** Cleanest methodology. Costs: data loss on migration — the live `geo_*` columns have content (3 free-text cols × 118 rows). Build L would need to reconstruct geography from per-metric data, which assumes per-metric data exists; today only hypothesis-level geo text exists. Real risk of methodological capability regression.

**Q9 (new, intertwined with Q6). Missing competitive bucket.**
R16 names competitive as one of the five canonical buckets. The 28 April live register has no `comp_*` columns. v5 either:
- **(i)** accepts the gap with a doc note; Section C goes to production with four buckets present (tech / cost / reg / eco) and competitive absent. Build L's per-metric table later adds competitive coverage.
- **(ii)** adds `comp_*` columns now (likely 4: e.g. `comp_credible_actors`, `comp_strategic_moves`, `comp_displacement_threats`, `comp_position`), all NULL on initial load, populated as the team backfills. R16 alignment achieved at the register level immediately.

Q6 option (b) presupposes Q9 option (ii) — they pair. Q6 options (a) and (c) leave Q9 as a separate decision.

Phase 2 SQL is paused on these. The mapping table and Section C column list depend on which Q6 option chat picks and whether Q9 adds `comp_*` now.

---

## 5. R14, R16, Section 3, Section 8, Section 16 implications (revised after Q6 reframing)

What Phase 2 needs to do in ARCHITECTURE.md per R25:

- **Section 3 (methodology)** — small addition acknowledging that the hypothesis register operates as both signal filter (Function 1) and consulting instrument (Function 2), and that v5 supports both functions in one schema with a layered structure. Doctrinal sharpening, not a rewrite. Add explicit note that geography is a cross-cutting modifier, not a peer bucket.
- **Section 8 (the hypothesis register)** — replace the v4 / 49-col reference with v5 / ~73–80-col / three-section structure. Update the column-count table. Add the three-section description. Confirm the four sub-registers carry over; add note about the new explicit `register` column. Add note about `mkt_*` → `cost_*` rename, and the geography / competitive treatment per Q6 / Q9 outcome.
- **Section 16, Build E** — update spec from "v4" to "v5"; reference the merge migration that combines both source schemas.
- **Section 19, R14** — version bump v4.0 → v5.0; note the three-section structure; refresh the "frozen at" wording. Per Section 19.8 protocol, requires a doc version bump (v5.2 → v5.3 of ARCHITECTURE.md, rule-level edit).
- **Section 19, R16** — **NOT weakened.** R16 stays canonical. Wording may need a small clarifier that the five buckets apply both to the register's Section C `system_layer` dimension (after `mkt_→cost_` rename and Q6/Q9 resolution) and to per-metric rows in the future Build L `hypothesis_metrics` table. Geography is documented as a cross-cutting modifier in R16's rationale paragraph, not as a sixth bucket. The previous "sharpen R16 to confine to Build L" plan is dropped per chat.
- **Section 19.8** — rule-maintenance protocol satisfied by the v5.3 bump.

---

## 6. Phase 2 — paused

Phase 2 SQL implementation is paused pending chat resolution of live Q6 (geography handling) and Q9 (competitive bucket). Once both are answered, Phase 2 produces:

1. `/db/schema/hypothesis_register_v5.sql` — single CREATE TABLE matching this design including the chosen Q6/Q9 path, plus the `hypothesis_register_r15_violations` view, indexes on `register / sector / phase / window_status / owner / status`, comments per column.
2. ARCHITECTURE.md updated per Section 5 above. v5.2 → v5.3 bump for the rule-level edits to R14 and R16.
3. `/db/schema/v5_render.html` — re-rendered canonical schema reference, succeeding `hypothesis_repository_v4_final.html`.
4. `sessions/_next.md` updated for tomorrow with Postgres provisioning + merge migration spec.

Paused state: Q1–Q5 + Q7 + Q8 are settled; the column inventory in Section 2 is correct except for rows 64–66 (`geo_*`) and the potential addition of `comp_*`. The mapping totals in Section 2 reflect this uncertainty.

---

## 7. What v5 explicitly does NOT include

- The `hypothesis_metrics` table (Build L, future). Per-metric trajectory state with R16's six fields.
- Junction tables for `*_tags`, `companies`, `related_hyp_ids`. v6 question.
- The Signal Tracker schema (Build E phase two, separate session).
- Any change to `hypothesis_builder.html` or the Apps Script bridge (post-cutover work).
- Any change to live data, the live Sheet, or n8n workflows.
