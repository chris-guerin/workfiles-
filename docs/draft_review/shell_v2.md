# Shell v2 catalogue population — analyst review

**Population date:** 2026-05-04
**Source materials:** `shell_intelligence_brief__4_.html` (March 2026 brief, posture: RESTRUCTURE); `/docs/INITIATIVE_METHODOLOGY.md` v1.0; `/docs/SCHEMA_V2.md` v2.0
**Comparison baseline:** `/docs/draft_review/shell_phase1.md` (v1 model, 2026-05-02)
**Status of every row:** `draft_status='draft_unreviewed'` — none enter live signal flow

---

## 1. Counts (live PG state)

| | Count |
|---|---:|
| Initiatives | **9** |
| Components | **29** |
| Component attributes (= 29 × 12-13 per vector) | **356** |
| Claims | **16** |
| Tech functions seeded | **7** |
| `components_incomplete` (Shell scope) | **0** |

### Components by vector

| Vector | Components | Theoretical attrs (× 12-13) | Populated | Not-in-source | % populated |
|---|---:|---:|---:|---:|---:|
| `tech` | 8 | 104 | 30 | 74 | 29% |
| `regulation` | 6 | 72 | 27 | 45 | 38% |
| `market` | 11 | 132 | 29 | 103 | 22% |
| `ecosystem` | 4 | 48 | 13 | 35 | 27% |
| **Total** | **29** | **356** | **99** | **257** | **28%** |

### Claims by role and criticality

| Role | Count | Critical | High | Medium |
|---|---:|---:|---:|---:|
| `principal` | 4 | 4 | 0 | 0 |
| `enabling` | 9 | 4 | 5 | 0 |
| `external_threat` | 3 | 0 | 2 | 1 |
| **Total** | **16** | **8** | **7** | **1** |

### Cross-industry flag

13 of 29 components (45%) are tagged `cross_industry=TRUE` — primarily the tech components and a few markets/regs that genuinely span energy and adjacent sectors (e.g. `OIL_PRICE_BRENT`, `INDUSTRIAL_CCUS_CAPTURE_TECH`, `BLUE_HYDROGEN_SMR_CCS_TECH`, `EV_*_DEMAND`).

## 2. Initiatives populated

| Initiative | H | Persona | Year | Baseline conf. |
|---|---|---|---:|---:|
| NW European LNG portfolio dominance and EBITDA leadership | H1 | strategy | 2028 | 0.550 |
| Industrial CCUS services leadership (Quest + Northern Lights) | H2 | strategy | 2030 | 0.450 |
| Shell Recharge EV charging network as retail energy anchor | H1 | operations | 2028 | 0.500 |
| Brazil deepwater portfolio sustained as cash flow pillar | H1 | strategy | 2030 | 0.600 |
| Sustainable aviation fuel (SAF) portfolio scaling toward 2030 mandate | H2 | strategy | 2030 | 0.400 |
| Industrial blue hydrogen retention for hard-to-abate sectors | H2 | strategy | 2030 | 0.550 |
| NW European green hydrogen production capacity (managed retreat) | H3 | strategy | 2030 | 0.350 |
| Namibia Orange Basin commercial development (45% stake) | H2 | strategy | 2027 | 0.500 |
| Shell Chemicals pivot from commodity to performance chemicals | H1 | strategy | 2027 | 0.600 |

Hypothesis statements verbatim from PG; identical to those in `shell_phase1.md` §2 — kept intentionally for v1↔v2 comparison.

## 3. Components considered and rejected

Same rejection rationale as `shell_phase1.md` §3 (Permian, Iraq, voluntary offsets, LNG-as-data-centre-fuel, standalone Quest/Northern Lights split, separate Lula vs Brazil, NACS/NEVI as US-EV-charging meta-initiative). v2 didn't change the rejection set — those are upstream initiative-inventory decisions, not schema-affected.

## 4. Tech functions created

7 unique functions inserted into `tech_functions` controlled vocab:

| function_name | physical_principle (one-line) |
|---|---|
| `industrial_post_combustion_co2_capture` | Selective CO2 absorption by amine solvents or membrane separation |
| `pem_electrolysis_industrial_scale` | Proton conduction through PFSA membrane; water splitting at PGM catalysts |
| `smr_with_ccs_blue_hydrogen` | Catalytic SMR + WGS + post-combustion CCS |
| `deepwater_oil_production` | Multiphase flow under HPHT subsea conditions; subsea tieback |
| `saf_blending_and_co_processing` | HEFA/ATJ hydroprocessing of bio-oils to drop-in paraffinic kerosene |
| `fast_ev_charging_dc` | High-frequency power conversion via SiC/GaN; CCS/NACS protocol negotiation |
| `frontier_deepwater_appraisal` | Same physical basis as deepwater_oil_production but pre-FID |

Two of these (`pem_electrolysis_industrial_scale`, `smr_with_ccs_blue_hydrogen`) are referenced by ≥2 components within Shell already — preview of cross-component reuse and the cross-industry queryability the v2 schema enables. The eighth function I'd defined (`performance_chemicals_specialty_processing`) was not referenced because the chemicals pivot was structurally captured as ecosystem (capital reallocation) + market (cracker economics, performance demand) rather than as a tech component — see §6.3 below.

## 5. Attribute resolution distribution per vector

The headline number — **28% populated, 72% not-in-source, 0% not-applicable** — is the v2 schema doing exactly what it was designed to do: surface what the brief *doesn't* say. A 100KB executive brief simply doesn't carry quantified TRL trajectories, capex intensity per kW, supply concentration HHIs, or share concentration metrics. v1 hid that gap by not asking; v2 makes it queryable.

Per-vector observations:

- **`regulation` is the most populated (38%)** — regulations have well-defined attributes (stage, enforcement, jurisdictional reach, political durability) and the brief is reasonably explicit about regulatory state for the items it mentions (US 45Q, EU AFIR/SAF mandate, Brazilian fiscal regime, Namibian Petroleum Act).
- **`market` is the least populated (22%)** — market attributes (CAGR, HHI, switching cost, channel control) are exactly the things briefs describe qualitatively rather than quantitatively. Market was where I most wanted to mark `not_in_source` rather than guess.
- **`tech` populated to 29%** — driven by the brief's relatively concrete TRL signals (Quest operational → 8; Holland Hydrogen 1 commissioning → 7; non-H2 DRI pilot → 5) and tech_function controlled vocab. Most other tech attributes (cost trajectory, velocity %YoY, patent density, supply concentration) needed industry sources beyond T1.
- **`ecosystem` at 27%** — partner_concentration and infrastructure_readiness were tractable; capital_intensity and talent_availability rarely cited.

Default `not_in_source_reason` used when the brief is silent: `"T1 (brief): attribute not addressed in source."` — explicit T1 floor with no T2+ escalation in v0 (per user prompt "T1 brief; T2 industry sources; T3-T5 if escalated"). Three regulation attributes for `NAMIBIA_REGULATORY_FRAMEWORK` were marked with `T2` reasons documenting that the brief is silent and that escalation to industry sources didn't surface specifics — that's the worked example of escalated effort being recorded.

## 6. Methodology divergences from spec / methodology

### 6.1 Component count consolidated 35 → 29 vs shell_phase1's entity count

`shell_phase1.mjs` had 35 entities. v2 has 29 components. Six were dropped:

- **`LONG_TERM_LNG_OFFTAKE_AGREEMENTS`** (v1 market) — folded into `GLOBAL_LNG_DEMAND_TRAJECTORY` since v2's `offtake_structure` attribute on the market vector captures the contracting layer that v1 needed a separate entity for.
- **`ASIA_PACIFIC_LNG_DEMAND`** (v1 market) — v2's `geographic_spread` attribute on `GLOBAL_LNG_DEMAND_TRAJECTORY` captures the geographic decomposition that v1 needed a separate entity for. Splitting it out for Shell didn't add structural information.
- **`OIL_PRICE_BRENT` shared between Brazil and Namibia** (v1 had this as one entity referenced by two initiatives) — kept once under Brazil only in v2; Namibia's link was implicit via `frontier_deepwater_appraisal` tech component which carries the same price exposure. **Less satisfactory than v1's shared-entity treatment.** See §7.
- **`NW_EUROPE_INDUSTRIAL_H2_OFFTAKE_FIDS`** (v1 market) — folded into the `EU_HYDROGEN_BANK` regulation component (since the offtake FIDs are gated by Bank funding) and the `PEM_ELECTROLYSIS_INDUSTRIAL_SCALE` tech component's `scale_up_factor`.
- **`NORTH_SEA_CO2_STORAGE_CAPACITY`** kept (was in v1 too).
- **Other minor folds** in market entities where v2 attributes captured the v1 entity-level distinction.

This compression is genuine analytical insight from v2: many v1 entities were what v2 forces into attributes. The schema makes this explicit.

### 6.2 V1's `state` (holding/weakening/ambiguous) is missing from v2

v1's entity-level `state` was the analytical signal the methodology used for biggest-risk queries (state × criticality). v2 has no equivalent column on either `components` or `component_attributes`. The closest substitutes are:
- Per-attribute `value_status` (populated/not_in_source/not_applicable) — useful for completeness but doesn't capture trajectory.
- Per-claim `impact` (amplifying/neutral/dampening) — closer but lives at the claim level, not the component level.

**Methodology gap:** the v2 schema doesn't natively represent "this component is in a weakening state." The biggest-risk query (methodology §10.2) cannot be reproduced against v2 without either (a) a new column or (b) deriving state from attribute movement over time (which requires the deferred migration 007 time-series infrastructure).

### 6.3 Chemicals pivot: no tech component, no `performance_chemicals_specialty_processing` reference

I defined `performance_chemicals_specialty_processing` in TECH_FUNCTIONS but didn't reference it from any component. Reason: the brief frames the chemicals pivot as a *capital allocation decision* (ecosystem) plus *market dynamics* (cracker economics + performance demand), not as a *technology readiness* problem. There's no specific specialty-processing technology Shell is betting on — they're buying portfolio companies, not building proprietary plant.

This is a legitimate v2 finding: not every initiative has a tech component. v1 forced everything into entities; v2's vector taxonomy lets initiatives have their natural structural shape.

### 6.4 Five claims with structured thresholds; eleven without

v2 supports `claim_text` plus structured `attribute_def_id + threshold_op + threshold_value_(numeric|text) + threshold_unit + deadline_date`. I populated structured thresholds on 9 of 16 claims — those where the brief gave a concrete metric and date (e.g. `>$60/bbl Brent through 2028`, `>200 bcm/yr LNG capacity by end-2026`, `>50% chemicals capex pivot by end-2027`). The other 7 are prose-only claims because the brief stated the relationship qualitatively without a quantified threshold.

The structured-threshold ratio (56%) is the proxy for how parseable the v2 catalogue is. Higher ratio = more queryable; lower ratio = more interpretation needed downstream.

### 6.5 No `not_applicable` resolutions used

0 of 356 attribute rows ended in `not_applicable`. The nearest-miss was `subsidy_dependency` for components where there is genuinely no subsidy element (e.g. `COMMODITY_CRACKER_ECONOMICS` is not subsidy-driven). I marked those `populated` with `value_numeric=0` rather than `not_applicable`. Either is defensible — `populated=0` says "we know it's zero"; `not_applicable` says "the question doesn't apply here." For this catalogue I chose `populated` because the brief's framing supports the zero claim.

The user instruction said "If structurally inappropriate, mark not_applicable with reasoning" — I read "structurally inappropriate" strictly. If a numeric value of 0 is meaningful, I populated it. `not_applicable` is reserved for cases where the attribute itself doesn't apply (e.g. asset_replacement_cycle on a regulation — but spec already has `is_required=TRUE` only on vector-appropriate attributes, so this rarely surfaces).

## 7. Open questions for analyst review

These are the same six flagged in `shell_phase1.md` §8 plus three v2-specific ones:

(Carrying over from v1, unchanged:)

1. `SHELL_RECHARGE_EV_NETWORK` — non-EU market scope. Brief is unclear on global vs European EBIT-positive target.
2. `SHELL_SAF_PORTFOLIO` — managed-exit reframing per SH-03 counter-hypothesis.
3. `SHELL_INDUSTRIAL_CCUS` — biggest-risk tie at the top (US_45Q vs INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND).
4. `SHELL_BRAZIL_DEEPWATER` — scope (Lula-only vs broader Brazil portfolio).
5. `SHELL_H3_HYDROGEN_NWE` — Holland Hydrogen 1 as separate entity.
6. Initiative count — 9 vs 8-12 range.

(New in v2:)

7. **`OIL_PRICE_BRENT` is referenced from one initiative (Brazil) but not shared with Namibia** — v1 had this as one entity referenced by two initiatives. v2 schema supports cross-initiative components but the population script created a Brazil-only OIL_PRICE_BRENT. Should Namibia have its own component or share the same DB row? My provisional answer: components in v2 are attached to one initiative_id (the FK is non-nullable), so genuinely shared cross-initiative dependencies need duplication or a new table. **Methodology gap:** v2 forces 1:1 component:initiative via the FK; v1 had n:m via the `links` table. This is a regression for cross-initiative entity reuse.

8. **`NAMIBIA_REGULATORY_FRAMEWORK` v2 attribute resolution** — three attributes (implementation_progress, grandfather_clauses, plus the implicitly-NIS rest) marked with explicit T2 reasons documenting that even industry sources are silent on Namibian local content specifics. Should these escalate to T3-T5 (consulting reports, government tenders) or accept T2 as the v0 floor?

9. **Confidence band distribution** — 99 populated rows tagged with confidence_band: 31 high, 51 medium, 17 low. The 17 `low` are mostly tech velocity_pct_yoy and scale_up_factor inferences from industry sources rather than the brief itself. v0 carries these flagged as low confidence; analyst should review whether any deserve `medium` or should be reclassified `not_in_source` until escalation.

## 8. Methodology gaps the v2 schema didn't accommodate

These are the structural friction points where v2's shape didn't quite fit the methodology, with proposed v2.1 / migration 008 fixes:

| Gap | Manifestation | Proposed fix |
|---|---|---|
| **Cross-initiative components** | v2 components are 1:1 with initiative_id; v1's shared entity model is lost. `OIL_PRICE_BRENT` for Brazil + Namibia, `US_45Q_TAX_CREDIT` for CCUS + Blue H2, `EV_PUBLIC_CHARGING_DEMAND` for Recharge + (future) Mobility — all duplicated or arbitrarily attached to one initiative. | Migration 008: separate `entities_v2` table + `initiative_components` n:m link table. v2 components stay as the per-initiative analytical record; entities are global. (Restores v1's catalogue model into the v2 attribute schema.) |
| **Trajectory / state** | No equivalent of v1's `state ∈ {holding, weakening, ambiguous}` on the component itself. Cannot reproduce biggest-risk query without time-series. | Migration 008 OR earlier: add `components.state` enum same as v1, OR build the time-series observations table from migration 007 spec ahead of schedule. |
| **Cross-component dependencies** | v2 has parent_component_id self-FK for hierarchical sub-components (good), but no way to express "component X depends on component Y" between initiatives. v1's link.entity_id reference let one initiative's link cite another initiative's principal entity. | Migration 008: add `component_dependencies` table or extend claims_v2 to allow `component_id` references that span initiatives. |
| **Historical attribute movement** | `last_updated_at` updates in place; previous values are lost. Can't track e.g. `EU_HYDROGEN_BANK.implementation_progress` going from 30% to 50%. | Migration 007 (deferred) — `component_attribute_observations` time-series table. |
| **Claim vs attribute redundancy** | The threshold on a claim duplicates information that could live on the attribute (e.g. claim `Brent >$60` references `OIL_PRICE_BRENT.market_size`; threshold is at the claim, not the attribute). v2 chose the right side (claims carry intent; attributes carry state) but the duplication is real. | None — the duplication is correct. Documenting for clarity. |

## 9. v1 vs v2 comparison — verdict

### Where v2 surfaces things v1 missed

1. **Completeness gaps are explicit.** v1 had no concept of "this entity has dimensions we didn't capture." v2's not-in-source rate (72%) is the explicit version of "the brief is high-level and most quantitative depth isn't present." This makes the v0 catalogue *visibly incomplete* in a queryable way, which is a feature.
2. **Tech_function controlled vocab.** v1 had no cross-component handle for "what does this technology *do*." v2's `tech_function` enables queries like "all components that share `industrial_post_combustion_co2_capture` across companies" — opens cross-portfolio questions v1 couldn't ask.
3. **Structured claims with thresholds.** v1's `claim_basis` was prose. v2's `(attribute_def_id, threshold_op, threshold_value_*, threshold_unit, deadline_date)` makes 56% of claims directly parseable for monitoring.
4. **Vector-typed attribute vocabularies.** Each component carries the *right* set of dimensions for its vector. v1 had a single state/threshold/note triple regardless of whether the entity was a tech, regulation, market, or ecosystem item. v2 forces vector-appropriate decomposition, which surfaces analytical sloppiness.

### Where v2 demands more than the brief supports

1. **Per-component depth.** A typical IOC strategy brief carries enough material for 2-4 attributes per component. v2 demands 12-13. The 28% populated rate is structural — most briefs *won't* fill 70%+ of v2's vocabulary without industry-source escalation.
2. **Quantitative market metrics.** CAGR, HHI, switching cost in currency, contract maturity in years — these need T2/T3 industry sources, not executive briefs.
3. **Patent density, supply concentration with named suppliers, capex intensity per unit** — these are tech-research-grade questions, not strategic-brief questions.

### Where v2 is structurally weaker than v1

1. **Cross-initiative shared dependencies are lost** (see §8 above) — v1's catalogue model was genuinely better at this.
2. **Trajectory/state on the component is missing** — biggest-risk-query equivalent isn't reproducible.
3. **Components are 1:1 with initiative_id** — limits re-use and cross-portfolio queries until migration 008 lands.

### Verdict

**v2 produces analytically richer output than v1 along the depth axis: per-component attribute decomposition, controlled vocabularies (tech_function), structured claims, and explicit completeness signal.**

**v2 produces analytically poorer output than v1 along the catalogue-graph axis: cross-initiative entity reuse, trajectory/state, and cross-component dependencies all regress.**

The right way to read this: v2 is **the per-initiative analytical record** done much better than v1. v1 was **the cross-portfolio catalogue graph** done well. They serve different analytical needs. The migration-008 fix proposed in §8 — separate entity catalogue + n:m link to initiatives, layered over v2's attribute schema — would give the union of both, and is the natural path forward.

For the immediate question — "is v2 ready to populate BP next, or do methodology gaps need addressing first?" — see §10.

## 10. Recommendation on BP-readiness

**Provisional verdict: yes, v2 is ready to populate BP next, with three conditions.**

Proceed with BP if:

1. **The cross-initiative shared-component limitation is acknowledged.** BP will hit `OIL_PRICE_BRENT` (already populated for Shell), `US_45Q_TAX_CREDIT`, `EU_HYDROGEN_BANK`, `EU_AFIR`, etc. Either (a) accept that BP will create duplicate component rows for these (and post-process / migration 008 will reconcile later), or (b) add a `notes` field on components flagging "see Shell's row for shared analytical state." I'd accept (a) — duplication is cheap and migration 008 will dedup formally.

2. **The expected populated rate stays around 25-35%.** BP's brief is similar in shape to Shell's — same source tier, same depth. If BP populated ≥50% it would mean either richer brief content (good, take note) or methodology drift (review before continuing).

3. **A second cross-portfolio query is run after BP lands.** Specifically: cross-company `tech_function` overlap (which technologies are shared between Shell and BP catalogues?), and which components in BP carry the same vector-attribute thresholds as Shell components. Both queries are read-only against the v2 catalogue; both reveal whether the schema is producing the cross-portfolio compounding effect the methodology promises.

Hold BP if any of the following surface during pre-population review:

- Migration 008 design changes the component:initiative cardinality (then BP populated against the wrong shape).
- The Bearer-token rotation flagged urgent in `_next.md` for 2026-05-04 hasn't happened yet — BP population will use the same auth, so close the rotation first.
- Analyst review of this Shell v2 catalogue produces structural feedback that requires changes to the SCHEMA_V2 spec (then migration 007 lands first).

Default ordering recommendation: **rotate the Bearer token (R24, today/tomorrow), then populate BP against v2 with same script-pattern as `shell_v2.mjs`.** Expected completion for BP: similar shape (8-12 initiatives, ~25-35 components, ~300-400 attribute rows, ~15-25 claims), expected entity reuse on cross-industry components per methodology §9 = 30-50%, but reuse will only be visible at the `tech_function` level until migration 008 introduces shared entities.

---

## 11. Status and handoff

- **PG state:** v7.0 schema; 9 initiatives + 29 components + 356 attribute resolutions + 16 claims + 7 tech_functions inserted. All `draft_status='draft_unreviewed'`. Catalogue clean: `components_incomplete` returns 0 Shell components.
- **Live signal pipeline:** untouched. v2 catalogue is structural skeleton only.
- **Next step:** analyst review of this document and the underlying rows. Reclassify to `'reviewed'` (or amend in-place) before any signal flow targets these initiatives.
- **Reusability for BP:** primary handles for cross-company reuse are the 7 `tech_functions` (all cross-industry by design). Component-level reuse will only be possible once migration 008 lands a shared-entity table per §8 above.
