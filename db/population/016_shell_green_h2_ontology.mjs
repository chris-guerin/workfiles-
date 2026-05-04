#!/usr/bin/env node
// 016_shell_green_h2_ontology.mjs — populates ontology for Shell's
// NW European green hydrogen initiative (initiative_id=11).
//
// Per /docs/methodology/ontology_population_procedure.md v1.2.
//
// Discipline test: PEM electrolysis × hard-to-abate industrial H2 demand
// AND PEM electrolysis × industrial point-source decarbonisation already
// exist (created during Shell blue H2 run). This script MUST link to
// those existing pairs via component_pair_links — NO duplicate
// technology or pair rows. Duplicate-technology guard active at startup.
//
// New technologies: 1 (alkaline_electrolysis_industrial; distinct from
// PEM — different materials, no PGM, different stack design).
// New applications: 1 (steel_decarbonisation; distinct from
// hard_to_abate_industrial_h2_demand because the steel-specific
// substitution dynamics (H2-DRI vs MOE vs direct iron electrolysis) are
// uniquely structural).
// New pairs: 3.
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
console.log(`=== Population — Shell green H2 ontology ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

const NEW_TECHNOLOGIES = [
  {
    name: 'alkaline_electrolysis_industrial',
    label: 'Alkaline electrolysis (industrial scale)',
    tech_function: 'pem_electrolysis_industrial_scale',  // shares the broader tech_function loosely; physical principle differs
    description: 'Water electrolysis via alkaline KOH electrolyte at MW-to-100MW industrial scale. No PGM catalysts (Ni-Fe-based); lower capex than PEM but lower load-following capability and lower current density. NEL, Thyssenkrupp Nucera, John Cockerill, McPhy as principal OEMs. Stegra (800 MW combined PEM+alkaline) at FID; H2-Fifty (Frankfurt) and H2 Magnum (Eemshaven) alkaline-led at FID stage.',
    current_trl: 9,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -7,
    cost_trajectory_unit: 'pct_per_year_capex',
    substitution_risk: 'emerging',
    source_citation: 'IRENA Hydrogen Cost Report 2024; IEA Global Hydrogen Review 2024',
  },
];

const NEW_APPLICATIONS = [
  {
    name: 'steel_decarbonisation',
    label: 'Steel decarbonisation (DRI / electrolytic / H2-route)',
    domain: 'industrial',
    description: 'Decarbonisation pathways for primary steel production: direct-reduced-iron (DRI) using H2 instead of natural gas reductant; molten-oxide electrolysis (MOE, Boston Metal); direct iron electrolysis (Helios Aragón). Distinct application from hard_to_abate_industrial_h2_demand because steel-specific substitution dynamics (H2-DRI vs MOE vs direct iron electrolysis) are structurally unique — non-H2 routes carry their own H3 risk and substitute the H2-DRI pathway entirely. H2 Green Steel/Stegra Boden anchored on H2-DRI; SSAB HYBRIT pilot operational.',
    market_maturity: 'emerging',
    source_citation: 'IEA Iron and Steel Technology Roadmap 2024; Stegra/H2 Green Steel project disclosures 2024',
  },
];

const NEW_PAIRS = [
  {
    label: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    technology: 'alkaline_electrolysis_industrial',
    application: 'hard_to_abate_industrial_h2_demand',
    horizon: 'H2',
    horizon_reasoning: 'Alkaline at industrial scale supplying refining, ammonia, methanol and steel-DRI: NEL Heroya 500 MW capacity announced; H2 Magnum 100 MW Eemshaven FID 2024; Stegra Boden 800 MW combined PEM+alkaline FID 2023, commissioning 2026. More mature than PEM at industrial scale because of lower capex and longer operating history of underlying alkaline technology (50+ years in chlor-alkali). H2 markers met: FOAK at FID stage; FIDs being considered 2026-2030; regulatory frameworks (45V, EU Hydrogen Bank) in force; subsidy material.',
    confidence: 'high',
    confidence_reasoning: '4 evidence rows. IRENA Hydrogen Cost Report 2024 (industry_body, high — but cross-checked); IEA Global Hydrogen Review 2024 (industry_body, high); Stegra/H2 Green Steel project disclosures (operator_disclosure, high — sole authoritative source for Boden project structure, qualifies under v1.1 carve-out); Thyssenkrupp Nucera capital markets day (company_filing, high — listed Frankfurt with audited disclosures). hard_evidence_count=2 (1 company_filing + 1 operator_disclosure under v1.1 carve-out) → high confidence valid.',
    trajectory: 'improving',
    trajectory_reasoning: 'Capex trajectory −7% YoY per IRENA; stack manufacturing scale-up at Thyssenkrupp Nucera, NEL; FID rate accelerating in Europe under Hydrogen Bank.',
    flag: false,
  },
  {
    label: 'Alkaline electrolysis × industrial point-source decarbonisation',
    technology: 'alkaline_electrolysis_industrial',
    application: 'industrial_point_source_decarbonisation',
    horizon: 'H3',
    horizon_reasoning: 'Alkaline electrolysis paired with industrial flue-gas decarbonisation (refining, ammonia, chemicals) is structurally similar to PEM × industrial_point_source — green H2 substitution into process inputs alongside on-site CCS. No commercial-scale operating units; pre-FID retrofit considerations. H3 markers: technology demonstrated but applications speculative; cost trajectory uncompetitive against subsidy-bridged blue at most sites.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. IRENA Hydrogen Cost Report 2024 (industry_body, high); Hydrogen Council Compass 2024 (industry_body, medium); H2 Magnum project page (operator_disclosure, medium). hard_evidence_count=0 (no peer_reviewed/company_filing/government_data; H2 Magnum at medium-strength operator_disclosure does not qualify under v1.1 carve-out). Held at medium because the pair has structural relevance but evidence depth is thin at the alkaline-IPSD intersection specifically.',
    trajectory: 'holding',
    trajectory_reasoning: 'No structural change in pair status pending broader IPSD-retrofit FID activity.',
    flag: false,
  },
  {
    label: 'PEM electrolysis × steel decarbonisation',
    technology: 'pem_electrolysis_industrial_scale',
    application: 'steel_decarbonisation',
    horizon: 'H3',
    horizon_reasoning: 'PEM electrolysis supplying H2 to direct-reduced-iron (DRI) for primary steel decarbonisation: HYBRIT (SSAB+LKAB+Vattenfall) 60 ktpa pilot operational since 2021; Stegra Boden 800 MW PEM+alkaline → 2.5 Mtpa green steel commissioning 2026. Substitution surface to non-H2 DRI routes (Boston Metal MOE, Helios Aragón direct iron electrolysis) carries structural risk. H3 markers: technology demonstrated but commercial scale FOAK-only; non-H2 substitute pathways with own development trajectories; cost trajectory dependent on green-H2 cost reaching $2-3/kg.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. IEA Iron and Steel Technology Roadmap 2024 (industry_body, high); Stegra/H2 Green Steel project disclosures (operator_disclosure, high — sole authoritative); SSAB HYBRIT operator disclosures (operator_disclosure, high — partnership-level disclosures). hard_evidence_count=2 (2 operator_disclosure rows under v1.1 carve-out) → could support high but held at medium because the substitution risk from non-H2 routes (MOE, direct iron electrolysis) is material and the pair is at FOAK rather than commercial.',
    trajectory: 'volatile',
    trajectory_reasoning: 'Stegra commissioning 2026 will materially clarify the H2-DRI commercial route; non-H2 alternatives (Boston Metal Series C 2024, Helios Aragón pilot) advancing in parallel — substitution dynamics unresolved.',
    flag: false,
  },
];

const NEW_EVIDENCE = [
  // alkaline × hard_to_abate (4)
  { pair: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    type: 'industry_body', strength: 'high', supports: 'H2',
    text: 'IRENA Hydrogen Cost Report 2024: alkaline capex ~$800-1200/kW 2024 (vs PEM $1,400-1,800/kW); ~7% YoY decline; long operating history in chlor-alkali (50+ years) translating to industrial-H2 deployment.',
    citation: 'IRENA Hydrogen Cost Report 2024',
    url: 'https://www.irena.org/publications',
    publication_date: '2024-09-01' },
  { pair: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    type: 'industry_body', strength: 'high', supports: 'H2',
    text: 'IEA Global Hydrogen Review 2024: alkaline accounts for ~60% of global electrolyser capacity 2024; ~5 Mt/yr at FID 2024-2026 across PEM+alkaline mix; hard-to-abate demand pull from Stegra-style steel projects + ammonia greening.',
    citation: 'IEA Global Hydrogen Review 2024',
    url: 'https://www.iea.org/reports/global-hydrogen-review-2024',
    publication_date: '2024-10-01' },
  { pair: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'Stegra (formerly H2 Green Steel) Boden Sweden: 800 MW combined PEM+alkaline at FID 2023, commissioning 2026; >2 Mtpa green steel via H2-DRI route; Imatra Forest + Marcegaglia + ZF anchor offtakers. Operator publishes structured project disclosures via investor materials.',
    citation: 'Stegra (H2 Green Steel) project disclosures 2024',
    url: 'https://www.stegra.com/news',
    publication_date: '2024-05-01' },
  { pair: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    type: 'company_filing', strength: 'high', supports: 'H2',
    text: 'Thyssenkrupp Nucera capital markets day 2024: order book ~1.5 GW alkaline electrolyser capacity; supply agreements with H2-Fifty (Frankfurt), Stegra Boden, Air Liquide Bécancour. Listed on Frankfurt Xetra with audited disclosures.',
    citation: 'Thyssenkrupp Nucera capital markets day 2024',
    url: 'https://www.thyssenkrupp-nucera.com/en/investors',
    publication_date: '2024-09-01' },

  // alkaline × industrial_point_source (3)
  { pair: 'Alkaline electrolysis × industrial point-source decarbonisation',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IRENA: alkaline electrolyser retrofit at industrial point sources (refineries, chemical plants) contemplated under EU Hydrogen Bank programme but pre-FID at scale; no commercial-scale operating retrofit units.',
    citation: 'IRENA Hydrogen Cost Report 2024',
    url: 'https://www.irena.org/publications',
    publication_date: '2024-09-01' },
  { pair: 'Alkaline electrolysis × industrial point-source decarbonisation',
    type: 'industry_body', strength: 'medium', supports: 'H3',
    text: 'Hydrogen Council Compass: alkaline-IPSD specifically thinly developed; alkaline preference for steady-state load makes it less suited to flue-gas-driven duty cycles than PEM.',
    citation: 'Hydrogen Council Hydrogen Insights 2024 (Compass)',
    url: 'https://hydrogencouncil.com/en/hydrogen-insights-2024/',
    publication_date: '2024-05-01' },
  { pair: 'Alkaline electrolysis × industrial point-source decarbonisation',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'H2 Magnum (Eemshaven): 100 MW alkaline at FID 2024 supplying industrial decarbonisation; precise integration with point-source CCS pathway TBC.',
    citation: 'H2 Magnum operator disclosures 2024',
    url: 'https://www.h2magnum.nl/',
    publication_date: '2024-08-01' },

  // pem × steel_decarbonisation (3)
  { pair: 'PEM electrolysis × steel decarbonisation',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IEA Iron and Steel Technology Roadmap 2024: H2-DRI route requires ~60 kg H2/t steel; ~5 Mt/yr green-H2 demand from steel by 2030 if announced FIDs deliver; substitute risk from MOE (Boston Metal) and direct iron electrolysis (Helios Aragón) at TRL 5-7.',
    citation: 'IEA Iron and Steel Technology Roadmap 2024',
    url: 'https://www.iea.org/reports/iron-and-steel-technology-roadmap',
    publication_date: '2024-08-01' },
  { pair: 'PEM electrolysis × steel decarbonisation',
    type: 'operator_disclosure', strength: 'high', supports: 'H3',
    text: 'Stegra Boden: 2.5 Mtpa green steel via H2-DRI route, anchored on 800 MW PEM+alkaline electrolyser FID 2023; commissioning 2026 — first commercial H2-DRI primary steel.',
    citation: 'Stegra (H2 Green Steel) project disclosures 2024',
    url: 'https://www.stegra.com/news',
    publication_date: '2024-05-01' },
  { pair: 'PEM electrolysis × steel decarbonisation',
    type: 'operator_disclosure', strength: 'high', supports: 'H3',
    text: 'SSAB HYBRIT (LKAB + Vattenfall partnership): 60 ktpa H2-DRI pilot operational since 2021; commercial-scale 1.3 Mtpa Gällivare project FID announced 2023, commissioning 2028.',
    citation: 'SSAB HYBRIT operator disclosures 2024',
    url: 'https://www.hybritdevelopment.se/en/',
    publication_date: '2024-04-01' },
];

const NEW_ADJACENCIES = [
  // alkaline × hard_to_abate (4)
  { from: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    to:   'Alkaline electrolysis × industrial point-source decarbonisation',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same alkaline electrolysis tech; different demand application (H2-as-product vs H2-as-decarbonisation-input).' },
  { from: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Both serve hard-to-abate H2 demand; alkaline is mature low-cost incumbent, PEM has load-following advantage. Substitution surface bidirectional depending on duty cycle.' },
  { from: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    to:   'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'substitute', strength: 'strong',
    reason: 'Alkaline green H2 vs blue H2 (pre-combustion) for same hard-to-abate demand application — both supply same H2 demand but with different carbon economics. Substitution dynamic depends on relative cost trajectory and 45V/Hydrogen Bank treatment.' },
  { from: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    to:   'PEM electrolysis × steel decarbonisation',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Steel decarbonisation overlaps with hard-to-abate H2 demand; alkaline can supply the same end-use as PEM in DRI applications (Stegra uses both).' },

  // alkaline × industrial_point_source (3)
  { from: 'Alkaline electrolysis × industrial point-source decarbonisation',
    to:   'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Mirror.' },
  { from: 'Alkaline electrolysis × industrial point-source decarbonisation',
    to:   'PEM electrolysis × industrial point-source decarbonisation',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Both serve industrial point-source decarbonisation via green H2 input substitution; alkaline preferred where steady load and capex sensitivity dominate; PEM where load-following matters.' },
  { from: 'Alkaline electrolysis × industrial point-source decarbonisation',
    to:   'Post-combustion amine capture × industrial point-source decarbonisation',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Both are decarbonisation pathways for the same end goal; alkaline reduces emissions via H2 input substitution while amine captures flue gas. Distinct decarbonisation routes; substitution surface at site level.' },

  // pem × steel_decarbonisation (3)
  { from: 'PEM electrolysis × steel decarbonisation',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same PEM electrolysis; steel-specific demand application is a sub-segment of broader hard-to-abate H2 demand but with structurally different substitution dynamics (H2-DRI vs non-H2 routes).' },
  { from: 'PEM electrolysis × steel decarbonisation',
    to:   'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Mirror.' },
  { from: 'PEM electrolysis × steel decarbonisation',
    to:   'Fixed-bottom offshore wind × green hydrogen supply',
    type: 'complement', strength: 'moderate',
    reason: 'Cross-pair complement: offshore wind feeds dedicated PPA capacity to PEM electrolysers serving steel decarbonisation. Stegra Boden anchored on offshore-wind-PPA model. Pairs are complementary nodes in same supply chain — wind supplies electricity, electrolyser converts to H2, H2-DRI displaces coke-blast-furnace.' },
];

const COMPONENT_LINKS = [
  // PEM_ELECTROLYSIS_INDUSTRIAL_SCALE (id=23)
  { component: 'PEM_ELECTROLYSIS_INDUSTRIAL_SCALE',
    pair: 'PEM electrolysis × industrial point-source decarbonisation',
    role: 'primary',
    reason: 'Holland Hydrogen 1 (Shell, 200 MW PEM, Q4 2025 commissioning) at Pernis refinery is Shell\'s primary instance of PEM-IPSD. Cross-client/cross-initiative reuse: pair was created during Shell blue H2 ontology run; now linked from Shell green H2 initiative without duplication.' },
  { component: 'PEM_ELECTROLYSIS_INDUSTRIAL_SCALE',
    pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    role: 'primary',
    reason: 'REFHYNE Rheinland (10 MW PEM, operational 2021) supplies refining decarbonisation; primary anchor for PEM-hard-to-abate. Existing pair reuse.' },
  { component: 'PEM_ELECTROLYSIS_INDUSTRIAL_SCALE',
    pair: 'PEM electrolysis × steel decarbonisation',
    role: 'primary',
    reason: 'Shell PEM technology applicable to H2-DRI steel decarbonisation; primary anchor for PEM-steel via Shell technology platform exposure (Stegra and SSAB HYBRIT use comparable PEM technology).' },
  { component: 'PEM_ELECTROLYSIS_INDUSTRIAL_SCALE',
    pair: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    role: 'secondary',
    reason: 'Shell exploring alkaline alongside PEM for new builds (alkaline preferred where capex and steady load dominate); secondary anchor.' },
  { component: 'PEM_ELECTROLYSIS_INDUSTRIAL_SCALE',
    pair: 'Alkaline electrolysis × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'Same exposure dynamic — alkaline considered alongside PEM for industrial-decarbonisation retrofit at Shell sites.' },

  // EU_HYDROGEN_BANK (id=24)
  { component: 'EU_HYDROGEN_BANK',
    pair: 'PEM electrolysis × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'EU Hydrogen Bank funds green-H2 production via fixed-premium auction; gates green-H2-IPSD economics for EU projects.' },
  { component: 'EU_HYDROGEN_BANK',
    pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    role: 'secondary',
    reason: 'Hydrogen Bank gates supply-side green-H2 economics that flow through to hard-to-abate demand pricing.' },
  { component: 'EU_HYDROGEN_BANK',
    pair: 'PEM electrolysis × steel decarbonisation',
    role: 'secondary',
    reason: 'Hydrogen Bank funds offtake to steel-DRI projects via demand-side auctions; gates pair viability.' },
  { component: 'EU_HYDROGEN_BANK',
    pair: 'Alkaline electrolysis × hard-to-abate industrial H2 demand',
    role: 'secondary',
    reason: 'Same gating dynamic for alkaline-supplied hard-to-abate H2.' },
  { component: 'EU_HYDROGEN_BANK',
    pair: 'Alkaline electrolysis × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'Same gating dynamic for alkaline-supplied IPSD.' },

  // NON_H2_DRI_THREAT (id=25) — substitute exposure surface
  { component: 'NON_H2_DRI_THREAT',
    pair: 'PEM electrolysis × steel decarbonisation',
    role: 'exposure_only',
    reason: 'Non-H2 DRI routes (Boston Metal MOE Series C 2024, Helios Aragón direct iron electrolysis pilot) substitute the H2-DRI pathway for primary steel decarbonisation. NON_H2_DRI_THREAT component carries the substitute exposure surface.' },
  { component: 'NON_H2_DRI_THREAT',
    pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    role: 'exposure_only',
    reason: 'Substitution from non-H2 DRI removes a material slice of hard-to-abate H2 demand if non-H2 routes commercialise. Cross-pair exposure surface.' },
];

// ============================================================================
// Execution
// ============================================================================
try {
  await client.query('BEGIN');

  // Discipline check: scan for forbidden duplicate technologies
  console.log('\n=== Discipline check: duplicate-technology guard ===');
  // Forbidden = anything that re-creates an existing tech under a different name
  const FORBIDDEN_DUPLICATES = ['pem_electrolysis','pem_electrolyser','pem_industrial_scale'];
  const check = await client.query(`
    SELECT technology_name FROM technologies
    WHERE technology_name = ANY($1::text[])
      AND technology_name != 'pem_electrolysis_industrial_scale'
  `, [FORBIDDEN_DUPLICATES]);
  if (check.rows.length > 0) {
    throw new Error(`Discipline failure: duplicate technologies present: ${check.rows.map(r=>r.technology_name).join(', ')}`);
  }
  for (const t of NEW_TECHNOLOGIES) {
    // Check that nothing in NEW_TECHNOLOGIES is already in the table under another name
    if (FORBIDDEN_DUPLICATES.includes(t.name)) {
      throw new Error(`Discipline failure: NEW_TECHNOLOGIES tries to add forbidden duplicate of pem_electrolysis_industrial_scale: ${t.name}`);
    }
    // Check it's not already there
    const ex = await client.query(`SELECT id FROM technologies WHERE technology_name = $1`, [t.name]);
    if (ex.rows[0]) console.log(`  warn: technology ${t.name} already exists — will UPDATE`);
  }
  console.log(`  no duplicate technology rows present or proposed ✓`);

  // Resolve technology + application IDs (existing + new)
  const techIds = {};
  for (const name of ['pem_electrolysis_industrial_scale','pre_combustion_capture','post_combustion_amine_capture','fixed_bottom_offshore_wind']) {
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
        description = EXCLUDED.description,
        last_updated_at = NOW()
      RETURNING id
    `, [t.name, t.label, funcId, t.description, t.current_trl, t.trl_as_of_date, t.cost_trajectory_pct_yoy,
        t.cost_trajectory_unit, t.substitution_risk, t.source_citation]);
    techIds[t.name] = r.rows[0].id;
  }
  console.log(`  technologies (new): ${NEW_TECHNOLOGIES.length}`);

  const appIds = {};
  for (const name of ['hard_to_abate_industrial_h2_demand','industrial_point_source_decarbonisation','green_hydrogen_supply']) {
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
    `, [techIds[p.technology], appIds[p.application], p.label, p.horizon, p.horizon_reasoning, p.confidence,
        p.confidence_reasoning, p.trajectory, p.trajectory_reasoning,
        p.flag, p.flag_reason ?? null]);
    pairIds[p.label] = r.rows[0].id;
  }
  console.log(`  pairs (new): ${NEW_PAIRS.length}`);

  // Look up existing target pair labels
  const EXISTING_PAIR_LABELS = [
    'PEM electrolysis × hard-to-abate industrial H2 demand',
    'PEM electrolysis × industrial point-source decarbonisation',
    'Pre-combustion capture × hard-to-abate industrial H2 demand',
    'Post-combustion amine capture × industrial point-source decarbonisation',
    'Fixed-bottom offshore wind × green hydrogen supply',
  ];
  for (const label of EXISTING_PAIR_LABELS) {
    if (pairIds[label]) continue;
    const r = await client.query(`SELECT id FROM technology_application_pairs WHERE pair_label = $1`, [label]);
    if (!r.rows[0]) throw new Error(`Existing pair not found: ${label}`);
    pairIds[label] = r.rows[0].id;
  }

  // Evidence
  const newPairIds = NEW_PAIRS.map(p => pairIds[p.label]);
  await client.query(`DELETE FROM pair_evidence WHERE pair_id = ANY($1::int[])`, [newPairIds]);
  for (const e of NEW_EVIDENCE) {
    await client.query(`
      INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text,
        source_citation, source_url, publication_date, supports_horizon, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [pairIds[e.pair], e.type, e.strength, e.text, e.citation, e.url ?? null,
        e.publication_date ?? null, e.supports ?? null, '016_shell_green_h2_ontology']);
  }
  console.log(`  evidence rows (new): ${NEW_EVIDENCE.length}`);

  await client.query(`DELETE FROM pair_adjacencies WHERE source_pair_id = ANY($1::int[])`, [newPairIds]);
  for (const a of NEW_ADJACENCIES) {
    if (!pairIds[a.from]) throw new Error(`Missing source pair: ${a.from}`);
    if (!pairIds[a.to]) throw new Error(`Missing target pair: ${a.to}`);
    await client.query(`
      INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type,
        adjacency_strength, reasoning_text)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (source_pair_id, target_pair_id, adjacency_type) DO NOTHING
    `, [pairIds[a.from], pairIds[a.to], a.type, a.strength, a.reason]);
  }
  console.log(`  adjacencies (new): ${NEW_ADJACENCIES.length}`);

  // Component links
  const compIds = {};
  for (const cname of new Set(COMPONENT_LINKS.map(l => l.component))) {
    const r = await client.query(`SELECT id FROM components WHERE name = $1 AND initiative_id = 11`, [cname]);
    if (!r.rows[0]) throw new Error(`Component not found in initiative 11: ${cname}`);
    compIds[cname] = r.rows[0].id;
  }
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
    `, [compIds[l.component], pairIds[l.pair], l.role, l.reason, '016_shell_green_h2_ontology']);
  }
  console.log(`  component_pair_links: ${COMPONENT_LINKS.length} (across ${compIdList.length} components)`);

  // Self-marking output (v1.2 includes hard_evidence_count)
  console.log('\n=== Self-marking output (Shell green H2) ===');
  const r2 = await client.query(`
    SELECT confidence_band, hard_evidence_count, COUNT(*) AS n
    FROM technology_application_pairs WHERE id = ANY($1::int[])
    GROUP BY confidence_band, hard_evidence_count ORDER BY confidence_band, hard_evidence_count
  `, [newPairIds]);
  console.log(`  confidence × hard_evidence_count distribution:`);
  for (const row of r2.rows) console.log(`    ${row.confidence_band} / hard=${row.hard_evidence_count}: ${row.n}`);
  const r3 = await client.query(`
    SELECT pair_label, flag_reason FROM technology_application_pairs WHERE id = ANY($1::int[]) AND is_flagged_for_review = TRUE
  `, [newPairIds]);
  console.log(`  flagged for review: ${r3.rows.length}`);
  for (const row of r3.rows) console.log(`    - ${row.pair_label}`);
  const r4 = await client.query(`
    SELECT COUNT(DISTINCT cpl.component_id) AS linked
    FROM component_pair_links cpl WHERE cpl.component_id = ANY($1::int[])
  `, [compIdList]);
  console.log(`  components linked: ${r4.rows[0].linked} / ${compIdList.length} components in initiative 11`);

  // Cross-client overlap touched by this run
  const r5 = await client.query(`
    SELECT tap.pair_label, COUNT(DISTINCT co.id) AS clients_touching, ARRAY_AGG(DISTINCT co.name ORDER BY co.name) AS companies
    FROM technology_application_pairs tap
    JOIN component_pair_links cpl ON cpl.pair_id = tap.id
    JOIN components c ON c.id = cpl.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN companies co ON co.id = i.company_id
    WHERE tap.id = ANY($1::int[])
       OR cpl.component_id = ANY($2::int[])
    GROUP BY tap.id, tap.pair_label
    HAVING COUNT(DISTINCT co.id) >= 2
    ORDER BY clients_touching DESC
  `, [newPairIds, compIdList]);
  console.log(`\n  cross-client pairs touched by this run (>=2 companies): ${r5.rows.length}`);
  for (const row of r5.rows) console.log(`    ${row.clients_touching} (${row.companies.join(' + ')}) -- ${row.pair_label}`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — Shell green H2 ontology persisted');
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
