#!/usr/bin/env node
// 017_bp_blue_h2_ontology.mjs — populates ontology for BP's industrial
// blue hydrogen leadership initiative (H2Teesside + H2H Saltend partnership).
//
// Per /docs/methodology/ontology_population_procedure.md v1.2.
//
// First non-Shell IOC client. Heavy cross-client reuse expected:
// pre_combustion_capture × industrial_point_source_decarbonisation
// AND pre_combustion_capture × hard_to_abate_industrial_h2_demand
// already exist (Shell CCUS + blue H2 runs); BP components link via
// component_pair_links — NO duplicate technology or pair rows.
//
// New technologies: 0 (discipline test — ATR-vs-SMR remains within
// pre_combustion_capture scope per prior decision).
// New applications: 1 (power_sector_h2_co_firing — H2-blending into
// gas turbine power generation; structurally distinct from H2-as-
// industrial-feedstock and from gas-fired-with-CCS).
// New pairs: 2.
//
// Idempotent.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
async function loadEnv(p) {
  if (!existsSync(p)) return;
  const raw = await readFile(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '..', '.env'));
await loadEnv(join(__dirname, '..', '..', 'n8n', '.env'));

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const CONFIRM = args.includes('--confirm-yes');
const WILL_COMMIT = COMMIT && CONFIRM;
if (COMMIT && !CONFIRM) { console.error('--commit requires --confirm-yes'); process.exit(1); }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Population — BP blue H2 ontology ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// BP plc company_id = 70 (existing)

const BP_INITIATIVE = {
  name: 'Industrial blue hydrogen leadership (H2Teesside + East Coast Cluster + Saltend partnership)',
  strategy_context: 'BP positioning as anchor blue-H2 producer in NW Europe — 1.2 GW H2Teesside + Saltend partnership with Equinor + East Coast Cluster CO2 transport-and-storage anchor.',
  brief_description: 'H2Teesside (1.2 GW ATR+CCS by 2027/2028 FID), H2H Saltend partnership with Equinor (0.6 Mtpa CO2 capture from ATR+CCS for industrial H2 supply Humber), East Coast Cluster as CO2 destination. Net Zero Teesside Power (860 MW gas+CCS+H2 co-firing) integrated with H2 supply.',
  hypothesis_statement: 'BP achieves leadership position in NW European blue H2 production through 2030 by anchoring 1.2 GW H2Teesside with East Coast Cluster CO2 infrastructure and integrating H2 supply with Net Zero Teesside Power gas-fired-with-CCS-plus-H2-co-firing capacity.',
  why_it_matters: 'BP\'s principal post-2025 industrial-decarbonisation cluster bet; anchors UK CCUS Track-1 economics; first commercial H2 co-firing in gas turbines at scale.',
  horizon: 'H2',
  persona: 'strategy',
  time_horizon_year: 2030,
  baseline_confidence: 0.50,
};

const BP_COMPONENTS = [
  {
    name: 'BP_BLUE_HYDROGEN_TECH',
    description: 'BP\'s blue H2 production technology platform — H2Teesside ATR+CCS (1.2 GW by 2027/2028); H2H Saltend partnership with Equinor (0.6 Mtpa CO2). ATR variant achieves ~95% capture rate vs SMR ~60%; Air Products + Linde + Equinor as principal ATR-CCS technology partners.',
    component_type: 'tech',
    vector: 'tech',
    cross_industry: true,
    state: 'strengthening',
    trajectory: 'volatile',
    source_citation: 'BP Annual Report 2024; H2Teesside project disclosures 2024',
  },
  {
    name: 'UK_CCUS_TRACK_FRAMEWORK',
    description: 'UK CCUS support framework — Track-1 contracts (East Coast Cluster + HyNet) at FID 2024-2025, Track-2 contracts (Acorn + Viking) consultation 2024-2025. Per-tonne support payments bridging cost vs grey H2; 25-year contract tenor; pass-through arrangements with industrial offtakers.',
    component_type: 'regulation',
    vector: 'regulation',
    cross_industry: false,
    state: 'strengthening',
    trajectory: 'improving',
    source_citation: 'UK DESNZ Cluster Sequencing Track-1 contracts 2024',
  },
  {
    name: 'EAST_COAST_CLUSTER_INFRA',
    description: 'East Coast Cluster CO2 transport + storage infrastructure — Northern Endurance Partnership (NEP, BP+Equinor+TotalEnergies) operating CO2 pipeline + Endurance saline aquifer storage in southern North Sea. ~4 Mtpa Phase 1 capacity Track-1 FID 2024; expandable to 27+ Mtpa over multiple FIDs through 2030.',
    component_type: 'ecosystem',
    vector: 'ecosystem',
    cross_industry: false,
    state: 'strengthening',
    trajectory: 'improving',
    source_citation: 'NEP East Coast Cluster operator disclosures 2024; UK DESNZ Track-1 award 2024',
  },
  {
    name: 'EUROPEAN_INDUSTRIAL_H2_DEMAND',
    description: 'European industrial hydrogen demand surface — refining + ammonia + chemicals + emerging steel-DRI. ~10-12 Mt/yr 2024 split between IOC (BP, Shell, Equinor), industrial gas majors (Linde, Air Liquide, Air Products), and merchant. Demand structurally supported by EU CBAM + Hydrogen Bank + UK CCUS frameworks.',
    component_type: 'market',
    vector: 'market',
    cross_industry: true,
    state: 'holding',
    trajectory: 'improving',
    source_citation: 'IEA Global Hydrogen Review 2024; BNEF Hydrogen Market Outlook 2024',
  },
];

const NEW_TECHNOLOGIES = [];  // Discipline: zero new technologies

const NEW_APPLICATIONS = [
  {
    name: 'power_sector_h2_co_firing',
    label: 'Power-sector H2 co-firing in gas turbines',
    domain: 'power',
    description: 'Hydrogen blending or full firing in industrial gas turbines for grid-connected power generation. NZT Power (BP+Equinor 860 MW gas+CCS with H2 co-firing capability); Long Ridge Energy (Ohio, 30% H2 blend operating); GE Vernova H2-capable turbine platforms; Mitsubishi Power JAC and J-series. Distinct from H2-as-industrial-feedstock and from gas-fired-with-CCS power; this is power generation FROM H2 directly. Sub-mandate exists in some markets (UK MoCST H2-readiness consultation 2024-2025).',
    market_maturity: 'frontier',
    source_citation: 'NZT Power operator disclosures 2024; GE Vernova H2 capability white paper 2024',
  },
];

const NEW_PAIRS = [
  {
    label: 'Pre-combustion capture × power-sector H2 co-firing',
    technology: 'pre_combustion_capture',
    application: 'power_sector_h2_co_firing',
    horizon: 'H3',
    horizon_reasoning: 'Blue H2 supply (SMR+CCS or ATR+CCS) feeding gas turbines for power-sector decarbonisation. NZT Power 860 MW (BP+Equinor) at FID 2024 with H2 co-firing capability and CCS on gas-fired exhaust; Long Ridge (Ohio) 30% H2 blend operating since 2022 at small scale. Costs uncompetitive against renewables-plus-storage at <$150/t carbon prices. H3 markers: technology demonstrated but applications speculative or pre-FID at scale; cost trajectory unfavourable; market demand contingent on conditions not materialised (high carbon price, capacity-market premium for dispatchable low-carbon).',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. NZT Power operator disclosures (operator_disclosure, high — BP+Equinor consortium IS sole authoritative source for project structure); IEA WEO 2024 (industry_body, high); GE Vernova H2 capability white paper (operator_disclosure, medium). hard_evidence_count=1 (NZT Power operator_disclosure under v1.1 carve-out). Held at medium because the application is structurally novel and global commercial deployment is essentially non-existent.',
    trajectory: 'improving',
    trajectory_reasoning: 'NZT Power FID 2024 + UK Track-1 contract structure provide first commercial-scale anchor; turbine-OEM platforms (GE, Mitsubishi) approaching 100% H2 capability; trajectory positive but slow.',
    flag: false,
  },
  {
    label: 'PEM electrolysis × power-sector H2 co-firing',
    technology: 'pem_electrolysis_industrial_scale',
    application: 'power_sector_h2_co_firing',
    horizon: 'H3',
    horizon_reasoning: 'Green H2 (PEM) supplied to gas turbines for power-sector decarbonisation — currently uneconomic in any market because power produced is several multiples more expensive than direct renewable generation. Speculative beyond 2030. H3 markers: technology demonstrated at small scale but applications speculative; cost trajectory unclear at relevant price points; demand contingent on conditions not materialised.',
    confidence: 'low',
    confidence_reasoning: 'Only 2 evidence rows: IEA Global Hydrogen Review 2024 (industry_body, high) and GE Vernova H2 capability disclosures (operator_disclosure, medium). hard_evidence_count=0. No peer_reviewed or government_data. Insufficient evidence diversity.',
    trajectory: 'unknown',
    trajectory_reasoning: 'Pathway recognised in policy literature but commercial trajectory wholly contingent on green H2 cost-down to a level where power-from-green-H2 makes sense, which is far beyond 5-year window.',
    flag: true,
    flag_reason: 'low confidence: no hard evidence for the green-H2-to-power-gen pathway specifically; only industry_body and operator_disclosure on the broader H2-co-firing capability. Trajectory unknown given no commercial-scale examples. Re-run Step 2 if peer-reviewed economic analysis or government white paper publishes.',
  },
];

const NEW_EVIDENCE = [
  // pre_combustion × power_h2_co_firing (3)
  { pair: 'Pre-combustion capture × power-sector H2 co-firing',
    type: 'operator_disclosure', strength: 'high', supports: 'H3',
    text: 'Net Zero Teesside Power (BP+Equinor): 860 MW gas-fired generation with CCS on exhaust, designed for H2 co-firing capability via H2Teesside supply; FID 2024 under UK Track-1 contract. NEP CO2 transport+storage anchor. Consortium is sole authoritative source for plant configuration and H2 co-firing capability levels.',
    citation: 'NZT Power operator disclosures 2024',
    url: 'https://www.netzeroteesside.co.uk/news/',
    publication_date: '2024-09-01' },
  { pair: 'Pre-combustion capture × power-sector H2 co-firing',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IEA World Energy Outlook 2024: H2 co-firing in power generation considered niche pathway through 2030; commercial-scale FIDs essentially limited to NZT Power (UK) and Long Ridge (Ohio at 30% blend); global deployment <0.5 GW operational H2-capable.',
    citation: 'IEA World Energy Outlook 2024',
    url: 'https://www.iea.org/reports/world-energy-outlook-2024',
    publication_date: '2024-10-01' },
  { pair: 'Pre-combustion capture × power-sector H2 co-firing',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'GE Vernova H2 capability white paper: GE 7HA and 9HA gas turbines support up to 100% H2 firing with mods; commercial demonstration pending at scale.',
    citation: 'GE Vernova H2 capability white paper 2024',
    url: 'https://www.gevernova.com/gas-power/future-of-energy/hydrogen-fuel-natural-gas-power-plants',
    publication_date: '2024-06-01' },

  // pem × power_h2_co_firing (2)
  { pair: 'PEM electrolysis × power-sector H2 co-firing',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IEA Global Hydrogen Review 2024: green H2 to power-sector co-firing pathway recognised but commercial economics contingent on green H2 cost <$2/kg AND high carbon pricing; pre-FID at scale globally.',
    citation: 'IEA Global Hydrogen Review 2024',
    url: 'https://www.iea.org/reports/global-hydrogen-review-2024',
    publication_date: '2024-10-01' },
  { pair: 'PEM electrolysis × power-sector H2 co-firing',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'GE Vernova H2 capability commitments include green-H2-source agnostic operation; no commercial-scale green-H2-fed installations.',
    citation: 'GE Vernova H2 capability disclosures 2024',
    url: 'https://www.gevernova.com/gas-power/future-of-energy/hydrogen-fuel-natural-gas-power-plants',
    publication_date: '2024-06-01' },
];

const NEW_ADJACENCIES = [
  // pre_combustion × power_h2_co_firing (3 adj)
  { from: 'Pre-combustion capture × power-sector H2 co-firing',
    to:   'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same blue H2 production tech (SMR+CCS / ATR+CCS); industrial H2-as-product application is the H2 demand anchor, power-sector H2 co-firing is the H3 derivative supplying gas turbines for power generation. Same project (H2Teesside) supplies both applications.' },
  { from: 'Pre-combustion capture × power-sector H2 co-firing',
    to:   'Post-combustion amine capture × power-sector decarbonisation',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Both are power-sector decarbonisation pathways; amine captures flue gas of conventional gas-fired generation, H2 co-firing reduces emissions at fuel rather than at exhaust. NZT Power combines both — gas+CCS on exhaust AND H2 co-firing capability.' },
  { from: 'Pre-combustion capture × power-sector H2 co-firing',
    to:   'PEM electrolysis × power-sector H2 co-firing',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Same power-sector H2 co-firing application; blue H2 (pre-combustion+CCS) vs green H2 (PEM) supply paths.' },

  // pem × power_h2_co_firing (3 adj)
  { from: 'PEM electrolysis × power-sector H2 co-firing',
    to:   'Pre-combustion capture × power-sector H2 co-firing',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Mirror.' },
  { from: 'PEM electrolysis × power-sector H2 co-firing',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same PEM production; different downstream demand application.' },
  { from: 'PEM electrolysis × power-sector H2 co-firing',
    to:   'Post-combustion amine capture × power-sector decarbonisation',
    type: 'same_application_different_technology', strength: 'weak',
    reason: 'Both are power-sector decarbonisation pathways; physical mechanisms entirely different (green H2 fuel substitution vs flue-gas capture).' },
];

// Component links — heavy reuse
const COMPONENT_LINKS = [
  // BP_BLUE_HYDROGEN_TECH (BP's tech anchor)
  { component: 'BP_BLUE_HYDROGEN_TECH',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'primary',
    reason: 'BP H2Teesside 1.2 GW ATR+CCS is BP\'s primary instance of pre-combustion industrial point-source decarbonisation. Cross-client reuse: pair created during Shell CCUS run, now linked from BP without duplication.' },
  { component: 'BP_BLUE_HYDROGEN_TECH',
    pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    role: 'primary',
    reason: 'H2Teesside H2 supply to refining + ammonia + chemicals is primary anchor for hard-to-abate H2 demand application. Cross-client reuse.' },
  { component: 'BP_BLUE_HYDROGEN_TECH',
    pair: 'Pre-combustion capture × power-sector H2 co-firing',
    role: 'primary',
    reason: 'NZT Power (BP+Equinor) anchored on H2Teesside H2 supply for gas-turbine power generation; primary instance of this new pair.' },
  { component: 'BP_BLUE_HYDROGEN_TECH',
    pair: 'Pre-combustion capture × industrial gas processing',
    role: 'secondary',
    reason: 'BP refining operations include grey-H2 supply via SMR (precursor to blue) — base practice this component evolves from.' },

  // UK_CCUS_TRACK_FRAMEWORK (regulation)
  { component: 'UK_CCUS_TRACK_FRAMEWORK',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'UK CCUS Track-1 contracts gate UK blue-H2 industrial-decarbonisation economics; Track-2 expanding to Acorn + Viking.' },
  { component: 'UK_CCUS_TRACK_FRAMEWORK',
    pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    role: 'secondary',
    reason: 'Same Track-1 framework gating supply-side economics for hard-to-abate H2 demand at UK sites.' },
  { component: 'UK_CCUS_TRACK_FRAMEWORK',
    pair: 'Pre-combustion capture × power-sector H2 co-firing',
    role: 'secondary',
    reason: 'NZT Power Track-1 contract gates project economics; UK MoCST H2-readiness regime gates ongoing co-firing requirements.' },
  { component: 'UK_CCUS_TRACK_FRAMEWORK',
    pair: 'Post-combustion amine capture × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'HyNet projects (Hanson cement, Heidelberg Materials etc.) under Track-1 use post-combustion amine capture; framework gates these too.' },

  // EAST_COAST_CLUSTER_INFRA (ecosystem)
  { component: 'EAST_COAST_CLUSTER_INFRA',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'NEP CO2 transport+storage is the principal CO2 destination for H2Teesside and other East Coast Cluster projects; ecosystem enabler.' },
  { component: 'EAST_COAST_CLUSTER_INFRA',
    pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    role: 'secondary',
    reason: 'Same NEP CO2 infrastructure underpins H2Teesside H2 supply.' },
  { component: 'EAST_COAST_CLUSTER_INFRA',
    pair: 'Pre-combustion capture × power-sector H2 co-firing',
    role: 'secondary',
    reason: 'NEP infrastructure supports NZT Power CO2 disposal alongside H2 supply.' },
  { component: 'EAST_COAST_CLUSTER_INFRA',
    pair: 'Post-combustion amine capture × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'NEP storage takes CO2 from cement, refining and other amine-capture sources in East Coast Cluster.' },

  // EUROPEAN_INDUSTRIAL_H2_DEMAND (market)
  { component: 'EUROPEAN_INDUSTRIAL_H2_DEMAND',
    pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    role: 'primary',
    reason: 'European industrial H2 demand IS the demand application for blue H2 supply; primary anchor.' },
  { component: 'EUROPEAN_INDUSTRIAL_H2_DEMAND',
    pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    role: 'exposure_only',
    reason: 'Demand surface exposed to green-H2 substitution from PEM; cross-client/cross-pair exposure mirrors Shell+Vattenfall posture on this pair.' },
  { component: 'EUROPEAN_INDUSTRIAL_H2_DEMAND',
    pair: 'Pre-combustion capture × industrial gas processing',
    role: 'exposure_only',
    reason: 'Mature gas-processing application is the H1 base for H2 supply; demand-component exposed to displacement of grey-H2 by blue/green.' },
];

// ============================================================================
// Execution
// ============================================================================
try {
  await client.query('BEGIN');

  // Discipline check
  console.log('\n=== Discipline check: duplicate-technology guard ===');
  const FORBIDDEN = ['atr_ccs_blue_hydrogen','smr_ccs_blue_hydrogen','smr_with_ccs','blue_h2_smr_ccs','blue_h2_atr_ccs'];
  const dup = await client.query(`SELECT technology_name FROM technologies WHERE technology_name = ANY($1::text[])`, [FORBIDDEN]);
  if (dup.rows.length > 0) {
    throw new Error(`Discipline failure: duplicate-of-pre_combustion technologies present: ${dup.rows.map(r=>r.technology_name).join(', ')}`);
  }
  for (const t of NEW_TECHNOLOGIES) {
    if (FORBIDDEN.includes(t.name)) throw new Error(`Discipline failure: NEW_TECHNOLOGIES tries to add forbidden duplicate: ${t.name}`);
  }
  console.log(`  no duplicate technology rows present or proposed (${NEW_TECHNOLOGIES.length} new techs proposed) ✓`);

  // Part A: BP initiative + components
  console.log('\n=== Part A: BP initiative + components ===');
  const ir = await client.query(`
    INSERT INTO initiatives_v2 (company_id, name, strategy_context, brief_description,
      hypothesis_statement, why_it_matters, horizon, persona, time_horizon_year,
      baseline_confidence, current_confidence, draft_status, state, trajectory)
    VALUES (70,$1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'draft_unreviewed','holding','volatile')
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [BP_INITIATIVE.name, BP_INITIATIVE.strategy_context, BP_INITIATIVE.brief_description,
      BP_INITIATIVE.hypothesis_statement, BP_INITIATIVE.why_it_matters, BP_INITIATIVE.horizon,
      BP_INITIATIVE.persona, BP_INITIATIVE.time_horizon_year, BP_INITIATIVE.baseline_confidence]);
  let initId;
  if (ir.rows[0]) initId = ir.rows[0].id;
  else {
    const r = await client.query(`SELECT id FROM initiatives_v2 WHERE company_id=70 AND name=$1`, [BP_INITIATIVE.name]);
    initId = r.rows[0].id;
  }
  console.log(`  BP blue H2 initiative id=${initId}`);

  const compIds = {};
  for (const cdef of BP_COMPONENTS) {
    const r = await client.query(`
      INSERT INTO components (initiative_id, name, description, component_type, vector,
        cross_industry, source_citation, draft_status, state, trajectory)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'draft_unreviewed',$8,$9)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [initId, cdef.name, cdef.description, cdef.component_type, cdef.vector,
        cdef.cross_industry, cdef.source_citation, cdef.state, cdef.trajectory]);
    if (r.rows[0]) compIds[cdef.name] = r.rows[0].id;
    else {
      const r2 = await client.query(`SELECT id FROM components WHERE initiative_id=$1 AND name=$2`, [initId, cdef.name]);
      compIds[cdef.name] = r2.rows[0].id;
    }
  }
  console.log(`  4 BP components: ${Object.entries(compIds).map(([k,v])=>`${k}=${v}`).join(', ')}`);

  // Part B: ontology
  console.log('\n=== Part B: ontology ===');

  // No new technologies — load existing for reference
  const techIds = {};
  for (const name of ['pre_combustion_capture','post_combustion_amine_capture','pem_electrolysis_industrial_scale']) {
    const r = await client.query(`SELECT id FROM technologies WHERE technology_name = $1`, [name]);
    techIds[name] = r.rows[0]?.id;
  }

  const appIds = {};
  for (const name of ['industrial_point_source_decarbonisation','industrial_gas_processing','hard_to_abate_industrial_h2_demand','power_sector_decarbonisation']) {
    const r = await client.query(`SELECT id FROM applications WHERE application_name = $1`, [name]);
    appIds[name] = r.rows[0]?.id;
  }
  for (const a of NEW_APPLICATIONS) {
    const r = await client.query(`
      INSERT INTO applications (application_name, application_label, application_domain,
        description, market_maturity, source_citation)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (application_name) DO UPDATE SET
        application_label = EXCLUDED.application_label,
        description = EXCLUDED.description,
        last_updated_at = NOW()
      RETURNING id
    `, [a.name, a.label, a.domain, a.description, a.market_maturity, a.source_citation]);
    appIds[a.name] = r.rows[0].id;
  }
  console.log(`  applications (new): ${NEW_APPLICATIONS.length}`);

  const pairIds = {};
  for (const p of NEW_PAIRS) {
    const r = await client.query(`
      INSERT INTO technology_application_pairs
        (technology_id, application_id, pair_label, horizon, horizon_reasoning,
         confidence_band, confidence_reasoning, trajectory, trajectory_reasoning,
         is_flagged_for_review, flag_reason, last_reclassified_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
      ON CONFLICT (technology_id, application_id) DO UPDATE SET
        pair_label = EXCLUDED.pair_label,
        horizon = EXCLUDED.horizon, horizon_reasoning = EXCLUDED.horizon_reasoning,
        confidence_band = EXCLUDED.confidence_band, confidence_reasoning = EXCLUDED.confidence_reasoning,
        trajectory = EXCLUDED.trajectory, trajectory_reasoning = EXCLUDED.trajectory_reasoning,
        is_flagged_for_review = EXCLUDED.is_flagged_for_review, flag_reason = EXCLUDED.flag_reason,
        last_reclassified_at = NOW(), last_updated_at = NOW()
      RETURNING id
    `, [techIds[p.technology], appIds[p.application], p.label, p.horizon, p.horizon_reasoning,
        p.confidence, p.confidence_reasoning, p.trajectory, p.trajectory_reasoning,
        p.flag, p.flag_reason ?? null]);
    pairIds[p.label] = r.rows[0].id;
  }
  console.log(`  pairs (new): ${NEW_PAIRS.length}`);

  // Existing pair labels for adjacencies + links
  const EXISTING_PAIRS = [
    'Pre-combustion capture × industrial point-source decarbonisation',
    'Pre-combustion capture × hard-to-abate industrial H2 demand',
    'Pre-combustion capture × industrial gas processing',
    'Post-combustion amine capture × industrial point-source decarbonisation',
    'Post-combustion amine capture × power-sector decarbonisation',
    'PEM electrolysis × hard-to-abate industrial H2 demand',
  ];
  for (const label of EXISTING_PAIRS) {
    if (pairIds[label]) continue;
    const r = await client.query(`SELECT id FROM technology_application_pairs WHERE pair_label = $1`, [label]);
    if (!r.rows[0]) throw new Error(`Existing pair not found: ${label}`);
    pairIds[label] = r.rows[0].id;
  }

  const newPairIds = NEW_PAIRS.map(p => pairIds[p.label]);
  await client.query(`DELETE FROM pair_evidence WHERE pair_id = ANY($1::int[])`, [newPairIds]);
  for (const e of NEW_EVIDENCE) {
    await client.query(`
      INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text,
        source_citation, source_url, publication_date, supports_horizon, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [pairIds[e.pair], e.type, e.strength, e.text, e.citation, e.url ?? null,
        e.publication_date ?? null, e.supports ?? null, '017_bp_blue_h2_ontology']);
  }
  console.log(`  evidence rows (new): ${NEW_EVIDENCE.length}`);

  await client.query(`DELETE FROM pair_adjacencies WHERE source_pair_id = ANY($1::int[])`, [newPairIds]);
  for (const a of NEW_ADJACENCIES) {
    await client.query(`
      INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type,
        adjacency_strength, reasoning_text)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (source_pair_id, target_pair_id, adjacency_type) DO NOTHING
    `, [pairIds[a.from], pairIds[a.to], a.type, a.strength, a.reason]);
  }
  console.log(`  adjacencies (new): ${NEW_ADJACENCIES.length}`);

  const compIdList = Object.values(compIds);
  await client.query(`DELETE FROM component_pair_links WHERE component_id = ANY($1::int[])`, [compIdList]);
  for (const l of COMPONENT_LINKS) {
    await client.query(`
      INSERT INTO component_pair_links (component_id, pair_id, link_role, reasoning_text, source_citation)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (component_id, pair_id) DO UPDATE SET
        link_role = EXCLUDED.link_role,
        reasoning_text = EXCLUDED.reasoning_text,
        source_citation = EXCLUDED.source_citation
    `, [compIds[l.component], pairIds[l.pair], l.role, l.reason, '017_bp_blue_h2_ontology']);
  }
  console.log(`  component_pair_links: ${COMPONENT_LINKS.length} (across ${compIdList.length} components)`);

  // Self-marking
  console.log('\n=== Self-marking output (BP) ===');
  const r2 = await client.query(`
    SELECT confidence_band, hard_evidence_count, COUNT(*) AS n
    FROM technology_application_pairs WHERE id = ANY($1::int[])
    GROUP BY confidence_band, hard_evidence_count ORDER BY confidence_band, hard_evidence_count
  `, [newPairIds]);
  console.log(`  confidence × hard_evidence_count distribution (new pairs):`);
  for (const row of r2.rows) console.log(`    ${row.confidence_band} / hard=${row.hard_evidence_count}: ${row.n}`);
  const r3 = await client.query(`
    SELECT pair_label, flag_reason FROM technology_application_pairs WHERE id = ANY($1::int[]) AND is_flagged_for_review = TRUE
  `, [newPairIds]);
  console.log(`  flagged for review: ${r3.rows.length}`);
  for (const row of r3.rows) console.log(`    - ${row.pair_label}`);

  // Cross-client overlap on pairs touched by this run (looking at all clients touching them)
  const allTouchedPairs = await client.query(`
    SELECT DISTINCT pair_id FROM component_pair_links WHERE component_id = ANY($1::int[])
    UNION SELECT id FROM technology_application_pairs WHERE id = ANY($2::int[])
  `, [compIdList, newPairIds]);
  const touchedPairIds = allTouchedPairs.rows.map(r => r.pair_id);
  const r5 = await client.query(`
    SELECT tap.pair_label, tap.horizon, tap.confidence_band,
           COUNT(DISTINCT co.id) AS clients_touching,
           array_agg(DISTINCT co.name ORDER BY co.name) AS companies
    FROM technology_application_pairs tap
    JOIN component_pair_links cpl ON cpl.pair_id = tap.id
    JOIN components c ON c.id = cpl.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN companies co ON co.id = i.company_id
    WHERE tap.id = ANY($1::int[])
    GROUP BY tap.id, tap.pair_label, tap.horizon, tap.confidence_band
    HAVING COUNT(DISTINCT co.id) >= 2
    ORDER BY clients_touching DESC, tap.pair_label
  `, [touchedPairIds]);
  console.log(`\n  cross-client overlap touched by this run (>=2 companies): ${r5.rows.length}`);
  for (const row of r5.rows) console.log(`    ${row.clients_touching} (${row.companies.join(' + ')}) | [${row.confidence_band}/${row.horizon}] ${row.pair_label}`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — BP blue H2 ontology persisted');
  } else {
    await client.query('ROLLBACK');
    console.log('\n[pg] ROLLBACK (dry-run; pass --commit --confirm-yes to persist)');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\n[pg] ROLLBACK due to error: ${err.message}`);
  console.error(err.stack);
  await client.end();
  process.exit(1);
}
await client.end();
