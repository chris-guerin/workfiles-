# Ontology CCUS worked example — first population pass

**Population date:** 2026-05-04
**Population script:** `db/population/012_ccus_ontology.mjs`
**Schema applied:** migration 012 (ontology layer v9.0 → v10.0)
**Procedure followed:** `/docs/methodology/ontology_population_procedure.md` v1.0
**Originating client initiative:** Shell Industrial CCUS services leadership (initiative_id=6)
**Status of every row:** `draft_status='draft_unreviewed'` — none enter live signal flow

---

## 1. Counts (live PG state)

| Table | Count |
|---|---:|
| technologies | **7** |
| applications | **5** |
| technology_application_pairs | **9** |
| pair_evidence | **27** |
| pair_adjacencies | **21** |
| component_pair_links | **15** |
| Components linked from initiative 6 | **4 / 4** |

### Pair distribution by horizon × confidence

| | high | medium | low | total |
|---|---:|---:|---:|---:|
| **H1** | 2 | 0 | 0 | 2 |
| **H2** | 1 | 1 | 0 | 2 |
| **H3** | 0 | 4 | 1 | 5 |
| **total** | 3 | 5 | 1 | 9 |

H3 is the largest horizon as expected for a CCUS portfolio — the bulk of the field is structurally beyond the 5-year commercial-viability window.

---

## 2. Pairs populated

### H1 pairs (2)

#### Pre-combustion capture × industrial gas processing — H1, confidence=high, trajectory=holding

- **Horizon reasoning.** Standard practice in LNG sweetening and ammonia production for 40+ years; commercial deployments globally at scale (Sleipner 1996 onwards, every LNG export terminal, every ammonia plant). Capital flows without subsidy gating — base industrial economics. H1 markers met: ≥3 independent commercial-scale deployments; capital flowing without subsidy; standardised contracts; regulatory frameworks in force.
- **Evidence (3 rows).** IEA Natural Gas Information 2024 (government_data, high) — every operating LNG export facility uses amine sweetening with CO2 separation. IFA Ammonia Production Statistics 2024 (industry_body, high) — 180+ Mt/yr ammonia production. Equinor Sleipner historical disclosure 2024 (operator_disclosure, high) — 28 years continuous operation, >20 Mt CO2 captured.
- **Trajectory reasoning.** Mature application; new growth at the margin from CO2-utilisation rather than expansion of base practice.
- **Adjacencies (4).** same_technology_different_application → Pre-combustion × industrial point-source (strong); complement → Post-combustion amine × EOR (moderate). Plus mirrors of each.
- **Components linked.** None directly from Shell's CCUS initiative — Shell does not operate this pair as a CCUS-specific component. The pair exists in the ontology because it sets the H1 base for the H2 pre-combustion industrial application.

#### Post-combustion amine capture × enhanced oil recovery — H1, confidence=high, trajectory=volatile, **flagged**

- **Horizon reasoning.** Long-running commercial application (Permian, Gulf Coast since 1970s); standardised contracts; capital flowing without subsidy gating (45Q EOR rate $60/t but EOR economics work at appropriate oil prices). H1 markers met: ≥3 deployments; FIDs operating; capital flowing; 45Q EOR in force.
- **Evidence (3 rows).** EIA US EOR Statistics 2024 (government_data, high) — 280 kbpd from 140 fields. IRS 45Q EOR provisions (government_data, high). ExxonMobil LaBarge facility disclosures 2024 (operator_disclosure, high) — 6+ Mtpa CO2.
- **Trajectory reasoning.** Activity tracks oil price and 45Q political durability; recent IRA-repeal scenarios introduce material political volatility.
- **Adjacencies (3).** same_technology_different_application → Post-combustion amine × industrial point-source (strong); complement → Pre-combustion × industrial gas processing (moderate); plus mirror.
- **Components linked.** US_45Q_TAX_CREDIT (secondary) — 45Q EOR rate is the principal subsidy on this pair.
- **Flag reason.** "H1 with volatile trajectory — re-classify against horizon rubric within 90 days. Political-durability concerns on 45Q + oil-price linkage make trajectory genuinely volatile but the pair remains commercially in operation (true H1). Worth checking whether the volatility actually warrants H2 demotion or whether trajectory captures it." (Step 6 rule 2 triggered automatically.)

### H2 pairs (2)

#### Post-combustion amine capture × industrial point-source decarbonisation — H2, confidence=high, trajectory=improving

- **The anchor pair for Shell's portfolio.** Quest, Northern Lights, and most of the cluster work fold into this pair primary-linked.
- **Horizon reasoning.** FOAK commercial operating (Quest 2015 1.0 Mtpa; Northern Lights phase 1 2024 1.5 Mtpa). Multiple FIDs 2026-2030 in UK CCS clusters. Cost trajectory clear (~−3% YoY per IEAGHG). Subsidy-dependent (45Q $85/t US, UK CCS CfD, Norwegian Longship). Regulatory frameworks (ETS, 45Q, CCS CfD) in force or late-stage development. H2 markers met: FOAK operational; FIDs being considered; subsidy material but expected to remain through commercial transition.
- **Evidence (4 rows).** Global CCS Institute Status Report 2024 (industry_body, high). IEAGHG CCS Cost Network 2024 (industry_body, high). Shell Quest annual disclosures 2015-2024 (company_filing, high). Northern Lights consortium disclosures 2024 (operator_disclosure, high).
- **Trajectory reasoning.** Capacity coming online accelerating; cost declining; cross-border CO2 transport rules clarifying.
- **Adjacencies (11).** Highest in the population batch — the central anchor pair. Connects to: power-sector decarbonisation pair (same_technology_different_application, strong); pre-combustion × industrial point-source (same_application_different_technology, moderate); DAC × CDR voluntary (substitute, weak); next-gen solvent × industrial point-source (predecessor_successor, strong); EOR pair (same_technology_different_application, strong); plus several mirrors recorded for query-walk symmetry.
- **Components linked.** INDUSTRIAL_CCUS_CAPTURE_TECH (primary — Quest is a primary instance). US_45Q_TAX_CREDIT (secondary — gating). NORTH_SEA_CO2_STORAGE_CAPACITY (secondary — Northern Lights, Endurance, Acorn destination). INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND (exposure_only — services market sized off this pair).
- **Methodology note.** Flagged in Section 4 below — only 1 hard-evidence row strictly (Quest company_filing); rubric strict reading would demote to medium. Held at high confidence pending methodology refinement.

#### Pre-combustion capture × industrial point-source decarbonisation — H2, confidence=medium, trajectory=volatile

- **Horizon reasoning.** Blue hydrogen industrial decarbonisation pathway (SMR + WGS + CCS for H2 supplied to refining, chemicals, steel). HyNet, H21 North of England, Equinor H2H Saltend at FID or near-FID 2024-2026. Cost competitiveness vs green H2 dependent on gas prices and 45V/EU Hydrogen Bank treatment. H2 markers: FOAK at FID stage; regulatory frameworks in force; subsidy material and expected to remain.
- **Evidence (3 rows).** IEA Hydrogen Roadmap 2024 (industry_body, high). UK DESNZ HyNet (government_data, high). Equinor H2H Saltend (operator_disclosure, medium).
- **Trajectory reasoning.** IRA 45V final guidance March 2024 narrowed eligibility — partial reversal. EU Hydrogen Bank pricing variable. Volatile until regulatory accounting stabilises.
- **Adjacencies (5).** same_technology_different_application → Pre-combustion × industrial gas processing (strong); same_application_different_technology → Post-combustion amine × industrial point-source (moderate); plus mirrors.
- **Components linked.** INDUSTRIAL_CCUS_CAPTURE_TECH (secondary). US_45Q_TAX_CREDIT (secondary). NORTH_SEA_CO2_STORAGE_CAPACITY (secondary). INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND (exposure_only).

### H3 pairs (5)

#### Post-combustion next-gen solvent × industrial point-source decarbonisation — H3, confidence=medium, trajectory=improving

- **Horizon reasoning.** KM-CDR (Mitsubishi) and CANSOLV S5 (Shell) at FOAK commercial demonstration; energy-penalty reduction promising but field validation incomplete. Cost trajectory aspirational; commercial parity beyond 5-year window because incumbents (first-gen amines) maintain operational learning advantage.
- **Evidence (3 rows).** IEAGHG technology readiness review 2024 (industry_body, medium). DOE NETL Solvent Capture Program 2024 (government_data, high). Mitsubishi KM-CDR product brochure (operator_disclosure, medium).
- **Adjacencies (4).** predecessor_successor → Post-combustion amine × industrial point-source (strong); same_application_different_technology → Pre-combustion × industrial point-source (moderate); plus mirrors.
- **Components linked.** INDUSTRIAL_CCUS_CAPTURE_TECH (secondary — Shell CANSOLV ownership). US_45Q_TAX_CREDIT (secondary). NORTH_SEA_CO2_STORAGE_CAPACITY (secondary). INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND (exposure_only).

#### Direct air capture × CDR voluntary market — H3, confidence=medium, trajectory=improving

- **Horizon reasoning.** Pilot to FOAK commercial (Climeworks Orca 4 ktpa, Mammoth 36 ktpa; Carbon Engineering Stratos pre-commissioning 500 ktpa). Demand structurally contingent on voluntary CDR market deepening; cost ~$600-1000/t with operator-claimed trajectory toward $200-400/t contested by peer-reviewed analysis. H3 markers: technology demonstrated but not at commercial scale; cost trajectory unclear; demand contingent on conditions not yet materialised.
- **Evidence (4 rows).** Climeworks operator disclosures 2024 (operator_disclosure, medium). Carbon Engineering Stratos updates 2024 (operator_disclosure, medium). IEA CCUS Roadmap 2024 (industry_body, high). Frontier Climate purchase commitments (operator_disclosure, high).
- **Conflict noted.** IEA cost trajectory model ($400-600/t commercial floor 2030) disagrees with operator claims ($200-400/t). This is recorded in the confidence_reasoning; pair remains medium because the conflict is acknowledged and the horizon assignment holds under both readings.
- **Adjacencies (5).** same_application_different_technology → Mineral carbonation × CDR voluntary (moderate); substitute → Post-combustion amine × industrial point-source (weak); substitute → Post-combustion next-gen solvent × industrial point-source (weak).
- **Components linked.** US_45Q_TAX_CREDIT (secondary — 45Q DAC rate $180/t). INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND (exposure_only — DAC offtake at $300-1000/t draws demand from industrial-captured CO2 services).

#### Mineral carbonation × CDR voluntary market — H3, confidence=low, trajectory=improving, **flagged**

- **Horizon reasoning.** Pilot scale only — Carbfix (Iceland) at 12 ktpa, 44.01 (Oman) at pilot. Permanent storage credentials very strong but throughput and cost barriers material. H3 markers: technology demonstrated but not at commercial scale; cost trajectory unclear; market structure contingent on voluntary CDR demand.
- **Evidence (2 rows).** Carbfix project disclosures 2024 (operator_disclosure, medium). IEAGHG mineralisation review 2023 (industry_body, medium).
- **Adjacencies (3).** same_application_different_technology → DAC × CDR voluntary (moderate); complement → Post-combustion amine × industrial point-source (weak).
- **Components linked.** None directly from Shell's CCUS initiative. The pair exists for adjacency-walk completeness from the Shell-anchored portfolio.
- **Flag reason.** "low confidence: only operator-disclosure and industry-body evidence; no peer-reviewed or government data; cost claims not independently validated. Re-run Step 2 with peer-reviewed cost analysis (DOE NETL mineralisation review or equivalent)."

#### Post-combustion amine capture × power-sector decarbonisation — H3, confidence=medium, trajectory=weakening

- **Horizon reasoning.** Boundary Dam (SK) operating since 2014 but persistent capture-rate underperformance (~65% vs 90% design); Petra Nova (TX) mothballed 2020 due to oil-price-linked economics. No new FIDs against retrofit or new-build coal-CCS at commercial scale. Renewables-plus-storage outcompetes at current carbon prices. H3 markers: applications speculative or pre-FID at scale; cost trajectory unfavourable; market demand contingent on conditions not materialised (high carbon price).
- **Evidence (3 rows).** SaskPower Boundary Dam annual disclosure (company_filing, high). IEA WEO 2024 (industry_body, high). NRG Petra Nova disclosures (operator_disclosure, high).
- **Trajectory reasoning.** No new commercial FIDs in development; renewables-plus-storage cost trajectory making power-sector CCS structurally uncompetitive; outlook for revival contingent on $150+/t carbon prices not currently in play.
- **Adjacencies (4).** same_technology_different_application → Post-combustion amine × industrial point-source (strong); substitute → Oxyfuel combustion × industrial point-source (weak — Allam cycle as alternative power-sector decarbonisation pathway); plus mirrors.
- **Components linked.** None directly from Shell's CCUS initiative — Shell exited the power-sector CCS pursuit. The pair exists in the ontology because the substitution surface (DAC, next-gen solvent) walks through here for adjacency completeness.

#### Oxyfuel combustion × industrial point-source decarbonisation — H3, confidence=medium, trajectory=holding

- **Horizon reasoning.** NET Power La Porte 50 MW Allam cycle gas demonstration; cement-sector oxyfuel at FEED (Heidelberg Brevik post-combustion not oxyfuel for the operating unit). FOAK commercial-scale industrial oxyfuel pre-FID. H3 markers: technology demonstrated but not at commercial scale; FOAK projects struggling to FID; cost trajectory unclear.
- **Evidence (2 rows).** NET Power Allam cycle disclosures 2024 (operator_disclosure, medium). IEAGHG oxyfuel review 2023 (industry_body, medium).
- **Adjacencies (3).** same_application_different_technology → Post-combustion amine × industrial point-source (moderate); substitute → Post-combustion amine × power-sector decarbonisation (weak); plus mirror.
- **Components linked.** None directly from Shell's CCUS initiative.

---

## 3. Component linkage — Shell's CCUS initiative

| Component | Vector | Pair | Role |
|---|---|---|---|
| INDUSTRIAL_CCUS_CAPTURE_TECH | tech | Post-combustion amine × industrial point-source | **primary** |
| INDUSTRIAL_CCUS_CAPTURE_TECH | tech | Pre-combustion × industrial point-source | secondary |
| INDUSTRIAL_CCUS_CAPTURE_TECH | tech | Post-combustion next-gen solvent × industrial point-source | secondary |
| US_45Q_TAX_CREDIT | regulation | Post-combustion amine × industrial point-source | secondary |
| US_45Q_TAX_CREDIT | regulation | Pre-combustion × industrial point-source | secondary |
| US_45Q_TAX_CREDIT | regulation | Direct air capture × CDR voluntary market | secondary |
| US_45Q_TAX_CREDIT | regulation | Post-combustion amine × enhanced oil recovery | secondary |
| US_45Q_TAX_CREDIT | regulation | Post-combustion next-gen solvent × industrial point-source | secondary |
| NORTH_SEA_CO2_STORAGE_CAPACITY | ecosystem | Post-combustion amine × industrial point-source | secondary |
| NORTH_SEA_CO2_STORAGE_CAPACITY | ecosystem | Pre-combustion × industrial point-source | secondary |
| NORTH_SEA_CO2_STORAGE_CAPACITY | ecosystem | Post-combustion next-gen solvent × industrial point-source | secondary |
| INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND | market | Post-combustion amine × industrial point-source | exposure_only |
| INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND | market | Pre-combustion × industrial point-source | exposure_only |
| INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND | market | Post-combustion next-gen solvent × industrial point-source | exposure_only |
| INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND | market | Direct air capture × CDR voluntary market | exposure_only |

**4 / 4 components linked.** Every component in initiative 6 carries ≥1 link.

Observations:

- INDUSTRIAL_CCUS_CAPTURE_TECH primary-links only to the post-combustion amine × industrial point-source pair. That pair is the canonical anchor for Shell's CCUS portfolio. Pre-combustion and next-gen solvent are secondary on the same component because the component's tech_function is `industrial_post_combustion_co2_capture` — they share Shell capture-tech ownership but are not the principal pathway today.

- US_45Q_TAX_CREDIT links secondary to 5 pairs — the largest fan-out of any component in this batch. This is structurally correct: a regulation gates many pairs.

- NORTH_SEA_CO2_STORAGE_CAPACITY links secondary to 3 capture pairs operating into the North Sea cluster. It does not primary-link to any pair because the storage-side itself is a complement to capture rather than a capture pair in its own right. (Open question: should there be storage-side technology rows like `co2_pipeline_transport_offshore` or `co2_geological_storage_saline_aquifer` that pair with applications? Held for analyst review — see Section 5.)

- INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND links exposure_only to 4 pairs reflecting the market-side exposure to multiple capture pathways' commercial viability.

---

## 4. What's been left for analyst review

### Auto-flagged pairs (2)

1. **Post-combustion amine capture × enhanced oil recovery** — H1 with volatile trajectory. Step 6 rule 2 triggered. Question: does political volatility on 45Q sufficient to demote this from H1, or does the trajectory column adequately capture the risk while the pair remains an H1 commercial reality? Recommendation: hold at H1 with volatile trajectory; reassess if 45Q EOR rate is materially weakened or the IRA-repeal trajectory crystallises.

2. **Mineral carbonation × CDR voluntary market** — confidence=low. Step 6 rule 1 (low confidence MUST flag) triggered automatically. Question: is the pair worth holding in the ontology at low confidence, or should it be parked until peer-reviewed cost analysis or government_data evidence is available? Recommendation: hold and re-run Step 2 with DOE NETL mineralisation portfolio data (likely available); the pair is an active substitution surface for DAC and the adjacency walks justify keeping it visible.

### Methodology gaps (3)

These surfaced during population and warrant procedure-level attention before subsequent populations:

1. **Hard-evidence rule for high confidence is strict.** Of 3 pairs labelled `confidence='high'`, two have only 1 hard-evidence row (peer_reviewed/company_filing/government_data with strength=high) — Post-combustion amine × industrial point-source has just Quest as its company_filing entry; Pre-combustion × industrial gas processing has just IEA as its government_data entry. Strictly per the rubric, both should demote to medium. Two ways to reconcile:

   (a) Tighten enforcement — demote to medium and add evidence rows when peer-reviewed or government-data support is found. This is more defensible.

   (b) Loosen "hard evidence" definition — count high-strength operator_disclosure from incumbent operators (Northern Lights consortium, ExxonMobil LaBarge) as functionally equivalent to company_filing. This is more pragmatic but loses analytical bite.

   Recommendation: (a). Demote affected pairs to medium in the next reclassification pass and proactively source peer_reviewed or government_data evidence to rebuild high confidence. Methodology v1.1 should make this enforcement automatic via a CHECK or trigger.

2. **Storage-side technologies are absent from the population batch.** The ontology currently has no `co2_pipeline_transport`, `co2_shipping`, or `co2_geological_storage_saline_aquifer` rows. NORTH_SEA_CO2_STORAGE_CAPACITY links secondary to capture pairs, but the storage side has its own horizon dynamics (transport infrastructure FIDs, offshore well permitting, saline aquifer characterisation) that would benefit from dedicated technology rows.

   Recommendation: add to the next CCUS-extension run. Expected new pairs: `co2_pipeline_offshore × industrial_point_source` (H2, NW Europe focus); `co2_shipping × industrial_point_source` (H1-H2, Northern Lights model); `saline_aquifer_storage × industrial_point_source` (H1 in operating reservoirs, H2 in late-permitting reservoirs).

3. **Subscale_to_scale adjacency type is unused in this batch.** All 9 pairs are at a single scale level. The type was specified for cases where pilot and commercial appear as distinct pairs. CCUS may benefit from this when oxyfuel-cement-pilot vs oxyfuel-cement-commercial both become populated (likely 2027-2028). Held as schema completeness rather than a gap to fix.

### Open questions for analyst review (3)

1. **EOR is increasingly disputed as "decarbonisation" — should the application stay in the ontology under that framing?** EIA categorises EOR as utilisation, not removal. Frontier Climate excludes EOR from CDR. The application_label currently says "Enhanced oil recovery (EOR)" without a removal/utilisation tag. Should an `application_role` field be added that distinguishes `removal` / `utilisation` / `permanent_storage`? Suggest yes for ontology v1.1.

2. **Does Shell's exit from power-sector CCS warrant marking the post-combustion amine × power-sector pair as decoupled from Shell?** Currently no Shell component links to that pair. Adjacency walks still surface it. Recommendation: leave as is — the pair belongs in the ontology because BP, NRG, SaskPower, and others have material exposure; Shell's non-exposure shows up as a missing link, which is the correct representation.

3. **Trajectory='volatile' AND horizon='H2' for Pre-combustion × industrial point-source.** Step 6 only flags H1+volatile. Should H2+volatile also flag? Argument for: H2 is where most of Shell's upside sits; volatility there is high-stakes. Argument against: H2 has a material policy-support component built in, so volatility is partially expected. Recommendation: do not auto-flag H2+volatile but log it as analyst-watchable. Schema supports the query; methodology remains unchanged.

---

## 5. Acceptance query results (live)

All queries from `/docs/SCHEMA_ONTOLOGY.md` Section 6 executed against the post-population schema.

### Q1 — pair count by horizon × confidence

5 result rows in 168ms.

```
horizon | confidence_band | pair_count
--------+-----------------+-----------
H1      | high            |          2
H2      | high            |          1
H2      | medium          |          1
H3      | low             |          1
H3      | medium          |          4
```

### Q2 — flagged-for-review queue

2 result rows in 169ms.

```
[high/H1] Post-combustion amine capture × enhanced oil recovery
[low/H3]  Mineral carbonation × CDR voluntary market
```

### Q3 — Shell × ontology heat map

15 result rows in 171ms. Sample row:

```json
{
  "initiative": "Industrial CCUS services leadership (Quest + Northern Lights)",
  "component": "INDUSTRIAL_CCUS_CAPTURE_TECH",
  "pair_label": "Pre-combustion capture × industrial point-source decarbonisation",
  "horizon": "H2",
  "confidence_band": "medium",
  "trajectory": "volatile",
  "link_role": "secondary"
}
```

### Q4 — adjacency walk from anchor pair

11 result rows in 171ms (rows include both source→target and target→source mirrors of the same edge, hence some apparent duplicates).

```
[complement/weak]                              -> Mineral carbonation × CDR voluntary market (H3)
[predecessor_successor/strong]                 -> Post-combustion next-gen solvent × industrial point-source (H3)
[same_application_different_technology/moderate] -> Oxyfuel combustion × industrial point-source (H3)
[same_application_different_technology/moderate] -> Pre-combustion capture × industrial point-source (H2)
[same_technology_different_application/strong] -> Post-combustion amine capture × power-sector (H3)
[same_technology_different_application/strong] -> Post-combustion amine capture × enhanced oil recovery (H1)
[substitute/weak]                              -> Direct air capture × CDR voluntary market (H3)
```

### Q5 — evidence quality audit

9 result rows in 172ms. Per pair: evidence count, hard-evidence count, high-strength count, URL coverage.

```
4 (url=4, hard=1) -- Post-combustion amine capture × industrial point-source decarbonisation
4 (url=4, hard=0) -- Direct air capture × CDR voluntary market
3 (url=3, hard=2) -- Post-combustion amine capture × enhanced oil recovery
3 (url=3, hard=1) -- Post-combustion next-gen solvent × industrial point-source decarbonisation
3 (url=3, hard=1) -- Pre-combustion capture × industrial point-source decarbonisation
3 (url=3, hard=1) -- Pre-combustion capture × industrial gas processing
3 (url=3, hard=1) -- Post-combustion amine capture × power-sector decarbonisation
2 (url=2, hard=0) -- Mineral carbonation × CDR voluntary market
2 (url=2, hard=0) -- Oxyfuel combustion × industrial point-source decarbonisation
```

URL coverage: 27/27 (100%). Hard-evidence: 8 rows across 7 pairs (the two flagged pairs have 0 hard-evidence; this is consistent with their flagged status).

---

## 6. Self-assessment — where confident, where less so

**Confident:**
- The schema landed cleanly. All 7 verification checks passed in the migration; CHECK constraints work as designed (low-confidence-must-flag, self-adjacency guard, all the type enums).
- The 9 pairs cover the live and meaningful (technology × application) cells of the CCUS field. No invented pairs, no empty cross-product cells. The horizon distribution (H1: 2, H2: 2, H3: 5) mirrors the field's actual standing.
- Component linkage is exhaustive. Every component in the initiative carries ≥1 link with reasoning recorded.
- Adjacencies meet the ≥2-per-pair threshold easily; the central anchor pair has 11 walks, indicative of the structural centrality of post-combustion amine × industrial point-source for CCUS.
- The flagging discipline executed mechanically — both flagged pairs flagged for the right reasons per Step 6 rules.

**Less confident:**
- The hard-evidence rule for high confidence (Section 4 methodology gap 1) is the single biggest open issue. Two pairs labelled high should arguably be medium.
- DAC cost trajectory has acknowledged conflict between operator-claimed and IEA/peer-reviewed; pair sits at medium with the conflict in confidence_reasoning, but a future signal that brings cost data forward will need the conflict re-arbitrated.
- Mineral carbonation's evidence base is genuinely thin. The flag is correct; what's not yet decided is whether the pair stays in the ontology pending better evidence or is parked.
- Storage-side technologies are absent (Section 4 methodology gap 2). This is the largest structural gap relative to the universe of CCUS pairs that should ultimately exist.

**Where the analyst's eye is most needed:**
1. Validate the H1/volatile call on EOR (flag triggered by Step 6 rule).
2. Decide on hard-evidence rule strictness — demote two pairs to medium, or update methodology v1.1.
3. Decide whether storage-side technologies extend this run or wait for Northern Lights phase 2 FID to land.
4. Confirm DAC cost-trajectory conflict treatment is acceptable for client-facing surfacing (or whether the pair's confidence should drop to low until conflict resolves).

---

## 7. Readiness for overnight scaling

The worked example is clean enough that **3 more initiatives could be populated using it as template**, with the following caveats:

- For initiatives that overlap CCUS (e.g. Shell's Industrial Blue Hydrogen — depends on `pre_combustion_capture × industrial_point_source` already populated), reuse is direct: new component_pair_links rows, no new pairs.
- For initiatives in adjacent fields (BP H3 hydrogen NW Europe, Equinor blue H2 Saltend) the population reuses the technologies and applications already in the ontology and adds initiative-specific component_pair_links plus any new pairs that emerge.
- For initiatives in unrelated fields (Shell SAF, Brazil deepwater, Shell Recharge EV charging), populate as a fresh batch following the same Step 1-7 procedure; expect 6-12 pairs per initiative based on this CCUS run's experience.

The procedure document (`/docs/methodology/ontology_population_procedure.md`) and this worked example together are sufficient template for an autonomous overnight run on the next 3 initiatives. Self-marking output should be regenerated per batch.

The hard-evidence rule needs to be decided before the next batch — if methodology v1.1 tightens it, the affected CCUS pairs should be re-classified in the same commit.
