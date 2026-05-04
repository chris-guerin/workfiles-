#!/usr/bin/env node
// 013_blue_h2_ontology.mjs — populates ontology for Shell's Industrial
// blue hydrogen retention initiative (initiative_id=10).
//
// Per /docs/methodology/ontology_population_procedure.md v1.1.
//
// Cross-client reuse expected: SMR+CCS for industrial decarbonisation
// IS the existing pre_combustion_capture × industrial_point_source_decarbonisation
// pair. Blue H2 initiative primarily LINKS to existing pairs and adds the
// hard-to-abate-H2 demand surface plus the green-H2 substitute axis.
//
// New technologies: 1 (pem_electrolysis_industrial_scale; genuinely
// distinct physical principle from existing pre_combustion_capture).
// Discipline: NO duplicate of pre_combustion_capture for SMR+CCS or
// ATR+CCS — both are within pre_combustion scope per the ontology's
// physical-principle layer. ATR-vs-SMR variant differences are captured
// in pair-level reasoning, not technology rows.
//
// New applications: 1 (hard_to_abate_industrial_h2_demand).
// New pairs: 3.
// Reused pairs: 2 (component_pair_links to existing CCUS rows).
//
// Idempotent. --commit --confirm-yes to persist.

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
console.log(`=== Population — Shell blue H2 ontology ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// ============================================================================
// New technologies — 1
// ============================================================================
const NEW_TECHNOLOGIES = [
  {
    name: 'pem_electrolysis_industrial_scale',
    label: 'PEM electrolysis (industrial scale)',
    tech_function: 'pem_electrolysis_industrial_scale',
    description: 'Water electrolysis via proton exchange membrane at MW-to-100MW industrial scale. Produces high-purity H2 from electricity + water; PGM-catalyst-dependent (Pt, Ir). Cost-down driven by stack manufacturing scale and PGM intensity reduction. Holland Hydrogen 1 (Shell, 200 MW commissioning), REFHYNE (Shell + ITM, 10 MW operating), Air Liquide Bécancour 20 MW.',
    current_trl: 8,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -10,
    cost_trajectory_unit: 'pct_per_year_capex',
    substitution_risk: 'none',
    source_citation: 'IRENA Hydrogen Cost Report 2024; Hydrogen Council Compass 2024',
  },
];

// ============================================================================
// Discipline check at runtime: scan existing technologies for any potential
// duplicate of what we're about to add. Fail loud if a duplicate exists.
// ============================================================================

// ============================================================================
// New applications — 1
// ============================================================================
const NEW_APPLICATIONS = [
  {
    name: 'hard_to_abate_industrial_h2_demand',
    label: 'Hard-to-abate industrial H2 demand (steel DRI, refining, ammonia decarbonisation)',
    domain: 'industrial',
    description: 'Demand for low-carbon hydrogen as a product input for hard-to-abate industrial processes: steel direct-reduced-iron, refining decarbonisation, ammonia decarbonisation, methanol. Distinct from industrial_point_source_decarbonisation (flue-gas capture) and from industrial_gas_processing (CO2 separation as base practice in mature processes). Demand structurally contingent on regulation (EU CBAM, IRA 45V) and industrial customers electing decarbonisation pathways.',
    market_maturity: 'emerging',
    source_citation: 'IEA Global Hydrogen Review 2024; IRENA Hydrogen Cost Report 2024',
  },
];

// ============================================================================
// New pairs — 3
// ============================================================================
const NEW_PAIRS = [
  {
    label: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    technology: 'pre_combustion_capture',
    application: 'hard_to_abate_industrial_h2_demand',
    horizon: 'H2',
    horizon_reasoning: 'Blue H2 supply pathway to hard-to-abate demand: SMR+CCS or ATR+CCS feeding refining decarbonisation, ammonia decarbonisation, steel DRI. Air Products Port Arthur ~1 Mtpa blue H2 operating; H2H Saltend (Equinor with Shell, ATR variant) at near-FID 2024-2026; HyNet H2 supply for refining at FID. ATR-vs-SMR variant differences (capture rate ~95% vs ~60%) recorded in evidence reasoning rather than as separate technology rows. H2 markers met: FOAK at FID stage; regulatory frameworks (45V, UK CCUS support, EU Hydrogen Bank) in force; subsidy material and expected to remain through commercial transition.',
    confidence: 'high',
    confidence_reasoning: '4 evidence rows including 1 government_data (UK DESNZ HyNet), 1 industry_body (IEA Global Hydrogen Review), and 2 high-strength operator_disclosure (Air Products Port Arthur; Equinor H2H Saltend). Per v1.1 hard-evidence rule, both operator_disclosure rows count as hard evidence (operators are sole authoritative source for project operating data). Total: 3 hard-evidence rows → high confidence valid.',
    trajectory: 'volatile',
    trajectory_reasoning: 'IRA 45V final guidance March 2024 narrowed eligibility, partial reversal. EU Hydrogen Bank pricing variable across rounds. UK CCUS Track-2 contracts pending. Trajectory volatile until regulatory accounting stabilises across major jurisdictions.',
    flag: false,
  },
  {
    label: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    technology: 'pem_electrolysis_industrial_scale',
    application: 'hard_to_abate_industrial_h2_demand',
    horizon: 'H3',
    horizon_reasoning: 'Green H2 supply to hard-to-abate industrial demand: PEM electrolyser at 100-MW class supplying refining, ammonia, steel-DRI decarbonisation. Holland Hydrogen 1 (200 MW, commissioning Q4 2025); H2 Green Steel (Stegra) 800 MW PEM+alkaline FID. Cost gap vs blue/grey H2 material at current renewable electricity prices; substitution toward blue is structural for at least the next 5 years. H3 markers: technology demonstrated but not at commercial scale; cost trajectory unclear and materially behind subsidy-bridged blue; demand contingent on conditions not materialised (cheap renewable electricity at scale, 45V eligibility).',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows (IEA Global Hydrogen Review industry_body high; IRENA Hydrogen Cost Report industry_body high; Hydrogen Council Compass industry_body medium). No company_filing or government_data row. Per v1.1, IEA and IRENA are industry_body, not hard. Confidence sits at medium pending hard evidence.',
    trajectory: 'improving',
    trajectory_reasoning: 'Capex declining ~10% YoY per IRENA; FIDs accelerating in EU under Hydrogen Bank; cost-down momentum genuine but not fast enough to close 5-year window vs blue H2.',
    flag: false,
  },
  {
    label: 'PEM electrolysis × industrial point-source decarbonisation',
    technology: 'pem_electrolysis_industrial_scale',
    application: 'industrial_point_source_decarbonisation',
    horizon: 'H3',
    horizon_reasoning: 'Green H2 substitution into industrial flue-gas decarbonisation context — replacing fossil-derived H2 inputs at refineries to lower scope-1 emissions, often paired with on-site CCS retrofit. Currently pilot to FOAK (REFHYNE 10 MW Shell Rheinland; HyShelf demonstrators). H3 markers: technology demonstrated but not at commercial scale at industrial point-source; cost trajectory uncompetitive against subsidy-bridged blue.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows (IRENA Hydrogen Cost Report industry_body high; Shell REFHYNE operator_disclosure high; Hydrogen Council Compass industry_body medium). Per v1.1, REFHYNE operator_disclosure counts as hard (Shell is the operator and sole authoritative source for REFHYNE operating data). 1 hard-evidence row → medium confidence.',
    trajectory: 'holding',
    trajectory_reasoning: 'Demonstrator-scale; large-scale industrial-point-source green H2 retrofit pre-FID across the major IOCs.',
    flag: false,
  },
];

// ============================================================================
// Evidence per new pair
// ============================================================================
const NEW_EVIDENCE = [
  // pre_combustion × hard_to_abate_h2 (4 rows)
  { pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'industry_body', strength: 'high', supports: 'H2',
    text: 'IEA: industrial H2 demand ~95 Mtpa global 2024 (refining + ammonia + methanol + early steel pilots); blue H2 production at ~1 Mtpa scale operating (Air Products Port Arthur), 5+ Mtpa pipeline; growth 4-7% CAGR through 2030.',
    citation: 'IEA Global Hydrogen Review 2024',
    url: 'https://www.iea.org/reports/global-hydrogen-review-2024',
    publication_date: '2024-10-01' },
  { pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'government_data', strength: 'high', supports: 'H2',
    text: 'UK DESNZ HyNet North West cluster: 4.5 Mtpa CO2 capture from blue H2 production for refining, chemicals, glass; FID 2024-2025, operations 2027-2028; UK CCUS support frameworks bridging cost vs grey.',
    citation: 'UK DESNZ Cluster Sequencing Update 2024',
    url: 'https://www.gov.uk/government/publications/cluster-sequencing-for-carbon-capture-usage-and-storage',
    publication_date: '2024-08-01' },
  { pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'Air Products Port Arthur: ~1 Mtpa blue H2 supply via SMR+CCS for refining and chemicals (operating since 2013, expanded 2018); CO2 sold to Permian for EOR. Operator is sole authoritative source for project operating data and supply contract structure.',
    citation: 'Air Products Port Arthur facility disclosures 2024',
    url: 'https://www.airproducts.com/company/sustainability',
    publication_date: '2024-08-01' },
  { pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'Equinor H2H Saltend (Humber UK): 0.6 Mtpa CO2 capture from autothermal reforming + CCS for industrial H2 supply to BP refining and chemicals; pre-FID 2024 awaiting UK CCUS Track-2 contracts. ATR variant achieves ~95% capture rate vs SMR ~60%.',
    citation: 'Equinor H2H Saltend project page 2024',
    url: 'https://www.equinor.com/energy/h2h-saltend',
    publication_date: '2024-10-01' },

  // pem_electrolysis × hard_to_abate_h2 (3 rows)
  { pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IEA Global Hydrogen Review: green H2 production 1 Mt/yr operating 2024; 38 Mt/yr announced 2030 capacity but only ~7 Mt/yr at FID; cost gap to blue ~$2-4/kg with 45V/Hydrogen Bank reducing but not closing.',
    citation: 'IEA Global Hydrogen Review 2024',
    url: 'https://www.iea.org/reports/global-hydrogen-review-2024',
    publication_date: '2024-10-01' },
  { pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IRENA: PEM electrolyser capex ~$1,800/kW 2024 declining ~10% YoY; commercial parity vs blue H2 dependent on $20-30/MWh renewable electricity at scale, achievable in best regions but not widely.',
    citation: 'IRENA Hydrogen Cost Report 2024',
    url: 'https://www.irena.org/publications',
    publication_date: '2024-09-01' },
  { pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'industry_body', strength: 'medium', supports: 'H3',
    text: 'Hydrogen Council Compass: 230+ projects announced globally 2024 for low-carbon H2; <30% at FID; commercial scale-up deferring beyond 2028 in most cases.',
    citation: 'Hydrogen Council Hydrogen Insights 2024 (Compass)',
    url: 'https://hydrogencouncil.com/en/hydrogen-insights-2024/',
    publication_date: '2024-05-01' },

  // pem_electrolysis × industrial_point_source (3 rows)
  { pair: 'PEM electrolysis × industrial point-source decarbonisation',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IRENA: green H2 retrofit at refining and chemical sites contemplated but pre-FID at scale; integration with point-source CCS retrofit improves emissions case but adds capex.',
    citation: 'IRENA Hydrogen Cost Report 2024',
    url: 'https://www.irena.org/publications',
    publication_date: '2024-09-01' },
  { pair: 'PEM electrolysis × industrial point-source decarbonisation',
    type: 'operator_disclosure', strength: 'high', supports: 'H3',
    text: 'Shell REFHYNE: 10 MW PEM electrolyser at Rheinland refinery (operating since 2021); first MW-class commercial PEM in EU refining; planned scale-up REFHYNE II 100 MW pre-FID. Shell is sole authoritative source for REFHYNE operating data and integration design.',
    citation: 'Shell REFHYNE project disclosures 2024',
    url: 'https://www.shell.com/business-customers/chemicals/factsheets-speeches-and-articles/articles/refhyne-clean-refinery-hydrogen-for-europe.html',
    publication_date: '2024-06-01' },
  { pair: 'PEM electrolysis × industrial point-source decarbonisation',
    type: 'industry_body', strength: 'medium', supports: 'H3',
    text: 'Hydrogen Council: green H2 retrofit at industrial point sources discussed at policy level but commercial-scale FIDs absent; trajectory contingent on combined 45V + CCS-CfD-style regulatory support.',
    citation: 'Hydrogen Council Hydrogen Insights 2024 (Compass)',
    url: 'https://hydrogencouncil.com/en/hydrogen-insights-2024/',
    publication_date: '2024-05-01' },
];

// ============================================================================
// Adjacencies for new pairs (>=2 each)
// ============================================================================
const NEW_ADJACENCIES = [
  // pre_combustion × hard_to_abate_h2 (4 adj)
  { from: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    to:   'Pre-combustion capture × industrial point-source decarbonisation',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same SMR+CCS / ATR+CCS process; H2-as-product application (hard-to-abate H2 demand) vs flue-gas capture application (industrial point-source decarbonisation). Operationally overlapping at same project sites (HyNet, H2H Saltend) but the demand-side mechanic differs — H2 is sold to customers vs CO2 is captured-and-stored.' },
  { from: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    to:   'Pre-combustion capture × industrial gas processing',
    type: 'same_technology_different_application', strength: 'moderate',
    reason: 'Same physical process; mature gas-sweetening/ammonia application is the H1 base, hard-to-abate-H2 application is the H2 derivative driven by industrial decarbonisation policy.' },
  { from: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Both serve hard-to-abate industrial H2 demand; blue H2 (pre-combustion+CCS) is the H2-incumbent, green H2 (PEM electrolysis) is the H3-substitute. Substitution dynamic intensifies after 2028 if green-H2 cost-down sustains.' },
  { from: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    to:   'Post-combustion amine capture × industrial point-source decarbonisation',
    type: 'complement', strength: 'moderate',
    reason: 'Blue H2 supply to refining decarbonisation often paired with on-site flue-gas capture as part of integrated industrial-decarbonisation cluster (HyNet, East Coast Cluster). Complementary pairs in cluster designs.' },

  // pem_electrolysis × hard_to_abate_h2 (3 adj)
  { from: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    to:   'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Mirror of above — green vs blue substitution surface in hard-to-abate H2 demand.' },
  { from: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    to:   'PEM electrolysis × industrial point-source decarbonisation',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same PEM electrolysis tech, different demand application (H2-as-product vs H2-as-flue-gas-decarbonisation-input).' },
  { from: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    to:   'Pre-combustion capture × industrial gas processing',
    type: 'substitute', strength: 'moderate',
    reason: 'Green H2 displaces grey/blue H2 in mature industrial-gas-processing applications (refining, ammonia) over 5-10 year horizon; substitution dynamic structurally important for IOC capital allocation.' },

  // pem_electrolysis × industrial_point_source (3 adj)
  { from: 'PEM electrolysis × industrial point-source decarbonisation',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Mirror of above.' },
  { from: 'PEM electrolysis × industrial point-source decarbonisation',
    to:   'Post-combustion amine capture × industrial point-source decarbonisation',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Both serve industrial point-source decarbonisation; PEM reduces emissions via H2 substitution into process inputs while amine captures flue gas. Two distinct decarbonisation pathways for the same end goal.' },
  { from: 'PEM electrolysis × industrial point-source decarbonisation',
    to:   'Direct air capture × CDR voluntary market',
    type: 'substitute', strength: 'weak',
    reason: 'Both decarbonisation pathways drawing on the same voluntary-corporate-net-zero / mandate budget; substitute on the demand-side capital allocation though physical pathways differ entirely.' },
];

// ============================================================================
// Component links (Shell blue H2 components -> existing + new pairs)
// ============================================================================
const COMPONENT_LINKS = [
  // BLUE_HYDROGEN_SMR_CCS_TECH (component_id=21)
  { component: 'BLUE_HYDROGEN_SMR_CCS_TECH',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'primary',
    reason: 'BLUE_HYDROGEN_SMR_CCS_TECH is Shell\'s technology anchor for blue H2 production; the SMR+CCS pathway IS pre-combustion industrial-point-source decarbonisation in the ontology. Cross-client reuse: this pair was created during CCUS population (ontology run 1) and is now linked from Shell\'s blue H2 initiative without duplication.' },
  { component: 'BLUE_HYDROGEN_SMR_CCS_TECH',
    pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    role: 'primary',
    reason: 'Component carries Shell\'s blue H2 supply intent for refining decarbonisation, ammonia decarbonisation, and steel DRI — the hard-to-abate H2 demand application. ATR variant (H2H Saltend with Equinor) is within this pair scope per discipline note (no separate ATR technology row).' },
  { component: 'BLUE_HYDROGEN_SMR_CCS_TECH',
    pair: 'Pre-combustion capture × industrial gas processing',
    role: 'secondary',
    reason: 'Shell refineries currently consume grey H2 (SMR without CCS) for hydrocracking; the blue H2 transition path layers CCS onto existing SMR capacity, putting the technology component on the existing H1 industrial-gas-processing pair as a secondary link (the technology is anchored in the H2 industrial-decarbonisation pair).' },

  // INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND (component_id=22)
  { component: 'INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND',
    pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    role: 'primary',
    reason: 'This market component IS the demand application for blue H2 supply; primary anchor.' },
  { component: 'INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND',
    pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    role: 'exposure_only',
    reason: 'Market component carries exposure to green-H2 substitution; PEM electrolysis × same demand application is the substitute pair surface.' },
  { component: 'INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'exposure_only',
    reason: 'Hard-to-abate H2 demand exposure to industrial decarbonisation services market; demand depends on whether industrial decarbonisation continues commercial conversion at integrated cluster scale.' },
  { component: 'INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND',
    pair: 'PEM electrolysis × industrial point-source decarbonisation',
    role: 'exposure_only',
    reason: 'Green H2 used directly as an industrial-decarbonisation input is an alternate pathway; market component exposed to whether this pair scales (would absorb demand that otherwise routes through blue H2 supply).' },
];

// ============================================================================
// Execution
// ============================================================================
try {
  await client.query('BEGIN');

  // Discipline check: scan for potential duplicate technology rows
  // (e.g. someone trying to create 'smr_ccs_blue_hydrogen' as a technology)
  console.log('\n=== Discipline check: duplicate-technology guard ===');
  const FORBIDDEN = ['smr_ccs_blue_hydrogen','atr_ccs_blue_hydrogen','smr_with_ccs','blue_h2_smr_ccs'];
  const dup = await client.query(`SELECT technology_name FROM technologies WHERE technology_name = ANY($1::text[])`, [FORBIDDEN]);
  if (dup.rows.length > 0) {
    throw new Error(`Discipline failure: duplicate-of-pre_combustion technologies present: ${dup.rows.map(r=>r.technology_name).join(', ')}`);
  }
  // Also check that nothing in NEW_TECHNOLOGIES is a duplicate of pre_combustion_capture
  for (const t of NEW_TECHNOLOGIES) {
    if (FORBIDDEN.includes(t.name)) {
      throw new Error(`Discipline failure: NEW_TECHNOLOGIES tries to add forbidden duplicate: ${t.name}`);
    }
  }
  console.log(`  no duplicate technology rows present or proposed ✓`);

  // 1. Insert new technologies
  const techIds = {};
  // First load existing techs we need to reference
  for (const name of ['post_combustion_amine_capture','pre_combustion_capture','direct_air_capture']) {
    const r = await client.query(`SELECT id FROM technologies WHERE technology_name = $1`, [name]);
    techIds[name] = r.rows[0]?.id;
  }
  for (const t of NEW_TECHNOLOGIES) {
    let funcId = null;
    if (t.tech_function) {
      const r = await client.query(`SELECT id FROM tech_functions WHERE function_name = $1`, [t.tech_function]);
      funcId = r.rows[0]?.id ?? null;
    }
    const r = await client.query(`
      INSERT INTO technologies (technology_name, technology_label, tech_function_id, description,
        current_trl, trl_as_of_date, cost_trajectory_pct_yoy, cost_trajectory_unit, substitution_risk, source_citation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (technology_name) DO UPDATE SET
        technology_label = EXCLUDED.technology_label,
        tech_function_id = EXCLUDED.tech_function_id,
        description = EXCLUDED.description,
        current_trl = EXCLUDED.current_trl,
        trl_as_of_date = EXCLUDED.trl_as_of_date,
        cost_trajectory_pct_yoy = EXCLUDED.cost_trajectory_pct_yoy,
        cost_trajectory_unit = EXCLUDED.cost_trajectory_unit,
        substitution_risk = EXCLUDED.substitution_risk,
        source_citation = EXCLUDED.source_citation,
        last_updated_at = NOW()
      RETURNING id
    `, [t.name, t.label, funcId, t.description, t.current_trl, t.trl_as_of_date, t.cost_trajectory_pct_yoy,
        t.cost_trajectory_unit, t.substitution_risk, t.source_citation]);
    techIds[t.name] = r.rows[0].id;
  }
  console.log(`  technologies (new): ${NEW_TECHNOLOGIES.length}`);

  // 2. Insert new applications
  const appIds = {};
  for (const name of ['industrial_point_source_decarbonisation','industrial_gas_processing','cdr_voluntary_market']) {
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
        application_domain = EXCLUDED.application_domain,
        description = EXCLUDED.description,
        market_maturity = EXCLUDED.market_maturity,
        source_citation = EXCLUDED.source_citation,
        last_updated_at = NOW()
      RETURNING id
    `, [a.name, a.label, a.domain, a.description, a.market_maturity, a.source_citation]);
    appIds[a.name] = r.rows[0].id;
  }
  console.log(`  applications (new): ${NEW_APPLICATIONS.length}`);

  // 3. Insert new pairs
  const pairIds = {};
  for (const p of NEW_PAIRS) {
    const tid = techIds[p.technology];
    const aid = appIds[p.application];
    if (!tid || !aid) throw new Error(`Missing FK for pair ${p.label}: tech=${p.technology}, app=${p.application}`);
    const r = await client.query(`
      INSERT INTO technology_application_pairs
        (technology_id, application_id, pair_label, horizon, horizon_reasoning,
         confidence_band, confidence_reasoning, trajectory, trajectory_reasoning,
         is_flagged_for_review, flag_reason, last_reclassified_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
      ON CONFLICT (technology_id, application_id) DO UPDATE SET
        pair_label = EXCLUDED.pair_label,
        horizon = EXCLUDED.horizon,
        horizon_reasoning = EXCLUDED.horizon_reasoning,
        confidence_band = EXCLUDED.confidence_band,
        confidence_reasoning = EXCLUDED.confidence_reasoning,
        trajectory = EXCLUDED.trajectory,
        trajectory_reasoning = EXCLUDED.trajectory_reasoning,
        is_flagged_for_review = EXCLUDED.is_flagged_for_review,
        flag_reason = EXCLUDED.flag_reason,
        last_reclassified_at = NOW(),
        last_updated_at = NOW()
      RETURNING id
    `, [tid, aid, p.label, p.horizon, p.horizon_reasoning, p.confidence,
        p.confidence_reasoning, p.trajectory, p.trajectory_reasoning,
        p.flag, p.flag_reason ?? null]);
    pairIds[p.label] = r.rows[0].id;
  }
  console.log(`  pairs (new): ${NEW_PAIRS.length}`);

  // Look up existing pairs we'll link components to
  const EXISTING_PAIR_LABELS = [
    'Pre-combustion capture × industrial point-source decarbonisation',
    'Pre-combustion capture × industrial gas processing',
  ];
  for (const label of EXISTING_PAIR_LABELS) {
    if (pairIds[label]) continue;
    const r = await client.query(`SELECT id FROM technology_application_pairs WHERE pair_label = $1`, [label]);
    if (!r.rows[0]) throw new Error(`Existing pair not found (cross-client reuse failure): ${label}`);
    pairIds[label] = r.rows[0].id;
  }

  // 4. Insert evidence (only for new pairs; we don't touch CCUS evidence)
  const newPairIds = NEW_PAIRS.map(p => pairIds[p.label]);
  await client.query(`DELETE FROM pair_evidence WHERE pair_id = ANY($1::int[])`, [newPairIds]);
  for (const e of NEW_EVIDENCE) {
    const pid = pairIds[e.pair];
    if (!pid) throw new Error(`Missing pair_id for evidence on ${e.pair}`);
    await client.query(`
      INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text,
        source_citation, source_url, publication_date, supports_horizon, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [pid, e.type, e.strength, e.text, e.citation, e.url ?? null, e.publication_date ?? null,
        e.supports ?? null, '013_blue_h2_ontology']);
  }
  console.log(`  evidence rows (new): ${NEW_EVIDENCE.length}`);

  // 5. Insert adjacencies (only for new pairs)
  await client.query(`
    DELETE FROM pair_adjacencies
    WHERE source_pair_id = ANY($1::int[]) AND target_pair_id != ALL(SELECT id FROM technology_application_pairs WHERE id != ALL($1::int[]))
       OR (source_pair_id = ANY($1::int[]) AND target_pair_id = ANY($1::int[]))
  `, [newPairIds]);
  // Simpler: delete adjacencies where source is in new pairs
  await client.query(`DELETE FROM pair_adjacencies WHERE source_pair_id = ANY($1::int[])`, [newPairIds]);
  for (const a of NEW_ADJACENCIES) {
    const sid = pairIds[a.from];
    let tid = pairIds[a.to];
    if (!tid) {
      const r = await client.query(`SELECT id FROM technology_application_pairs WHERE pair_label = $1`, [a.to]);
      tid = r.rows[0]?.id;
      if (!tid) throw new Error(`Missing target pair for adjacency: ${a.to}`);
      pairIds[a.to] = tid;
    }
    await client.query(`
      INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type,
        adjacency_strength, reasoning_text)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (source_pair_id, target_pair_id, adjacency_type) DO NOTHING
    `, [sid, tid, a.type, a.strength, a.reason]);
  }
  console.log(`  adjacencies (new): ${NEW_ADJACENCIES.length}`);

  // 6. Component links
  const compIds = {};
  for (const cname of new Set(COMPONENT_LINKS.map(l => l.component))) {
    const r = await client.query(`SELECT id FROM components WHERE name = $1 AND initiative_id = 10`, [cname]);
    if (!r.rows[0]) throw new Error(`Component not found in initiative 10: ${cname}`);
    compIds[cname] = r.rows[0].id;
  }
  // Clear existing links for these components before re-inserting
  const compIdList = Object.values(compIds);
  await client.query(`DELETE FROM component_pair_links WHERE component_id = ANY($1::int[])`, [compIdList]);
  for (const l of COMPONENT_LINKS) {
    const cid = compIds[l.component];
    const pid = pairIds[l.pair];
    if (!pid) throw new Error(`Missing pair_id for link ${l.component} -> ${l.pair}`);
    await client.query(`
      INSERT INTO component_pair_links (component_id, pair_id, link_role, reasoning_text, source_citation)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (component_id, pair_id) DO UPDATE SET
        link_role = EXCLUDED.link_role,
        reasoning_text = EXCLUDED.reasoning_text,
        source_citation = EXCLUDED.source_citation
    `, [cid, pid, l.role, l.reason, '013_blue_h2_ontology']);
  }
  console.log(`  component_pair_links: ${COMPONENT_LINKS.length} (across ${compIdList.length} components)`);

  // ============================================================================
  // Self-marking output
  // ============================================================================
  console.log('\n=== Self-marking output (Shell blue H2) ===');
  console.log(`  pairs populated (this run): ${NEW_PAIRS.length} new + ${EXISTING_PAIR_LABELS.length} reused`);

  const r2 = await client.query(`
    SELECT confidence_band, COUNT(*) AS n
    FROM technology_application_pairs WHERE id = ANY($1::int[])
    GROUP BY confidence_band ORDER BY confidence_band
  `, [newPairIds]);
  console.log(`  confidence distribution (new pairs only):`); for (const row of r2.rows) console.log(`    ${row.confidence_band}: ${row.n}`);

  const r3 = await client.query(`
    SELECT pair_label, flag_reason FROM technology_application_pairs
    WHERE id = ANY($1::int[]) AND is_flagged_for_review = TRUE
  `, [newPairIds]);
  console.log(`  flagged for review (new pairs only): ${r3.rows.length}`);
  for (const row of r3.rows) console.log(`    - ${row.pair_label} :: ${row.flag_reason}`);

  const r4 = await client.query(`
    SELECT COUNT(DISTINCT cpl.component_id) AS linked
    FROM component_pair_links cpl
    WHERE cpl.component_id = ANY($1::int[])
  `, [compIdList]);
  console.log(`  components linked: ${r4.rows[0].linked} / ${compIdList.length} initiative components`);

  // adjacency check on new pairs
  const r5 = await client.query(`
    SELECT tap.pair_label,
           COUNT(*) FILTER (WHERE pa.source_pair_id = tap.id OR pa.target_pair_id = tap.id) AS adj_count
    FROM technology_application_pairs tap
    LEFT JOIN pair_adjacencies pa ON pa.source_pair_id = tap.id OR pa.target_pair_id = tap.id
    WHERE tap.id = ANY($1::int[])
    GROUP BY tap.id, tap.pair_label
    ORDER BY adj_count, tap.pair_label
  `, [newPairIds]);
  console.log(`  adjacencies per new pair (target >= 2):`);
  for (const row of r5.rows) console.log(`    ${row.adj_count} -- ${row.pair_label}`);

  // Cross-client reuse evidence
  const r6 = await client.query(`
    SELECT tap.pair_label,
           COUNT(DISTINCT co.id) AS clients_touching
    FROM technology_application_pairs tap
    JOIN component_pair_links cpl ON cpl.pair_id = tap.id
    JOIN components c ON c.id = cpl.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN companies co ON co.id = i.company_id
    WHERE tap.id = ANY($1::int[])
    GROUP BY tap.id, tap.pair_label
    ORDER BY clients_touching DESC, tap.pair_label
  `, [Object.values(pairIds).filter(id => id)]);
  console.log(`  cross-client touching (pairs touched by >=2 distinct companies):`);
  for (const row of r6.rows) {
    if (row.clients_touching >= 2) console.log(`    ${row.clients_touching} clients -- ${row.pair_label}`);
  }

  // ============================================================================
  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — Shell blue H2 ontology persisted');
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
