# Ontology population procedure

**Version:** 1.2
**Status:** Binding procedure for populating the technology × application ontology layer (`/docs/SCHEMA_ONTOLOGY.md`).
**Audience:** Claude Code, analysts, anyone running an ontology population pass against a client initiative.
**Companion:** `/docs/SCHEMA_ONTOLOGY.md` (the schema spec); `/docs/draft_review/ontology_ccus_worked_example.md` (the first worked example, Industrial CCUS, populated 2026-05-04).

**Changelog**

- **v1.2 (2026-05-04 night).** Migration 013 introduces `technology_application_pairs.hard_evidence_count` — a denormalised `INTEGER NOT NULL DEFAULT 0` column maintained by trigger on `pair_evidence`. The column counts evidence rows where `evidence_type IN ('peer_reviewed','company_filing','government_data')` OR `(evidence_type='operator_disclosure' AND evidence_strength='high')` — the v1.1 hard-evidence definition. The confidence_band vocabulary stays high/medium/low; this column makes the medium band queryable by surfacing the difference between "medium with 0 hard evidence rows" and "medium with 2+ hard evidence rows." Step 2 updated: hard_evidence_count populates automatically via trigger, but the analyst writing the population script MUST mention the resulting count in the confidence_reasoning so the audit trail captures both the count and the call. Step 7 self-marking output extended to include `medium-band breakdown by hard_evidence_count`.

- **v1.1 (2026-05-04 evening).** Step 2 hard-evidence rule clarified: `operator_disclosure` at `evidence_strength='high'` counts as hard evidence when the operator is the only authoritative source for the fact in question (project operating data, throughput, FID date, financial parameters that operators publish but governments do not aggregate). The original rule had bracketed only `peer_reviewed`, `company_filing`, and `government_data` as hard evidence; this excluded fact patterns where operator self-disclosure is structurally the deepest available source. The clarification is enforced at population time by the analyst (procedure-level), not at schema-level CHECK. Section "Step 2 — source classification" updated; Section "Confidence band assignment from evidence" updated. Retroactive review applied to the Industrial CCUS worked example: both `Post-combustion amine × industrial point-source decarbonisation` and `Pre-combustion × industrial gas processing` remain correctly at `confidence='high'` because their operator_disclosure rows (Northern Lights consortium technical disclosures; Equinor Sleipner historical disclosure) qualify as hard evidence under v1.1.

- **v1.0 (2026-05-04).** First version. Applied to Shell Industrial CCUS.

---

## Read this first

This is the procedure. It is binding. It exists because the ontology only compounds across clients if every population run looks the same — same horizon rubric, same evidence standards, same adjacency discipline, same self-marking. Variance in population destroys the cross-client comparability that justifies having an ontology layer at all.

Seven steps. Each step has explicit inputs, outputs, and acceptance criteria. The worked example referenced throughout (`docs/draft_review/ontology_ccus_worked_example.md`) shows what each step actually produced when applied to Shell's Industrial CCUS initiative.

---

## Step 1 — identify (technology × application) pairs from a client initiative

**Input:** one client initiative with components populated to v3 standard (component_attributes + tech_function references + state/trajectory).

**Action:**

1. List every component in the initiative.
2. For each `vector='tech'` component, identify the technology variants it depends on. A component may depend on a single technology (Quest depends specifically on post-combustion amine capture) or on multiple variants (an integrated CCUS service offering may depend on amine + membrane + DAC). Use the `tech_function` reference as the starting point and refine to operational variants.
3. For each `vector='market'` component, identify the application(s) that the market represents. A market component is essentially an application in the catalogue's terms.
4. For each `vector='regulation'` component, identify which (technology × application) pairs the regulation governs. A regulation rarely creates a pair; it gates one or more.
5. For each `vector='ecosystem'` component, identify which pair(s) the ecosystem element supports (storage capacity supports capture-and-store pairs; hydrogen backbone supports H2 production × industrial application pairs).
6. Now derive the pairs. A pair = one technology × one application. Walk the cross product of identified technologies and applications, retaining only the pairs that meaningfully exist in the world. Rule of thumb: if there are commercial deployments, FIDs, pilots, or active research demonstrating the pair, retain it; if the cross-product cell is empty in the world, do not invent it.

**Output:** a list of (technology × application) pairs the initiative depends on, with every component in the initiative mapped to at least one pair.

**For Industrial CCUS, this looked like:** Shell's CCUS initiative has 4 components — `INDUSTRIAL_CCUS_CAPTURE_TECH` (tech), `US_45Q_TAX_CREDIT` (regulation), `NORTH_SEA_CO2_STORAGE_CAPACITY` (ecosystem), `INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND` (market). Walking the cross product against the technology variants the brief and industry literature identify (post-combustion amine, post-combustion next-gen solvent, pre-combustion, oxyfuel, DAC, mineral carbonation, biological capture) and the applications (industrial point-source decarbonisation, power-sector decarbonisation, CDR voluntary market, EOR, industrial gas processing) yielded 7 pairs as live-and-meaningful. The remaining cross-product cells (e.g. mineral carbonation × power sector) were dropped as not yet operational at the level needed for an ontology entry.

**Acceptance:** every component in the initiative is mapped to ≥1 pair (recorded for the next step). No pair invented from a cross-product cell that has no real-world activity.

---

## Step 2 — source classification

**Input:** the pair list from Step 1.

**Action:** for each pair, gather evidence. Sources are classified into evidence types and strengths per the table below. The classification is not negotiable — it determines the confidence band the pair lands in.

| Evidence type | Examples | Strength |
|---|---|---|
| `peer_reviewed` | Journal article, conference paper with peer review (e.g. *Nature Climate Change*, *Energy & Environmental Science*) | typically high |
| `company_filing` | Annual report, 10-K, audited disclosure, FID announcement, capital markets day deck | high |
| `government_data` | DOE / IEA / Eurostat / DESNZ / EIA published statistics; regulator-issued data | high |
| `industry_body` | Global CCS Institute, IEAGHG, IEA reports (non-peer-reviewed but methodology-published), CharIN, OEUK | medium |
| `analyst_report` | BloombergNEF, Wood Mackenzie, McKinsey, Goldman Sachs, ICCT (not peer-reviewed but rigorously sourced) | medium |
| `operator_disclosure` | Operator press release, project page, technical brochure | medium |
| `news` | Reuters, FT, Bloomberg news article, trade press | low |
| `other` | LinkedIn posts, podcast statements, conference Q&A, anonymous industry chatter | low |

**Confidence band assignment from evidence:**

- **high confidence** — ≥2 hard-evidence rows. Hard evidence is `peer_reviewed`, `company_filing`, or `government_data` with `evidence_strength='high'`; **plus (v1.1)** `operator_disclosure` with `evidence_strength='high'` *when the operator is the only authoritative source for the fact in question* — typically project operating data, throughput, FID date, financial structure, or technical-parameter disclosures that operators publish but governments and journals do not aggregate. The pair's horizon classification is structurally defensible against a McKinsey-equivalent challenge.
- **medium confidence** — ≥1 row from `analyst_report`, `industry_body`, or `operator_disclosure` with `evidence_strength>='medium'`, OR a single hard-evidence row, OR a mix of medium-strength rows across types. The classification is defensible against a senior client review but would benefit from harder evidence.
- **low confidence** — only `news` or `other` evidence available, OR sources conflict materially OR no source for a key claim. Triggers automatic flag for analyst review (Step 6).

**Operator-as-only-authoritative-source heuristic.** The v1.1 carve-out applies when:

1. The operator is the entity that produces the fact (Northern Lights consortium publishes the project's CO2 throughput; Ørsted publishes Hornsea capacity; ExxonMobil LaBarge publishes utilisation rate). Government and peer-reviewed sources cite the operator as primary — the operator IS the source of record.
2. The disclosure is published in a structured, persistent form (project page, technical brochure, capital markets day deck) — not a press release on a contested claim.
3. The disclosure is consistent over time and across operator outputs (annual report, project page, conference presentations align).

Where these three conditions hold, an `operator_disclosure` row at `evidence_strength='high'` is structurally equivalent to a `company_filing` for confidence-band purposes. Where any one fails, do not invoke the carve-out — fall back to the strict reading.

**Output:** for each pair, a list of evidence items typed and strength-assigned. At least one item per pair is required; absence of any evidence MUST stop the pair from being created — the pair is dropped or held for additional research.

**v1.2 addition: hard_evidence_count.** The schema now denormalises a count of hard-evidence rows per pair on `technology_application_pairs.hard_evidence_count` (maintained by trigger). The analyst does not write to this column directly — it is computed from `pair_evidence` rows. The analyst MUST mention the resulting count in `confidence_reasoning` so the audit trail captures both the count and the confidence-band call. A medium-confidence pair with hard_evidence_count=2 is structurally different from a medium-confidence pair with hard_evidence_count=0; both are valid medium calls but the queryable surfacing distinguishes them.

**For Industrial CCUS, this looked like:** evidence for `post_combustion_amine_capture × industrial_point_source_decarbonisation` came from IEAGHG cost network 2024 (industry_body, high), Global CCS Institute Status Report 2024 (industry_body, high), Equinor + Shell Quest annual disclosures (company_filing, high), Northern Lights operator updates (operator_disclosure, high). Mix of types let confidence land at **high** without controversy. Evidence for `direct_air_capture × cdr_voluntary_market` came from Carbon Engineering / Climeworks operator disclosures (operator_disclosure, medium) and IEA CCUS Roadmap 2024 (industry_body, medium); confidence landed at **medium** because peer-reviewed cost trajectories disagree materially with operator-claimed trajectories.

**Acceptance:** every pair has ≥1 specific source citation. "Industry knowledge" is not an evidence type. Where a pair has only news-tier evidence, mark confidence='low' and proceed to Step 6 flagging.

---

## Step 3 — horizon classification rubric

**Input:** the pair + evidence from Steps 1-2.

**Action:** classify each pair into H1, H2, or H3 using the rubric below. The classification is a structural assignment based on **where the pair is right now**, not where it might be in 5 years and not where any one company is positioned in it.

### H1 — current commercial operation

The pair has commercial deployments at scale today. Any one of the following markers is sufficient:

- ≥3 independent commercial-scale deployments operating at design throughput
- FIDs taken with capacity coming online within 24 months of the assessment date
- Regulatory frameworks in force (not in development) that govern the pair
- Capital flowing without subsidy gating — projects pencil at market prices for outputs and inputs
- Standardised contracts (PPAs, offtake agreements) used across multiple counterparties

### H2 — 3-7 year viability

The pair has demonstrated technical feasibility at pilot or first-of-a-kind commercial scale and is approaching or in early commercial conversion. Markers (any one is sufficient):

- Pilot or FOAK commercial operational
- FIDs being considered 2026-2030 with at least one announced
- Regulatory frameworks in late-stage development (consultation closed; legislative passage in next 12-18 months)
- Cost trajectory clear and approaching parity with substitute pathways
- Subsidy or policy support material but expected to remain in place through commercial transition

### H3 — 5+ year structural

The pair carries technical or market uncertainty that puts commercial viability beyond a 5-year window from today. Markers (any one is sufficient):

- Technology demonstrated but not at commercial scale; FOAK projects struggling to FID
- Applications speculative or pre-FID at scale
- Regulatory frameworks formative or absent
- Cost trajectory unclear or unfavourable at current price points
- Market demand contingent on conditions that have not yet materialised (carbon price, mandate, infrastructure availability)

### Disambiguations and edge cases

1. **Same technology can be in different horizons across applications.** Post-combustion amine × industrial point-source decarbonisation is H2 (commercial-scale FOAK projects operational, subsidy-dependent, regulatory frameworks tightening). Post-combustion amine × power-sector decarbonisation is H3 (no commercial-scale operating units; economics uncompetitive against renewables-plus-storage at current carbon prices). Different horizons for the same `technology_id` are correct, not a contradiction.

2. **H1 ≠ low risk.** A regulation with strong implementation but weak political durability (45Q with IRA-repeal exposure) is H1 because it is currently in force; the political durability concern shows up as `trajectory='volatile'` or `confidence_band='medium'` with reasoning, not as horizon demotion.

3. **H3 ≠ speculative alone.** H3 covers structural uncertainty about whether commercial viability will be reached within the strategic window. A high-TRL technology serving an application that has not yet emerged as a market is H3 (e.g. mineral carbonation × CDR voluntary market — the technology is real but the market structure and demand depth are still forming).

4. **Pairs that straddle a boundary go to the lower horizon.** A pair with FOAK commercial operating but cost trajectory unclear and subsidy gating uncertain is H2, not H1. The reasoning column makes the boundary call explicit.

**Output:** every pair has `horizon` set to H1, H2, or H3 with a `horizon_reasoning` text explicitly referencing which markers from the rubric drove the assignment.

**For Industrial CCUS, this looked like:**

- `post_combustion_amine × industrial_point_source` — **H2**. Markers: FOAK commercial operating (Quest 2015, Northern Lights 2024); FIDs 2026-2030 active; subsidy-dependent (45Q at $85/t industrial; UK CCS CfD; Norwegian Longship); cost trajectory clear (~−3% YoY). Cited.
- `direct_air_capture × cdr_voluntary_market` — **H3**. Markers: pilot scale only (Climeworks Orca, Mammoth, Heirloom; Carbon Engineering FOAK Stratos pre-commissioning); demand structurally contingent on voluntary CDR market deepening; cost trajectory unclear with operator-reported numbers contested.
- `pre_combustion_capture × industrial_gas_processing` — **H1**. Markers: standard practice in NGCC IGCC and refining for decades (LNG sweetening, ammonia production); commercial deployments at scale globally; capital flows without subsidy.

**Acceptance:** every horizon classification cites at least one marker from the rubric in the reasoning text. Where two analysts could disagree on the assignment, the reasoning explicitly states the disambiguation chosen.

---

## Step 4 — adjacency identification

**Input:** the populated pair set from Steps 1-3.

**Action:** for each pair, identify ≥2 adjacent pairs and classify the adjacency type.

The six adjacency types from the schema:

1. `same_technology_different_application` — same `technology_id`, different `application_id`. Within-pair walks for the same physical principle.
2. `same_application_different_technology` — same `application_id`, different `technology_id`. Within-application competition / substitution surface.
3. `predecessor_successor` — temporal heir. Generation-1 amine → next-gen solvent for the same application is predecessor → successor.
4. `substitute` — different technology AND different application but the same end-goal. DAC × CDR is a substitute pathway for amine × industrial point-source if both are addressing the same emission abatement objective.
5. `complement` — one pair enables the other (CO2 transport infrastructure × industrial complement to capture × industrial).
6. `subscale_to_scale` — pilot-scale instance of pair X ↔ commercial-scale instance of pair X (used in early years where pilot and commercial appear as distinct pairs).

**Methodology requirement:** ≥2 adjacencies per pair. If fewer than 2 are identifiable, the pair is suspected of being underspecified — recheck Step 1 to confirm the pair is not actually a duplicate or sub-case of another pair.

Each adjacency carries `adjacency_strength` (`strong`, `moderate`, `weak`) reflecting how analytically tight the connection is. A signal that hits one pair propagates more reliably to a `strong` adjacency than to a `weak` one.

**Output:** every pair has ≥2 rows in `pair_adjacencies` (counted as either source or target).

**For Industrial CCUS, this looked like:** `post_combustion_amine × industrial_point_source` has 4 adjacencies recorded — to `post_combustion_amine × power_sector` (same_technology_different_application, strong); to `pre_combustion_capture × industrial_point_source` (same_application_different_technology, moderate); to `direct_air_capture × cdr_voluntary_market` (substitute, weak); to `co2_transport_infrastructure × industrial_point_source` (complement, strong). Walks from this pair land at the substitution risk surface (DAC), the alternative-capture-tech surface (pre-combustion), the application-extension surface (power sector), and the enabling-infrastructure surface (transport).

**Acceptance:** every pair has ≥2 adjacencies. Pairs with fewer get held back from the population batch and surfaced for analyst review (the pair may be redundant or underspecified).

---

## Step 5 — linkage to client components

**Input:** the populated pairs from Steps 1-4.

**Action:** for each component in the originating client initiative, write rows in `component_pair_links` for every pair the component touches.

Link role assignment:

- `primary` — the component is essentially this client's instance of this pair. Quest, Northern Lights, and other Shell capture-and-store components are `primary` instances of `post_combustion_amine × industrial_point_source` for the pairs they directly operate on.
- `secondary` — the pair is a meaningful but not principal anchor. A regulation component links `secondary` to every pair it gates (45Q is `secondary` to `post_combustion_amine × industrial_point_source`, `pre_combustion × industrial_point_source`, `dac × cdr_voluntary_market`, etc., because all of those are 45Q-eligible). The regulation isn't an instance of any one pair, but it materially affects all of them.
- `exposure_only` — the component is exposed to movement in this pair without being an instance of it. A market component (`INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND`) is `exposure_only` to multiple pairs because the market sizes and economics shift if any of the underlying capture pathways move horizons.

**Discipline:** each link must carry a `reasoning_text` explaining why the link exists and why the role is what it is. This is the audit trail that lets the analyst defend the link to a client.

**Output:** every component in the initiative has ≥1 row in `component_pair_links`. A component with no link is suspect — check whether a relevant pair is missing from the ontology population batch.

**For Industrial CCUS, this looked like:** `INDUSTRIAL_CCUS_CAPTURE_TECH` linked `primary` to 3 pairs (post-combustion amine × industrial point-source, pre-combustion × industrial point-source, post-combustion next-gen × industrial point-source) reflecting Shell's actual operating footprint. `US_45Q_TAX_CREDIT` linked `secondary` to 5 pairs (every 45Q-eligible capture pathway). `NORTH_SEA_CO2_STORAGE_CAPACITY` linked `primary` to 2 pairs (storage-side complements to capture pairs operating in the North Sea cluster) and `secondary` to 1. `INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND` linked `exposure_only` to 4 pairs because demand for services depends on which capture pathways are commercially viable.

**Acceptance:** every component in the originating initiative has ≥1 row in `component_pair_links` with `reasoning_text` populated. No component left unlinked without explicit reasoning recorded out-of-band (in the worked example doc).

---

## Step 6 — confidence band and analyst-review flagging

**Input:** the populated pairs from Steps 1-5, with evidence rows and the confidence-band assignments derived in Step 2.

**Action:** finalise the `confidence_band` field on each pair and apply the flagging rules.

Flagging rules:

1. **`confidence_band='low'` MUST set `is_flagged_for_review=TRUE`** with `flag_reason` populated. The schema enforces this — an insert with `low` confidence and `is_flagged_for_review=FALSE` will be rejected.
2. **A pair where `trajectory='volatile'` AND `horizon='H1'`** is flagged for review with `flag_reason='H1 with volatile trajectory — re-classify against horizon rubric within 90 days'`. H1 with volatile trajectory is structurally suspect; either the horizon is wrong or the trajectory captures something the rubric should incorporate.
3. **A pair with fewer than 2 evidence rows** is flagged with `flag_reason='insufficient evidence — rerun Step 2 with additional sourcing'`.
4. **A pair with conflicting evidence** (e.g. one peer-reviewed source and one operator disclosure that disagree on >25% on a key parameter) is flagged with `flag_reason='evidence conflict on [parameter]; analyst arbitration required'`.
5. **A pair with no `peer_reviewed`, `company_filing`, or `government_data` evidence** is flagged for downgrade review — pair may be an industry-body consensus that has not yet been independently validated; possible H3 reclassification if the consensus is itself the only evidence.

**Output:** the flagged-for-review queue has every pair that triggered a rule. The queue is the analyst's review surface; pairs that are not flagged are draft_unreviewed but not actively held.

**For Industrial CCUS, this looked like:** of 7 pairs populated, 1 ended at `confidence='low'` (mineral carbonation × CDR voluntary market — only operator-disclosure and news evidence); 1 ended at H1 with volatile trajectory (pre-combustion × industrial gas processing has stable underlying market but volatility signal came from US LNG demand fluctuation — flag captured); 5 ended at clean medium-or-high confidence with no flagging trigger.

**Acceptance:** the flagging rules execute mechanically; no analyst judgement is needed at the population stage to decide whether to flag — the rules decide. Analyst judgement enters at the review queue, not the population queue.

---

## Step 7 — self-marking output

**Input:** the entire population batch.

**Action:** every population run reports back the following:

- **Pairs populated count.** Total rows added to `technology_application_pairs` in this run.
- **Confidence band distribution.** `high`, `medium`, `low` counts.
- **Pairs flagged for review count.** With breakdown by `flag_reason` category.
- **Components linked count.** Total rows added to `component_pair_links`. Plus components-from-the-initiative-that-remained-unlinked count (should be zero except in explicit edge cases).
- **Adjacencies identified.** Total rows in `pair_adjacencies` involving the new pairs. Per-pair count (verify the ≥2-per-pair rule).
- **Source citation quality.** Per-pair: count of evidence rows, count of evidence rows with `source_url` populated, count of evidence rows by type. The "no industry-knowledge placeholders" check runs as: every evidence row has `source_citation` not in {'industry knowledge', 'general knowledge', 'common knowledge'} (literal match check).
- **Medium-band breakdown by hard_evidence_count (v1.2).** For pairs at `confidence_band='medium'`, partition by `hard_evidence_count`: 0 / 1 / ≥2 buckets. A medium band where all pairs sit at 0 hard rows is weak. A medium band where most pairs sit at ≥2 is robust — those pairs are essentially "would-be-high pending one more hard source." Surface the distribution in every population's self-marking output.
- **Acceptance query results.** Run Q1-Q5 from `/docs/SCHEMA_ONTOLOGY.md` Section 6 and report row counts plus a 1-row sample from each.
- **Open questions.** Any methodology gaps or schema gaps surfaced during population. These feed back into the procedure document for v1.1.
- **Self-assessment.** Where the population was confident; where analyst review is most needed. Honest about uncertainty — do not smooth weak evidence.

This output lives in the worked example document for the population batch. For the CCUS first run, that document is `/docs/draft_review/ontology_ccus_worked_example.md`.

**Output:** the worked example document is the procedure's audit trail. It serves three purposes — analyst review, methodology refinement, and the template that subsequent population runs imitate.

**Acceptance:** every population run produces the seven-section self-marking output. A run that does not produce it has not completed the procedure.

---

## On reuse and the cross-client compounding asset

The procedure is designed for the second, third, and N-th population to reuse pairs from the first population. When BP's blue hydrogen initiative is populated, the `pre_combustion_capture × industrial_gas_processing` pair already exists in the ontology from CCUS — BP's components link to it without re-creating it. New pairs unique to BP are added; shared pairs accumulate evidence and adjacencies from both clients. Over time, the ontology compounds: each population run adds less ontology and more linkage, and the analytical surface for cross-client queries deepens with every run.

The procedure does not change between populations. The discipline is the procedure's reproducibility.

---

## Versioning

- **v1.2** — 2026-05-04 night, `hard_evidence_count` denormalised column on `technology_application_pairs`, maintained by trigger on `pair_evidence`. Makes medium-band heterogeneity queryable. First applied to Shell green H2, BP blue H2, Equinor (overnight batch 2).
- **v1.1** — 2026-05-04 evening, hard-evidence rule clarified to include high-strength `operator_disclosure` when the operator is the only authoritative source. Applied retroactively to the CCUS worked example with no pair reclassifications. First applied as written to Shell blue hydrogen, Shell SAF, and Vattenfall offshore wind.
- **v1.0** — 2026-05-04, first version. Applied to Shell Industrial CCUS.

Version increments require explicit reasoning recorded against the procedure file with a changelog entry. The procedure is binding; do not modify it without updating the version.
