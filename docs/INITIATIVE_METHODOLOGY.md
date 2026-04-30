# Initiative methodology — population procedure

**Version:** 1.0
**Status:** Methodology document. Defines the procedure for populating the initiative model from a company name and a stack of public sources.
**Audience:** Analysts, AI systems, or implementers populating the initiative model. Including AI systems with no other context.
**Reading order:** This document depends on INITIATIVE_MODEL.md. Read the model spec first; that defines the data structure and behaviour rule. This document defines the procedure that produces that data structure.

---

## 1. Purpose of this document

The initiative model holds analytical positions as structured data. The methodology defines the procedure for converting public sources about a company into that structured data.

This document makes the procedure repeatable. Two analysts following it on the same company should produce structurally equivalent outputs — same initiatives identified, same entities referenced, same role/criticality assignments within reasonable judgment variance, same claim formulations.

If you can run this procedure on Shell, you can run it on BP, ExxonMobil, Equinor, or any other relevant company. The procedure is company-agnostic.

This document does not cover:

- The data model itself. See INITIATIVE_MODEL.md.
- How news articles become signals updating the model. See SIGNAL_PIPELINE.md.
- How the procedure runs in n8n. See N8N_IMPLEMENTATION.md.
- A complete worked example with all judgment shown. See WORKED_EXAMPLE_SHELL_H3.md.

## 2. Inputs and prerequisites

Before starting, you need:

**Required inputs:**
- The company name (e.g. "Shell", "BP", "ExxonMobil").
- A clear scope (e.g. "Shell H3 strategic positions", "BP renewables and energy solutions H3 bets", "Equinor's hydrogen and offshore wind H3 portfolio"). The scope determines which initiatives are in/out.
- Source materials covering the company's public position on the scoped topic.

**Source tiers (in priority order):**
- **T1 — Corporate primary**: annual reports, energy transition strategy documents, capital markets day disclosures, named project announcements, regulatory filings (10-K, 20-F, equivalent). Authoritative for what the company has committed to.
- **T2 — Technology readiness**: published TRL assessments (IRENA, IEA, Hydrogen Council, sectoral bodies), academic literature, technology consultancy reports. Authoritative for technology state.
- **T3 — Financial substance**: capital markets data, capex disclosures, M&A and JV equity stakes, financial analyst reports. Authoritative for financial commitment.
- **T4 — Regulatory state**: government regulatory documents, policy implementation trackers, EU/state legislative texts. Authoritative for regulatory state.
- **T5 — Executive commentary**: earnings call transcripts, executive interviews, public speeches. Indicative but lower-weight than T1.

**Existing entity catalogue:** if other companies have already been populated, the entity catalogue exists and should be searched before creating new entities. See section 8.

**Tech radar (if available):** company-specific or sector-specific technology readiness assessments. Cross-references against initiative content help identify principal technologies and disruptive external threats.

## 3. The procedure

The procedure has 10 steps. They proceed in order. Each step has inputs, a procedure, a defined output, and named judgment moments.

The full procedure for one company takes 4-12 hours depending on scope size and whether the entity catalogue already covers most relevant entities.

### Overview of steps

1. **Initiative inventory** — enumerate the strategic bets the company has publicly committed to within scope.
2. **Initiative scoping** — for each candidate initiative, decide whether it qualifies and how to bound it.
3. **Per-initiative metadata** — populate the `initiatives` table row for each.
4. **Principal entity identification** — for each initiative, identify the 1-3 principal entities and create or reference them.
5. **Enabling entity identification** — for each initiative, identify enabling entities (typically 3-5) and create or reference them.
6. **External threat identification** — for each initiative, identify external threats (typically 0-2).
7. **Link assignment** — for each (initiative, entity) pair, populate the link with role, impact, criticality, claim, claim_basis.
8. **State assessment** — for each entity, assess current state per the operational definitions.
9. **Baseline confidence** — set initial confidence band per initiative based on link state.
10. **Review and integration** — read each populated initiative as a whole; check the biggest-risk query produces sensible answers; verify the entity catalogue isn't fragmented.

---

### Step 1 — Initiative inventory

**Input:** company name, scope, T1 sources (annual report, capital markets day, energy transition strategy).

**Procedure:**

Read the T1 sources end to end with the scope in mind. List every distinct strategic bet that:

(a) the company has publicly committed capital, partnerships, or named projects to,
(b) has a time horizon beyond current operations (typically 3+ years out),
(c) has uncertainty in the world about whether it will succeed (i.e. it depends on external conditions, not just internal execution),
(d) falls within the stated scope.

For each candidate, write a one-paragraph framing: what is the bet, what's been publicly committed, why does it qualify as H3 (or whatever horizon was specified) rather than current operations.

**Judgment moment 1.1 — what counts as an initiative?**

A strategic initiative is a coherent bet, not a business line. Operating a refining footprint is not an initiative; *rationalising the refining footprint* is. Selling lubricants is not an initiative; *expanding lubricants in emerging markets* is, if it's been publicly named with capital commitment.

**Hard test — anchor in verifiable commitment.** Each initiative must be tied to at least one of:
- A named project (e.g. Holland Hydrogen 1, LNG Canada Phase 2)
- A specific capital allocation (e.g. Shell's stated annual RES capex envelope, a named investment programme)
- An explicit corporate commitment in T1 sources (e.g. a binding production target, a stated divestment programme, a named partnership stake)

If you cannot anchor the candidate to at least one of these, it's commentary or strategic narrative, not an initiative. Drop it.

**Hard test — failure must be definable.** If you cannot specifically identify what would constitute failure of this initiative — what observable conditions would mean the bet didn't pay off — it is not an initiative. This is sharper than asking "could it fail" because every bet could fail in some loose sense; the test is whether failure has a concrete shape.

Tests for whether something qualifies (in addition to the above):
- Does it have a time horizon distinct from current operations? (If no, it's the base business.)
- Does its success depend on conditions in the world? (If no, it's pure execution.)
- Could it fail in a way that matters to the company? (If no, it's not a real bet.)

**Judgment moment 1.2 — how granular should initiatives be?**

A common error is making initiatives too broad ("Shell's hydrogen strategy") or too narrow ("Holland Hydrogen 1 commissioning"). The right granularity is the level at which the dependency structure is coherent — different conditions in the world matter, different signals route, different claims are made.

Heuristic: if two candidate initiatives share most of the same entities and the same risk profile, fold them into one. If a candidate initiative's principal technology and dependencies are markedly different from another's, split.

Example of good granularity for Shell H3 hydrogen:
- "NW European green hydrogen ecosystem play" (one initiative)
- "Polaris CCS blue hydrogen play" (separate initiative — different technology, different geography, different regulatory framework)

Example of wrong granularity:
- "Shell's hydrogen strategy" (too broad — green and blue have different bets)
- "Holland Hydrogen 1" + "REFHYNE II" + "NortH2 participation" (too narrow — these are projects within one bet)

**Output:**

A list of initiative candidates, each with a one-paragraph framing. For Shell H3 with a typical scope, expect 8-15 initiative candidates. Some will drop in step 2 after closer scoping.

---

### Step 2 — Initiative scoping

**Input:** initiative candidate list from step 1.

**Procedure:**

For each candidate, ask the bounding questions:

- What's in scope of this initiative, what's out of scope?
- What's the time horizon explicitly?
- What's the success criterion (decision threshold) explicitly?
- Is this initiative actually distinct from another one in the list, or do they overlap enough to merge?

Write the bounding decisions for each candidate in 2-3 sentences.

If a candidate fails the qualification tests in 1.1 on closer reading, drop it. Note why it was dropped in case the same question arises for another company.

**Judgment moment 2.1 — when to merge two candidate initiatives?**

If two candidates have the same principal technology or are about the same fundamental bet, merge them. If they're different bets with overlapping support, keep them separate.

Test: can you write one hypothesis statement that covers both candidates without losing meaning? If yes, merge. If the merged statement is mush, keep separate.

**Judgment moment 2.2 — when to split a candidate?**

If one candidate covers two distinct technological pathways, two distinct geographies, or two distinct time horizons, it might be two initiatives. The test: do they have the same principal entities and the same external threats? If yes, one initiative. If no, two.

**Output:**

The final scoped initiative list, typically 8-15 rows, each with title, time horizon, decision threshold, and bounding notes.

---

### Step 3 — Per-initiative metadata

**Input:** scoped initiative list from step 2.

**Procedure:**

For each initiative, populate the row in the `initiatives` table per INITIATIVE_MODEL.md section 3.1. Specifically:

- `id` — assign per the convention `COMPANY_HORIZON_TOPIC` (e.g. `SHELL_H3_HYDROGEN_NWE`, `BP_H3_OFFSHORE_WIND_NSEA`). Stable identifiers.
- `name` — the human-readable name from step 2.
- `company` — the company.
- `segment` — the company's own reporting segment.
- `register` — usually `CLIENT_ACCOUNT` for company-specific initiatives. Use `INDUSTRY` if the initiative is one a whole industry is making, `SECTOR` for sector-wide bets, `PERSONAL` for analyst-personal bets. Most company population produces CLIENT_ACCOUNT initiatives.
- `hypothesis_statement` — write the IF-AND-ONLY-IF style statement. Format guidance below.
- `time_horizon` — year or year range.
- `decision_window` — when key go/no-go decisions fall due.
- `decision_threshold` — quantified success criterion from step 2.
- `baseline_confidence` — leave at 0.500 (will be set in step 9).

**Hypothesis statement format:**

The statement should be one sentence that names the company, the bet, the time horizon, and the contingency. It should be falsifiable — there should be possible futures in which the statement is clearly true and clearly false.

Format: *"[Company]'s [bet description] will be delivered/achieved by [time horizon], contingent on [the key contingency conditions]."*

Examples:
- "Shell's announced 2030 NW European hydrogen production capacity will be delivered within ±25% of stated targets, contingent on parallel ecosystem maturation across pipeline, offtake, and regulatory dimensions."
- "BP's offshore wind portfolio in Northern European waters will reach FID on >3 GW by 2027, contingent on PPA pricing and turbine supply chain economics holding."

**Judgment moment 3.1 — what level of contingency to name in the statement?**

Too few contingencies and the statement is fluffy. Too many and it's a paragraph. Aim for 2-4 named contingency dimensions in the statement, with the entities and links carrying the detail.

**Output:**

The `initiatives` table populated with one row per initiative.

---

### Step 4 — Principal entity identification

**Input:** populated initiatives table; T1 and T2 sources.

**Procedure:**

For each initiative, ask: what is this initiative *fundamentally about*? Which 1-3 things in the world is it a bet on?

Per INITIATIVE_MODEL.md section 3.3.1, principal entities are those without which the initiative cannot be separated from itself. They're the core technologies, market conditions, or actors that the bet is fundamentally about.

For each principal:

- Search the existing entity catalogue (per section 8 below). If the entity exists, reference it.
- If it doesn't exist, create a new entity row per INITIATIVE_MODEL.md section 3.2. Apply the entity creation discipline — only create if expected to be reused across at least 2 initiatives or 2 companies. Apply the naming convention.
- Create the link from the initiative to the entity with `role: principal`. Set impact = `neutral` unless explicitly amplifying or threatening (rare for principals).

**Judgment moment 4.1 — how many principals should an initiative have?**

Most well-bounded initiatives have 1-2 principals. Three is the ceiling. More than three suggests the initiative isn't well-bounded and should be split.

If you find yourself trying to assign principal to four or more entities, apply the test: would the initiative still be recognisable as itself if you removed this entity? If yes for three of them, those three aren't actually principal — they're enabling.

**Judgment moment 4.2 — what counts as principal versus enabling?**

Principal = the initiative is fundamentally about this entity. Enabling = the initiative depends on this entity but isn't fundamentally about it.

Examples to clarify:
- Shell's NW European green hydrogen play. Principal: PEM electrolyser at industrial scale (the play *is* about scaling PEM). Enabling: industrial offtake FIDs (necessary but the play isn't about offtake demand specifically). Enabling: EU Hydrogen Bank (matters but isn't the topic of the play).
- Shell's Polaris CCS blue hydrogen play. Principal: SMR with CCS at scale (the play *is* about CCS). Enabling: CCS regulatory framework (matters but the play isn't about regulation). Enabling: Alberta CCS hub infrastructure.

**Output:**

For each initiative, 1-3 principal links populated. New entities created in the catalogue as needed.

---

### Step 5 — Enabling entity identification

**Input:** populated initiatives table; principal links from step 4; T1-T5 sources.

**Procedure:**

For each initiative, ask: what does this bet *depend on* that isn't its core? Markets, regulations, ecosystem actors, infrastructure, partnerships.

Walk the dependency tree:
- Demand-side: what offtake or market conditions does the initiative require?
- Supply-side: what input technologies, materials, or capacity does it require?
- Regulatory: what policy frameworks must be in place?
- Infrastructure/ecosystem: what physical or institutional infrastructure must exist?
- Partnership: what multi-party arrangements does the initiative depend on?

For each dependency, decide whether it warrants entity status. The entity creation discipline applies — would this entity be referenced by other initiatives or companies?

For entities that warrant status:
- Search catalogue, create if needed.
- Create the link with `role: enabling`. Set impact = `neutral` (almost always for enabling; amplifying-impact enabling is rare and usually wrong).

For dependencies that don't warrant entity status (initiative-specific minutiae), document them in the initiative's `note` or in the relevant link's `claim_basis` rather than as separate entities.

**Judgment moment 5.1 — how many enabling links per initiative?**

Typical range: 3-5. Some initiatives are simple structurally and have only 1-2 enabling links. Others are complex and have 6-8.

**Hard constraint:** if you reach 8 enabling links and want to add a ninth, stop. Either consolidate two existing entities into a higher-level entity (e.g. fold "EU Hydrogen Bank" and "RED III implementation" into a single "EU green hydrogen policy framework" entity if neither is independently load-bearing), or accept that some dependencies are absorbed into the principal entity's note rather than getting their own link. The model's signal-to-noise breaks down with too many enabling links, and the analyst's ability to maintain coherent state assessments across the set degrades.

If you find yourself routinely hitting the 8-link constraint across multiple initiatives, the underlying issue is probably initiative scoping (the initiatives are too broad) rather than entity coverage. Return to step 2.

**Judgment moment 5.2 — entity creation discipline in action.**

When considering creating a new enabling entity, ask: which other initiatives at this company or other companies in scope would reference this entity?

If the answer is "probably none, this is unique to this initiative" — fold it into the principal entity's note or the link's claim_basis. Don't create.

If the answer is "yes, multiple — this is a common dependency" — create. The entity is worth the catalogue slot because future population will reuse it.

This is the discipline that prevents entity catalogue fragmentation.

**Output:**

For each initiative, 3-5 (typically) enabling links populated. Entity catalogue extended where reuse is expected.

---

### Step 6 — External threat identification

**Input:** populated initiatives; T2 (technology readiness) sources especially valuable here; competitor analysis.

**Procedure:**

For each initiative, ask: what could happen *outside* this initiative that would invalidate it?

Categories of external threat:
- **Disruptive technologies**: alternative pathways that solve the same problem differently. Direct reduced iron without hydrogen for Shell's green hydrogen play. Solid-state batteries for a 12V battery initiative.
- **Regulatory shifts**: changes in policy that remove the basis for the bet. Carbon price collapse for a CCS-dependent initiative. Removal of subsidy frameworks.
- **Market shifts**: changes in demand that obsolete the bet. Demand peak earlier than assumed. Substitution by alternative products.
- **Competitor moves**: structural moves that undermine the initiative's market position. (Most competitor moves are events, not entities — see step 6's note on the boundary with competitive_events.)

For each external threat:
- Create or reference the entity. The entity is the threat itself, not the company at threat.
- Create a link with `role: external`, `impact: threatening`.
- Apply criticality discipline per INITIATIVE_MODEL.md section 3.3.3 — gating only if arrival would make the decision threshold structurally unattainable; enabling-criticality otherwise.

**Judgment moment 6.1 — when is a competitive move a threat-entity versus a competitive-event?**

A persistent structural threat (e.g. an alternative technology pathway being developed by multiple competitors) is an entity. A specific event (a particular competitor announcement, a particular FID, a particular partnership) is a competitive_event.

If you find yourself wanting to track a specific company's specific announcement, that's an event. If you're tracking the broader trajectory of "non-H2 DRI maturation" across multiple actors, that's an entity.

**Judgment moment 6.2 — how many external threats per initiative?**

Typical range: 0-2. Some initiatives have no external threats (the bet is on internal execution and known dependencies). Some have 2 substantive external threats. Three or more is rare and usually represents either over-pessimism or genuinely high external-uncertainty initiatives.

**Output:**

For each initiative, external threat links populated where threats exist. Entity catalogue extended.

---

### Step 7 — Link assignment

**Input:** all link rows from steps 4-6 with role and impact set; T1-T5 sources for claim writing.

**Procedure:**

For each link, fill in:
- `criticality` — per INITIATIVE_MODEL.md section 3.3.3.
- `claim` — per the four-component format (metric + threshold + context + time) from INITIATIVE_MODEL.md section 3.3 claim writing rule.
- `claim_basis` — analyst reasoning for the claim, the role, and the criticality.

Criticality assignment is the most important judgment in this step. The behaviour rule is dominated by criticality (3:1:0.3 ratio between gating, enabling, non-critical). Over-tagging gating produces models that overreact to noise; under-tagging produces models that underreact to genuine risks.

**Judgment moment 7.1 — criticality assignment by category:**

For **principal** links: usually `gating` (the initiative is fundamentally about this entity, so a gating dependency is structurally appropriate). Rarely `enabling`. Never `non-critical` — if a principal link isn't critical, the role assignment is probably wrong.

For **enabling** links: usually `enabling` (matters but not single-point-of-failure). Some are `gating` if they're enabling dependencies that nonetheless gate (e.g. "EU Hydrogen Backbone is enabling-role because the play isn't about pipelines, but is gating-criticality because without pipelines the production is stranded"). Some are `non-critical` if they're tracked-because-relevant rather than load-bearing.

For **optional** links: usually `non-critical`. If something is optional, it's typically not gating.

For **external** links with `threatening` impact: gating only if structurally initiative-killing per the special-case rule. Most external threats are enabling-criticality.

**Judgment moment 7.2 — claim writing.**

Apply the four-component format. The claim must contain:
- A specific metric (CAPEX in €/kW, demand in Mtpa, count of FIDs, regulatory state)
- A specific threshold or value
- A context/scale qualifier (>100MW scale, NW Europe, sustained)
- A time (by 2028, through 2035, by end-2026)

If you can't write all four components confidently, the entity may be too vague to support a claim, the link may not warrant existence, or the analytical position may not yet be sharp enough. Address the underlying issue rather than admitting a vague claim.

For external threats, claims often take negation form: "Non-H2 DRI does NOT reach commercial scale before 2030." This is the right form for tracking whether the threat arrives.

**Judgment moment 7.3 — claim basis.**

The `claim_basis` field is the audit trail. One or two sentences explaining why this claim, this role, this criticality. It's read by future analysts (or AI systems) trying to understand why the link looks the way it does.

Good claim_basis: "Without this CAPEX trajectory, Holland Hydrogen 1 follow-on and REFHYNE II don't reach FID. Cost-down dependent on cumulative deployment volume per IRENA cost report."

Bad claim_basis: "Important." (no reasoning, no audit trail)

**Output:**

All link rows fully populated.

---

### Step 8 — State assessment

**Input:** populated entities; T1-T5 sources.

**Procedure:**

For each entity in the catalogue (newly created or pre-existing) referenced by initiatives populated in this run, assess current state per the operational definitions in INITIATIVE_MODEL.md section 3.2.2:

- `holding` — supportive or neutral evidence in last 3-6 months.
- `weakening` — directional evidence against threshold accumulated in last 3-6 months.
- `broken` — sustained negative signals over 6+ months or one major structural negative event.
- `ambiguous` — genuinely mixed evidence that hasn't resolved.

State assignment must be defensible by reference to specific recent signals or evidence. Document the basis in `note` and the supporting sources in `sources`.

**Judgment moment 8.1 — state assignment under uncertainty.**

When evidence is thin or uncertain, default to `holding` if there's no specific reason for concern (the entity is consistent with its threshold being met until something specific suggests otherwise). Default to `weakening` if there's some concern but not catastrophic. Reserve `ambiguous` for genuine evidence-mixed cases.

Do not use `ambiguous` as a default for "I don't know" — that abdicates the assessment. If you don't know enough to assess, do more reading first.

**Judgment moment 8.2 — when an existing entity already has a state, do you update it?**

If the entity is in the catalogue from prior population and the state assessment based on current sources differs from the recorded state, update it. The entity's state is a fact about the world's current condition; if the world has changed, so should the state.

Document the change in the entity's `last_updated_at` and the basis in `note`.

**Output:**

Entity states populated for all entities referenced in this population run.

---

### Step 9 — Baseline confidence

**Input:** populated initiatives with their link sets and entity states.

**Procedure:**

For each initiative, set the `baseline_confidence` value [0.000, 1.000].

Default starting point: 0.500 (structurally uncertain, neither validating nor falsifying).

Adjustments:
- All gating links holding: shift toward 0.600.
- One gating link weakening: shift toward 0.450.
- Multiple gating links weakening: shift toward 0.400.
- Any gating link broken: shift toward 0.300.
- All enabling links holding alongside gating links holding: shift toward 0.650.
- Multiple gating links holding plus active threatening external entity: stay near 0.500 (threat balances internal positive).

These are heuristics, not rules. The point is to set a starting confidence that reflects the analyst's read of the link set as a whole. The signal pipeline will move the band over time; baseline is the starting position.

Set `current_confidence` equal to `baseline_confidence` at this stage. Subsequent signal application will diverge them.

**Judgment moment 9.1 — when is baseline confidence too high or too low?**

If the populated initiative reads as obviously well-positioned with no concerning state assessments, baseline near 0.700 may be appropriate. If it reads as obviously poorly-positioned with multiple gating links broken, baseline near 0.250 may be appropriate.

Avoid extremes (>0.800 or <0.200) unless the position genuinely warrants them. Most initiatives at population time should sit in the 0.350-0.700 range because real bets carry real uncertainty.

**Note on the limits of baseline precision.** Baseline confidence is analyst judgment and will vary between analysts populating the same initiative. Two competent analysts may set 0.520 versus 0.580 for the same initiative based on the same evidence. This variance is normal and not a system failure.

The model's value is in *movement* over time as signals arrive — the slope and direction of confidence change in response to evidence — rather than in the absolute starting position. Read baseline as "best-effort starting point, will be corrected by signal flow." Do not treat baseline values as carrying three significant figures of precision; they don't.

**Output:**

Each initiative has baseline_confidence and current_confidence set.

---

### Step 10 — Review and integration

**Input:** the populated company portfolio.

**Procedure:**

Read each initiative as a whole. For each, run the following checks:

**Check 10.1 — internal coherence.** Does the dependency structure make sense? Are the principal entities really principal? Are there obvious gaps (a major external threat not captured, a key regulatory framework missing)? Is the link count in healthy range (typically 4-10 links per initiative)?

**Check 10.2 — biggest-risk query.** For each initiative, run the query: rank links by criticality_weight × state_severity. Does the top result make sense as the biggest risk? If the top result is a link you'd consider trivial, the criticality assignment is probably wrong on that link. Adjust.

**Check 10.3 — entity catalogue integrity.** For each newly-created entity, ask: would this be referenced by another company's initiatives? If no for any entity, consider folding it into a parent entity's note. The entity should have crossover potential.

**Check 10.4 — claim quality.** Spot-check 5-10 claims from across the population. Do they all satisfy the four-component format? If any claims are vague, fix them. If a claim resists being made specific, the underlying analytical position needs sharpening.

**Check 10.5 — cross-initiative consistency.** Where the same entity appears in multiple initiatives, check that the role/impact/criticality assignments are consistent with each initiative's actual relationship to the entity. The same entity (EU ETS, say) can be enabling-criticality for one initiative and non-critical for another, but the assignments should be defensible.

**Check 10.6 — register volume.** Count the populated initiatives. Does the count match the scope's expectation (8-15 typically)? Are the initiatives distinct enough from each other (no two are essentially the same bet)?

**Output:**

A reviewed and revised populated company portfolio. Document any unresolved questions or known gaps in a separate notes file for follow-up.

**Completion criteria — when to stop:**

The procedure is complete for an initiative when all of the following are true:

- All principal links are defined (1-3 per initiative).
- 3-5 enabling links are defined (more is allowed up to the hard constraint of 8; fewer is allowed if the initiative is genuinely simple).
- 0-2 external threat links are defined where threats exist; zero is fine if no structural external threats apply.
- All links have role, impact, criticality, claim, claim_basis populated. No fields are blank.
- All entities referenced have current_state, threshold, state, note, sources populated. No entity is left as a stub.
- Baseline confidence is set with reasoning visible in claim_basis assessments or notes.
- The biggest-risk query (criticality_weight × state_severity ranking) produces a result that an experienced analyst would find credible — not surprising in either direction.

When all criteria are met, stop. Do not keep adding entities or refining claims past these markers. The model's value is in being populated to a defined standard across many initiatives, not in any single initiative being maximally rich.

If you find yourself wanting to keep refining beyond the criteria, the impulse is usually one of three things:
- The initiative is genuinely complex and warrants splitting into two initiatives. Consider step 2 again.
- The analytical position is unclear and you're trying to think it through by adding model detail. Better to write the thinking in the initiative's note field and resolve the analytical question separately.
- Perfectionism. The model handles incompleteness gracefully — partial coverage updated as new information arrives is preferable to over-engineering at population time.

---

## 4. Time and effort

For a first-time population of a major company in scope (e.g. Shell, BP, ExxonMobil) with substantial public sources, expect:

- Steps 1-3 (initiative inventory through metadata): 2-3 hours.
- Steps 4-6 (entity identification): 3-4 hours.
- Step 7 (link assignment with claim writing): 2-3 hours.
- Steps 8-9 (state and confidence): 1-2 hours.
- Step 10 (review): 1 hour.

Total: 9-13 hours for a major company first pass.

Subsequent companies in the same sector are faster because the entity catalogue covers more of what's needed. A second IOC after Shell with substantial entity overlap might take 5-7 hours. By the fourth or fifth IOC, populating one might take 3-4 hours.

This is the compounding curve that justifies the depth-over-breadth strategy. Five companies populated deeply is more useful than fifty populated shallowly, and the marginal cost falls per company.

## 5. Source weighting

When evidence from different source tiers conflicts, default weights:

- T1 (corporate primary) > T5 (executive commentary). What the company has formally committed to outweighs what executives have said in passing.
- T2 (technology readiness, independent) > T1 (corporate claims about technology). Independent assessments of TRL outweigh self-reporting.
- T3 (financial substance) is the reality check. Capital flows reveal the real commitment level. If T1 says one thing and T3 says another, T3 wins.
- T4 (regulatory state) is the binding constraint check. Regulations override commitments — a regulatory shift can invalidate any number of company plans.

When sources within a tier conflict (e.g. two corporate documents disagree), use the most recent. If the most recent is also vaguer or less committal, that's itself a signal and should be reflected in state assessment (likely `weakening`).

## 6. Boundary cases and escapes

**What if an initiative doesn't fit cleanly into a four-table model?**

Most don't perfectly. Document the discomfort in the initiative's note field and proceed with the closest fit. If the same discomfort recurs across multiple initiatives, the model itself may need to flex; flag for review of INITIATIVE_MODEL.md.

**What if a key entity has very thin public information?**

Create the entity, set state cautiously (likely `ambiguous` or `holding` depending on what little is known), document the thin sourcing in `note`, and note the gap. Future analysts or signal flow will fill in detail.

**What if two initiatives genuinely share the same principal technology?**

That's normal. The entity exists once; both initiatives link to it. The link from each initiative carries its own criticality and claim, which may be similar or different.

**What if an entity needs to track different metrics for different initiatives?**

The entity carries one current_state and one threshold (because it's one thing in the world). The differences between initiatives' relationships to the entity are captured in the link's claim. If two initiatives genuinely care about different aspects of the same entity, write claims that reference those aspects: "Asia-Pacific LNG demand maintains >550 Mtpa sustained through 2035" for LNG Canada Phase 2; "Asia-Pacific LNG demand maintains >550 Mtpa sustained through 2035" for Qatar NFE — same entity, same claim, but the criticality may differ between the two initiatives.

If the entity's current_state needs to be split into two distinct measurements that don't share a single state assessment, the entity should probably be split into two entities. Apply judgment.

## 7. Anti-patterns and failure modes

### 7.1 Procedural anti-patterns

**Skipping the initiative inventory step.** Diving straight into entity creation without a complete initiative list produces a fragmented model where some bets are well-covered and others are missing. Always inventory first.

**Populating one initiative end-to-end before starting the next.** Slower than batching across initiatives. Better: populate metadata for all initiatives first (steps 1-3), then sweep through entity identification across all (steps 4-6), then sweep through link assignment (step 7). Batching surfaces entity reuse opportunities and produces more consistent treatment across initiatives.

**Treating the entity catalogue as ad-hoc.** Creating entities without checking the catalogue produces duplicates. Always search before creating.

### 7.2 Content anti-patterns

**Vague hypothesis statements.** "Shell will succeed in hydrogen" is not a hypothesis statement. It has no time horizon, no decision threshold, no contingency. Write proper IF-AND-ONLY-IF style statements per step 3.

**Padding link counts.** If an initiative naturally has 3 links, don't pad it to 6 to look more substantial. The model handles light initiatives fine. Three real links beats six padded ones.

**Hedging on criticality.** Every link must declare criticality. "Probably enabling but maybe gating" isn't a value. Pick one and document the reasoning in claim_basis.

**Reusing claim text across links.** Each link has its own claim. Two links to the same entity from different initiatives may carry the same claim text, but that's a coincidence — the claim is about *this entity in this initiative*, and identical text should be a deliberate result, not a copy-paste.

### 7.3 Process anti-patterns

**Stopping before review.** Skipping step 10 produces models that look complete but have errors in criticality, state, or claim quality. The review is where errors get caught.

**Confusing methodology updates with model updates.** If you find the methodology lacking, update this document. If you find the model lacking, update INITIATIVE_MODEL.md. They're separate concerns. A methodology fix shouldn't require a model migration.

## 8. Working with the entity catalogue

The entity catalogue is global — entities exist once and are referenced by links from initiatives across companies. Working with it has discipline.

### 8.1 Searching the catalogue

Before creating any entity, search:
- By exact name.
- By keyword (e.g. "ETS", "carbon price", "EU emissions" should all surface the EU ETS entity).
- By entity type (filter to `regulation`, then scan for similar regulatory entities).
- By connection (which other entities are referenced by similar initiatives).

If a search surfaces an entity that's close but not identical, ask: is the difference substantive? If yes, two entities. If the difference is just naming or framing, reuse the existing one and update its name or note if needed.

### 8.2 Creating new entities

Apply the entity creation discipline strictly. Create only when:
- The entity will be referenced by ≥2 initiatives or ≥2 companies (current or expected).
- The naming follows the convention (SCREAMING_SNAKE_CASE, descriptive).
- The current_state, threshold, note, sources fields can all be populated meaningfully now.
- A search of the catalogue confirms no existing entity covers the same thing.

### 8.3 Updating existing entities

When new sources reveal that an entity's current_state or note should change:
- Update the fields.
- Update `last_updated_at`.
- The state change should be defensible by specific evidence; document it in note.

### 8.4 Splitting and merging entities

Occasionally an entity needs to be split (it's been doing the work of two entities) or two entities need to be merged (they're duplicates).

Splitting: create the two new entities, migrate links from the old entity to whichever new entity is appropriate, archive the old entity.

Merging: pick one as canonical, migrate links from the other to canonical, archive the duplicate.

Both operations leave a paper trail in `note` and the entity registry. Avoid frequent splitting/merging by being deliberate at creation time.

## 9. Multi-company population

When populating a second or third company in scope:

**Reuse expectation:** at least 30-50% of entities for the second IOC should be reusable from the first. By the fifth IOC, 60-70% reuse is typical.

**Per-company differences in same entity:** the entity exists once; the links from each company's initiatives carry their own role/criticality/claim. Different companies may relate to the same entity differently — this is captured in the link, not in a duplicate entity.

**Cross-company analysis:** once 3+ companies are populated, the catalogue allows cross-company queries: "which companies have a gating dependency on EU Hydrogen Backbone?" "which companies treat solid-state batteries as principal?" These queries reveal portfolio-level patterns that aren't visible from any single company's analysis. They become a deliverable in their own right.

## 10. Output and validation

### 10.1 What a successfully populated company looks like

- 8-15 initiatives populated end-to-end.
- 30-60 entities referenced (with reuse from prior population if available).
- 50-120 links populated with full role/impact/criticality/claim/claim_basis.
- 0-10 competitive_events populated as starting state.
- All initiatives have set baseline_confidence and current_confidence.
- All entities have state, note, sources populated.
- Step 10 review completed; any open questions documented.

### 10.2 Smoke tests

After population, run these queries to validate:

- **Cross-initiative biggest-risk query**: rank all links across all initiatives by criticality_weight × state_severity. The top 5-10 results should be plausible candidates for "biggest portfolio risks." If they're all from one initiative, the criticality assignments are likely uneven.

- **Entity reuse check**: count entities by reuse (number of initiatives referencing each). Most should be referenced by 1-3 initiatives. If many entities are referenced by only 1, the catalogue may be fragmented; review whether some should be folded.

- **Confidence band distribution**: histogram of baseline_confidence values across initiatives. If most cluster around 0.500, baselines weren't differentiated. If many are at extremes (>0.700 or <0.300), they may be over-confident either direction.

- **Coverage gap check**: are there initiatives the company has clearly committed to that aren't in the population? If yes, return to step 1.

### 10.3 Handoff

The populated portfolio is the input to:
- The visualisation layer (see model spec).
- The signal pipeline (see SIGNAL_PIPELINE.md).
- Cross-company analysis (see future work).

Hand off when validation passes. Note any open questions or known gaps in the company's notes file for follow-up.

## 11. Versioning

This is version 1.0 of the methodology. The methodology is paired with version 1.0 of INITIATIVE_MODEL.md. Mixing methodology and model versions across a population effort is an error.

Future methodology versions may add:
- Magnitude and assessment-confidence factors to claim assessment (paired with model rule extension).
- Technology-to-technology dependency capture (paired with new model relationship table).
- Templated initiative shapes for common sectors (faster population for commodity sectors).

These extensions are deferred to v2 or beyond. The v1 methodology above is deliberately complete for the v1 model and no more.
