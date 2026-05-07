// db/population/P1_BP_hypotheses.mjs
// Path A — BP hypotheses populated from `bp_intelligence_brief__3_.html`
// (March 2026, posture: RESTRUCTURE, refresh source list: IEA Hydrogen
// Review 2025, BP Strategy Reset Feb 2025, CCSA Delivery Plan Dec 2025,
// IEA WEO 2025).
//
// Three hypotheses transcribed from the brief's HYP register:
//   BP-01 — M&A vulnerability through end-2027 (H1, Medium, 76%)
//   BP-02 — Upstream gas portfolio (GoM + N Africa) primary cash generator by 2028 (H2, High, 72%)
//   BP-03 — Hydrogen + CCUS portfolio rationalisation to 2-3 flagships by end-2026 (H1, Medium, 84%)
//
// Brief HYP cards quoted directly. WNTBT items become the decision_threshold
// prose. System drivers become components (one per signalled driver). Where
// the brief's structure shows a non-signalled driver, the component is still
// recorded (state='holding') because the driver matters even if the brief
// hasn't currently flagged it.
//
// Idempotent. Re-running with --commit upserts initiatives by (company_id,
// name); components by (initiative_id, name); attribute rows are auto-created
// by trigger then resolved to populated/not_in_source via the populator.
//
// Run:
//   node db/population/P1_BP_hypotheses.mjs           # dry-run
//   node db/population/P1_BP_hypotheses.mjs --commit  # write to PG
//
// Conflict context with existing data:
//   - BP plc has 1 existing initiative (id=18, "Industrial blue hydrogen
//     leadership (H2Teesside + East Coast Cluster + Saltend partnership)")
//     seeded by db/population/017_bp_blue_h2_ontology.mjs. That row is for
//     ontology-pair anchoring and frames blue-H2 positively (leadership).
//     This script's BP-03 frames the same portfolio negatively (rationalisation
//     down to 2-3 flagships) — they are different hypotheses about the same
//     asset class and are intended to coexist. No deletion of id=18.

import { runPopulation } from './_populator_v2.mjs';

const COMMIT = process.argv.includes('--commit');
const BRIEF = 'bp_intelligence_brief__3_.html (March 2026, posture RESTRUCTURE)';

const company = {
  name: 'BP plc',
  sector: 'energy',
  notes: 'Royal Dutch Shell BP plc — UK-incorporated integrated energy. v2 catalogue first-cut hypotheses sourced from March 2026 brief.',
};

const initiatives = [
  // ============================================================================
  // BP-01 — M&A vulnerability through end-2027
  // ============================================================================
  {
    name: 'BP M&A vulnerability and forced restructuring window through end-2027',
    strategy_context: `BP's market cap (~$75B in 2025, less than half of ExxonMobil's) combined with the Elliott Management activist stake creates a credible acquisition window. Strategy reset has stabilised investor sentiment but has not produced a material re-rating. Brief assesses this is a TIME-SENSITIVE engagement window because any M&A event will reshuffle the European-major technology scouting landscape.`,
    brief_description: 'Whether BP is forced into an M&A approach or merger before end-2027.',
    hypothesis_statement: `BP will be subject to a credible M&A approach or forced merger before end-2027, driven by activist pressure (Elliott Management), low valuation (EV/EBITDA discount >25% to Shell and TotalEnergies), and strategic asset quality concerns. Source: ${BRIEF}, HYP BP-01.`,
    why_it_matters: 'Any acquisition reshuffles the European major technology scouting landscape — vendor, partner, and stakeholder maps reset. FutureBridge engagement model needs to anticipate the post-M&A landscape, not the current one.',
    horizon: 'H1',
    persona: 'strategy',
    time_horizon_year: 2027,
    time_horizon_source: `${BRIEF} HYP BP-01 (H1 · 1–3yr)`,
    decision_threshold: [
      'BP EV/EBITDA discount to Shell and TotalEnergies persists above 25% through end-2025;',
      'Activist investor builds more than 3% stake and publicly advocates structural change;',
      'Asset disposal programme reveals stranded book value triggering reassessment of net asset quality;',
      'No credible strategic plan produces a meaningful re-rating within 12 months of announcement.',
      'All four conditions must hold for the hypothesis to confirm. (WNTBT, brief HYP BP-01.)',
    ].join(' '),
    baseline_confidence: 0.76,
    current_confidence: 0.76,
    state: 'strengthening',
    trajectory: 'deteriorating',
    state_reasoning: 'Hypothesis is gaining support: Elliott stake announced + valuation discount persisting + asset disposal programme active. Brief assesses 76% probability — high for an H1 M&A call.',
    trajectory_reasoning: `Underlying trajectory for BP's defensive position is deteriorating — strategy reset has not yet re-rated the stock and the disposal programme keeps surfacing book-value gaps. Source: ${BRIEF} Section 02 (M&A vulnerability context); Section 06 weak signals S-01 + S-04.`,
    components: [
      {
        name: 'BP_VALUATION_DISCOUNT_PERSISTENCE',
        description: 'BP EV/EBITDA discount to Shell and TotalEnergies — the Market system driver for the hypothesis. Persistence above 25% through end-2025 is WNTBT condition 1.',
        component_type: 'market',
        vector: 'market',
        cross_industry: false,
        source_citation: `${BRIEF} HYP BP-01 (System Driver: Market — Activist investor positioning and M&A signals; WNTBT bullet 1)`,
        state: 'weakening',
        trajectory: 'deteriorating',
        state_reasoning: 'Brief assesses BP at distressed valuation as of March 2026; discount has not closed.',
        trajectory_reasoning: 'Strategy reset announcement has not produced re-rating; disposal programme surfacing further book-value gaps. Brief Section 02 + Section 03 peer table show BP cap ~$75B vs Shell + TotalEnergies materially above.',
      },
      {
        name: 'BP_ACTIVIST_INVESTOR_ESCALATION',
        description: 'Elliott Management 13F position and activist escalation on BP. Captures the live SIGNAL from the Market driver per the brief.',
        component_type: 'market',
        vector: 'market',
        cross_industry: false,
        source_citation: `${BRIEF} HYP BP-01 (live source: Activist investor 13F + regulatory filings); Section 06 S-04 Elliott activist escalation`,
        state: 'strengthening',
        trajectory: 'volatile',
        state_reasoning: 'Brief Section 06 S-04 rates Signal Strength 9/10. Elliott stake creates board-level intervention pressure.',
        trajectory_reasoning: 'Activist escalation pace is volatile — depends on filings cadence and BP board response.',
      },
      {
        name: 'BP_ASSET_DISPOSAL_BOOK_VALUE_GAP',
        description: 'BP $5B asset disposal programme (wind, non-core upstream, chemicals) and whether disposal prices reveal stranded book value vs carrying value. WNTBT condition 3.',
        component_type: 'market',
        vector: 'market',
        cross_industry: false,
        source_citation: `${BRIEF} Section 04 Initiative "Asset Disposal Programme" (50% progress, $5B target 2025); HYP BP-01 WNTBT condition 3`,
        state: 'strengthening',
        trajectory: 'deteriorating',
        state_reasoning: 'Disposal programme in active execution per brief. Wind portfolio sales (Empire Wind to Equinor) are realised; chemicals + non-core upstream tranches in flight.',
        trajectory_reasoning: 'Brief Section 02 strategy box notes "some assets going at below fair value" — directional indicator of stranded book-value exposure.',
      },
      {
        name: 'UK_TAKEOVER_PANEL_AND_ENERGY_SECURITY_REGIME',
        description: 'UK Takeover Panel rules on bid timetables and the UK government energy security framework that gates a Shell-BP-style transaction. Policy system driver per the brief.',
        component_type: 'regulation',
        vector: 'regulation',
        cross_industry: false,
        source_citation: `${BRIEF} HYP BP-01 (System Driver: Policy — Takeover panel rules and UK government energy security)`,
        state: 'holding',
        trajectory: 'stable',
        state_reasoning: 'No regulatory shift indicated in brief. UK Takeover Panel rules are stable; energy security framing has been live since 2022 but is not currently shifting.',
        trajectory_reasoning: 'Brief does not flag near-term Takeover Panel rule changes; energy security politics could shift the timetable but is not flagged as a current driver.',
      },
    ],
    claims: [
      {
        component_name: 'BP_VALUATION_DISCOUNT_PERSISTENCE',
        role: 'principal',
        impact: 'amplifying',
        criticality: 'critical',
        claim_text: 'EV/EBITDA discount to Shell and TotalEnergies persisting above 25% through end-2025 is the principal anchor for the M&A vulnerability hypothesis.',
        claim_basis: `Brief HYP BP-01 WNTBT bullet 1; Section 02 strategy assessment names valuation as the M&A trigger condition. Source: ${BRIEF}.`,
        threshold_op: 'gt',
        threshold_value_numeric: 25,
        threshold_unit: 'pct',
        threshold_direction: 'crossing_falsifies',
        criticality_reasoning: 'Without sustained valuation discount the M&A thesis collapses — every other condition is amplifying not principal.',
        impact_reasoning: 'Larger discount → stronger M&A pressure → hypothesis more likely to confirm.',
      },
      {
        component_name: 'BP_ACTIVIST_INVESTOR_ESCALATION',
        role: 'enabling',
        impact: 'amplifying',
        criticality: 'high',
        claim_text: 'Elliott Management or another activist investor builds >3% stake AND publicly advocates structural change before end-2026.',
        claim_basis: `Brief HYP BP-01 WNTBT bullet 2; Section 06 S-04. Source: ${BRIEF}.`,
        threshold_op: 'gt',
        threshold_value_numeric: 3,
        threshold_unit: 'pct',
        threshold_direction: 'toward_threshold_increases_confidence',
        criticality_reasoning: 'Activist stake and public advocacy together are the operational forcing function; absent both, board can defer.',
        impact_reasoning: 'Each percentage point of activist position raises the public-pressure cost on BP board.',
      },
      {
        component_name: 'BP_ASSET_DISPOSAL_BOOK_VALUE_GAP',
        role: 'enabling',
        impact: 'amplifying',
        criticality: 'medium',
        claim_text: 'Asset disposal programme realises sale prices materially below carrying value on >25% of disposed assets, triggering reassessment of NAV.',
        claim_basis: `Brief HYP BP-01 WNTBT bullet 3; Section 04 disposal programme. Source: ${BRIEF}.`,
        criticality_reasoning: 'Stranded book-value evidence accelerates the M&A case but is not strictly required if valuation gap and activist pressure both hold.',
        impact_reasoning: 'Visible stranded book-value findings amplify the activist narrative.',
      },
      {
        component_name: 'UK_TAKEOVER_PANEL_AND_ENERGY_SECURITY_REGIME',
        role: 'external_threat',
        impact: 'dampening',
        criticality: 'medium',
        claim_text: 'UK Takeover Panel rules or UK government national-security intervention block or materially delay a Shell-BP-style transaction.',
        claim_basis: `Brief HYP BP-01 (Policy system driver). Source: ${BRIEF}.`,
        criticality_reasoning: 'Regulatory blocker is the most likely break of the hypothesis — a successful UK political intervention would convert this hypothesis to falsified.',
        impact_reasoning: 'Regulatory friction lengthens timetables; full intervention dampens hypothesis confidence to zero.',
      },
    ],
  },

  // ============================================================================
  // BP-02 — Upstream gas portfolio primary cash generator by 2028
  // ============================================================================
  {
    name: 'BP upstream gas portfolio (Gulf of Mexico + North Africa) as primary cash generator by 2028',
    strategy_context: `BP reverses the Looney-era 40% production cut target and redirects an additional ~$1.5B/year into upstream. Mad Dog 2 (140k bbl/day, 2022) and Argos (140k bbl/day, 2023) are now in full production in the Gulf of Mexico. ACG (Azerbaijan, 30% stake) is contracted through 2050 as a long-plateau anchor. North Africa exploration FID pipeline is the directional growth bet.`,
    brief_description: 'Whether the upstream gas portfolio in GoM + N Africa becomes BP\'s primary cash flow engine by 2028.',
    hypothesis_statement: `BP's upstream gas portfolio in the Gulf of Mexico and North Africa will become its primary strategic asset by 2028, generating disproportionate free cash flow. Source: ${BRIEF}, HYP BP-02.`,
    why_it_matters: 'Subsurface AI, digital well optimisation, and production enhancement become the active scouting agenda for BP R&D. FutureBridge engagement priorities reorient toward upstream productivity rather than transition technology.',
    horizon: 'H2',
    persona: 'strategy',
    time_horizon_year: 2028,
    time_horizon_source: `${BRIEF} HYP BP-02 (H2 · 2–4yr)`,
    decision_threshold: [
      'BP completes more than $7B in renewables disposals by end-2026;',
      'BPX Energy posts more than $4B upstream free cash flow in 2026;',
      'North Africa gas exploration moves to FID on at least one project by 2026;',
      'BP dividend payout ratio stabilises above 40%.',
      'All four conditions must hold for the hypothesis to confirm. (WNTBT, brief HYP BP-02.)',
    ].join(' '),
    baseline_confidence: 0.72,
    current_confidence: 0.72,
    state: 'strengthening',
    trajectory: 'improving',
    state_reasoning: 'Brief Section 02 documents BP actively reversing the Looney target and redirecting capital to upstream. Mad Dog 2 + Argos already operational. Hypothesis is gaining structural support.',
    trajectory_reasoning: `Strategy reset is sustained through 2025 and into 2026; Brief Section 02 confirms continued upstream reinvestment. Source: ${BRIEF} Section 02 + Section 04 initiatives.`,
    components: [
      {
        name: 'GULF_OF_MEXICO_DEEPWATER_PRODUCTION',
        description: 'Mad Dog 2 (140k bbl/day, 2022) and Argos (140k bbl/day, 2023) are operational deepwater anchors. Centerpiece of the Gulf of Mexico cash engine per the brief.',
        component_type: 'tech',
        vector: 'tech',
        cross_industry: true,
        source_citation: `${BRIEF} Section 04 Initiatives "Mad Dog 2 / Argos — Gulf of Mexico" (90% progress, OPERATIONAL); Section 02 Strategy upstream refocus`,
        state: 'holding',
        trajectory: 'stable',
        state_reasoning: 'Both platforms in full production at design throughput. No degradation signal in brief.',
        trajectory_reasoning: 'Brief shows 90% progress and OPERATIONAL badge — production stable.',
      },
      {
        name: 'BPX_UPSTREAM_FREE_CASH_FLOW',
        description: 'BPX Energy (BP\'s US upstream subsidiary) free cash flow per barrel — the SIGNALled Economics driver. WNTBT condition 2 is BPX FCF > $4B in 2026.',
        component_type: 'market',
        vector: 'market',
        cross_industry: false,
        source_citation: `${BRIEF} HYP BP-02 (System Driver: Economics — BPX upstream free cash flow per barrel SIGNAL); WNTBT bullet 2`,
        state: 'strengthening',
        trajectory: 'improving',
        state_reasoning: 'Brief assesses confidence High on this hypothesis (72% probability). BPX cash performance in the trajectory consistent with the WNTBT $4B threshold.',
        trajectory_reasoning: 'BP capital reallocation toward upstream supports BPX FCF improvement; oil price assumption ($65-75/bbl base case, brief Section 05 scenarios) supports the threshold.',
      },
      {
        name: 'NORTH_AFRICA_GAS_EXPLORATION_FID_PIPELINE',
        description: 'North Africa gas exploration FID pipeline. WNTBT condition 3 requires at least one N Africa gas project to reach FID by 2026.',
        component_type: 'ecosystem',
        vector: 'ecosystem',
        cross_industry: false,
        source_citation: `${BRIEF} HYP BP-02 (live source: North Africa exploration FID announcements); WNTBT bullet 3`,
        state: 'new',
        trajectory: 'unknown',
        state_reasoning: 'Brief flags exploration but no FID announced as of March 2026 brief. State is "new" — the project pipeline is under construction.',
        trajectory_reasoning: 'Trajectory unknown until WNTBT condition 3 resolves; first FID is the directional indicator.',
      },
      {
        name: 'US_OFFSHORE_LEASING_REGIME',
        description: 'US offshore leasing regime (BOEM 5-year plans, Gulf of Mexico lease sales) — the SIGNALled Policy driver for BP-02.',
        component_type: 'regulation',
        vector: 'regulation',
        cross_industry: true,
        source_citation: `${BRIEF} HYP BP-02 (System Driver: Policy — US offshore leasing regime and N Africa fiscal terms SIGNAL)`,
        state: 'holding',
        trajectory: 'stable',
        state_reasoning: 'Brief does not flag impending change to US offshore leasing under the current administration. Lease sales continuing.',
        trajectory_reasoning: 'No active policy shift in brief.',
      },
      {
        name: 'BP_RENEWABLES_DISPOSAL_TARGET',
        description: 'BP renewables disposal completion. WNTBT condition 1 requires >$7B in renewables disposals by end-2026 — directional indicator that BP is freeing capital for upstream redeployment.',
        component_type: 'market',
        vector: 'market',
        cross_industry: false,
        source_citation: `${BRIEF} HYP BP-02 WNTBT bullet 1; Section 04 "Asset Disposal Programme" (50% progress, $5B 2025 target)`,
        state: 'strengthening',
        trajectory: 'improving',
        state_reasoning: '$5B 2025 target with 50% progress per brief Section 04. Disposal programme is real and in execution.',
        trajectory_reasoning: 'Empire Wind sale to Equinor already realised; non-core upstream + chemicals tranches advancing.',
      },
    ],
    claims: [
      {
        component_name: 'GULF_OF_MEXICO_DEEPWATER_PRODUCTION',
        role: 'principal',
        impact: 'amplifying',
        criticality: 'critical',
        claim_text: 'Mad Dog 2 + Argos (combined 280k bbl/day) sustain commercial production at design throughput through 2028, anchoring the Gulf of Mexico cash flow engine.',
        claim_basis: `Brief Section 04 (90% progress, OPERATIONAL); Section 02 strategy. Source: ${BRIEF}.`,
        criticality_reasoning: 'These two platforms are the principal cash anchor — without them BP cannot generate the FCF that WNTBT condition 2 requires.',
        impact_reasoning: 'Production at design throughput directly amplifies BPX FCF realisation.',
      },
      {
        component_name: 'BPX_UPSTREAM_FREE_CASH_FLOW',
        role: 'enabling',
        impact: 'amplifying',
        criticality: 'critical',
        claim_text: 'BPX Energy posts greater than $4B upstream free cash flow in 2026.',
        claim_basis: `Brief HYP BP-02 WNTBT condition 2. Source: ${BRIEF}.`,
        threshold_op: 'gt',
        threshold_value_numeric: 4,
        threshold_unit: 'USD_billion',
        threshold_direction: 'crossing_validates',
        criticality_reasoning: 'WNTBT condition 2 — without BPX hitting the FCF threshold the hypothesis fails its own definition.',
        impact_reasoning: 'FCF threshold crossing is the operational confirmation of the upstream pivot.',
      },
      {
        component_name: 'NORTH_AFRICA_GAS_EXPLORATION_FID_PIPELINE',
        role: 'enabling',
        impact: 'amplifying',
        criticality: 'high',
        claim_text: 'BP reaches FID on at least one North Africa gas exploration project by end-2026.',
        claim_basis: `Brief HYP BP-02 WNTBT condition 3. Source: ${BRIEF}.`,
        threshold_op: 'gt',
        threshold_value_numeric: 0,
        threshold_unit: 'count',
        threshold_direction: 'crossing_validates',
        criticality_reasoning: 'Required for the "primary strategic asset" framing — without N Africa, the upstream pivot reduces to a US-only thesis.',
        impact_reasoning: 'First N Africa FID is the structural indicator for the geography breadth of the upstream pivot.',
      },
      {
        component_name: 'BP_RENEWABLES_DISPOSAL_TARGET',
        role: 'enabling',
        impact: 'amplifying',
        criticality: 'high',
        claim_text: 'BP completes more than $7B in renewables disposals by end-2026, freeing capital for upstream redeployment.',
        claim_basis: `Brief HYP BP-02 WNTBT condition 1. Source: ${BRIEF}.`,
        threshold_op: 'gt',
        threshold_value_numeric: 7,
        threshold_unit: 'USD_billion',
        threshold_direction: 'crossing_validates',
        criticality_reasoning: 'Disposal completion is the capital-flow precondition; absent it the upstream pivot is a strategy statement without funding.',
        impact_reasoning: 'Each $B of disposal proceeds amplifies upstream redeployment capacity.',
      },
    ],
  },

  // ============================================================================
  // BP-03 — Hydrogen + CCUS rationalisation to 2-3 flagships
  // ============================================================================
  {
    name: 'BP hydrogen and CCUS portfolio rationalisation to 2 to 3 flagship projects by end-2026',
    strategy_context: `BP retreating from green hydrogen ambitions; retaining only blue hydrogen (H2Teesside, UK) and selective CCUS exposure. UK CCUS cluster policy and US IRA hydrogen production credits gate the economics. Brief assesses 84% probability — the highest confidence hypothesis in the BP register.`,
    brief_description: 'Whether BP rationalises its hydrogen + CCUS portfolio to 2-3 flagship projects by end-2026.',
    hypothesis_statement: `BP's hydrogen and CCUS portfolio will be rationalised to 2 to 3 flagship projects by end-2026, with all early-stage assets sold, shelved, or JV'd. Source: ${BRIEF}, HYP BP-03.`,
    why_it_matters: 'The consolidation creates a technology engagement window — projects reaching FID will have well-defined vendor selection timelines. FutureBridge can position for post-rationalisation technology partnership on the surviving projects.',
    horizon: 'H1',
    persona: 'strategy',
    time_horizon_year: 2026,
    time_horizon_source: `${BRIEF} HYP BP-03 (H1 · 1–2yr)`,
    decision_threshold: [
      'Net Zero Teesside fails to reach FID by Q4 2025 or is transferred to a JV structure;',
      'BP publicly revises its clean energy investment target downward for the second consecutive year;',
      'At least one blue hydrogen project is offered to a partner or placed on hold before mid-2026.',
      'All three conditions must hold for the hypothesis to confirm. (WNTBT, brief HYP BP-03.)',
    ].join(' '),
    baseline_confidence: 0.84,
    current_confidence: 0.84,
    state: 'strengthening',
    trajectory: 'deteriorating',
    state_reasoning: 'Hypothesis is gaining structural support: BP green H2 ambitions already shelved, asset disposal programme active, brief Section 02 explicitly names "Hydrogen: retaining blue H2 only".',
    trajectory_reasoning: `Underlying trajectory of BP's low-carbon ambition is deteriorating relative to original plan (Looney 2020). Source: ${BRIEF} Section 02 strategy box right column.`,
    components: [
      {
        name: 'H2TEESSIDE_BLUE_HYDROGEN_FID_TIMELINE',
        description: 'H2Teesside is BP\'s 1GW blue hydrogen project at Teesside industrial cluster. WNTBT condition 1 hinges on whether it reaches FID by Q4 2025 in original-equity form.',
        component_type: 'tech',
        vector: 'tech',
        cross_industry: false,
        source_citation: `${BRIEF} Section 04 Initiatives "H2Teesside — Blue Hydrogen, UK" (40% progress, DEVELOPING); HYP BP-03 (live source: Net Zero Teesside FID timeline updates); WNTBT bullet 1`,
        state: 'ambiguous',
        trajectory: 'volatile',
        state_reasoning: 'Brief shows 40% progress and DEVELOPING badge as of March 2026. FID timeline ambiguous — partner negotiations or JV transfer remain open paths.',
        trajectory_reasoning: 'Brief Section 06 S-03 Signal Strength 7/10 with policy-dependency caveat. Trajectory volatile until UK CCUS cluster policy decision lands.',
      },
      {
        name: 'UK_CCUS_CLUSTER_POLICY_FRAMEWORK',
        description: 'UK CCUS cluster policy framework (HyNet + East Coast Cluster + tax structure). Gates the economics of H2Teesside + Net Zero Teesside via track-1 contract awards. Policy SIGNAL driver for BP-03.',
        component_type: 'regulation',
        vector: 'regulation',
        cross_industry: true,
        source_citation: `${BRIEF} HYP BP-03 (System Driver: Policy — UK CCUS cluster policy SIGNAL)`,
        state: 'holding',
        trajectory: 'stable',
        state_reasoning: 'UK CCUS cluster policy framework is in force as of March 2026; track-1 awards proceeding.',
        trajectory_reasoning: 'No reversal signal in brief; CCSA Delivery Plan Dec 2025 is named as a current source.',
      },
      {
        name: 'US_IRA_HYDROGEN_PRODUCTION_CREDIT',
        description: 'US Inflation Reduction Act 45V hydrogen production tax credit. Gates economics on US blue H2 projects in BP\'s portfolio. Policy SIGNAL driver per brief.',
        component_type: 'regulation',
        vector: 'regulation',
        cross_industry: true,
        source_citation: `${BRIEF} HYP BP-03 (System Driver: Policy — US IRA hydrogen credits SIGNAL)`,
        state: 'ambiguous',
        trajectory: 'volatile',
        state_reasoning: 'IRA 45V framework remains in force but political durability under second Trump administration is contested. Brief flags this as a SIGNAL-driver, indicating instability.',
        trajectory_reasoning: 'Brief refresh source list includes IEA Hydrogen Review 2025 — the political durability question is live but undecided.',
      },
      {
        name: 'BLUE_HYDROGEN_INDUSTRIAL_OFFTAKE_DEMAND',
        description: 'Industrial blue-H2 offtake demand confirmation in NW Europe (refining, chemicals, steel). Brief Section 02 frames this as the demand-side question for surviving BP H2 projects.',
        component_type: 'market',
        vector: 'market',
        cross_industry: true,
        source_citation: `${BRIEF} HYP BP-03 (System Driver: Market — Industrial hydrogen offtake demand confirmation)`,
        state: 'ambiguous',
        trajectory: 'unknown',
        state_reasoning: 'Brief flags offtake demand confirmation as a non-SIGNAL driver — present but not currently moving. Demand is structurally there but contracted offtake is thin.',
        trajectory_reasoning: 'No clear directional indicator in brief.',
      },
    ],
    claims: [
      {
        component_name: 'H2TEESSIDE_BLUE_HYDROGEN_FID_TIMELINE',
        role: 'principal',
        impact: 'amplifying',
        criticality: 'critical',
        claim_text: 'H2Teesside fails to reach FID by Q4 2025 in original 100% BP equity form, OR is transferred to a JV structure with one or more partners.',
        claim_basis: `Brief HYP BP-03 WNTBT bullet 1. Source: ${BRIEF}.`,
        threshold_direction: 'crossing_validates',
        criticality_reasoning: 'H2Teesside FID slip or JV transfer is the principal observable confirmation that BP is rationalising the portfolio.',
        impact_reasoning: 'A JV transfer is structurally equivalent to "sold/shelved/JV\'d" in the hypothesis statement.',
      },
      {
        component_name: 'BLUE_HYDROGEN_INDUSTRIAL_OFFTAKE_DEMAND',
        role: 'enabling',
        impact: 'amplifying',
        criticality: 'high',
        claim_text: 'BP publicly revises its clean energy investment target downward for the second consecutive year through end-2026.',
        claim_basis: `Brief HYP BP-03 WNTBT bullet 2 (mapped to the market component because investment target reduction is a demand-confidence indicator). Source: ${BRIEF}.`,
        criticality_reasoning: 'Public investment-target revision is the boardroom-level confirmation that drove the rationalisation hypothesis.',
        impact_reasoning: 'Two consecutive downward revisions establish a structural pattern, not a one-off adjustment.',
      },
      {
        component_name: 'UK_CCUS_CLUSTER_POLICY_FRAMEWORK',
        role: 'enabling',
        impact: 'amplifying',
        criticality: 'high',
        claim_text: 'UK CCUS cluster policy framework holds through end-2026 such that track-1 cluster award contracts are honoured but no new H2 / CCUS support beyond current scope is announced.',
        claim_basis: `Brief HYP BP-03 (Policy SIGNAL); CCSA Delivery Plan Dec 2025. Source: ${BRIEF}.`,
        criticality_reasoning: 'Policy stability is required for the surviving flagship projects (H2Teesside-as-JV, Net Zero Teesside) to proceed; policy retraction collapses the entire portfolio rather than rationalising it.',
        impact_reasoning: 'Policy holding while no expansion is the precise condition under which rationalisation is the rational corporate response.',
      },
      {
        component_name: 'US_IRA_HYDROGEN_PRODUCTION_CREDIT',
        role: 'external_threat',
        impact: 'dampening',
        criticality: 'medium',
        claim_text: 'US IRA 45V hydrogen production tax credit is materially weakened or repealed before end-2026, removing economic floor on US blue-H2 projects in BP portfolio.',
        claim_basis: `Brief HYP BP-03 (Policy SIGNAL — US IRA hydrogen credits). Source: ${BRIEF}.`,
        criticality_reasoning: 'Significant 45V weakening would force faster + deeper rationalisation than the brief\'s base case (3 flagships → 1-2), changing the engagement window.',
        impact_reasoning: '45V repeal dampens BP commitment to US blue H2 — but accelerates rather than reverses the rationalisation hypothesis.',
      },
    ],
  },
];

await runPopulation({ company, initiatives, dryRun: !COMMIT });
