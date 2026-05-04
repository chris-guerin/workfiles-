#!/usr/bin/env node
// 018_equinor_ontology.mjs — populates ontology for Equinor's offshore
// renewables and industrial decarbonisation initiatives.
//
// Per /docs/methodology/ontology_population_procedure.md v1.2.
//
// This is the cross-domain run — Equinor spans floating offshore wind
// (Hywind Tampen) and blue H2 + CCS (Saltend partnership with BP +
// Northern Lights CO2 storage). Both domains touch existing ontology
// pairs (Vattenfall floating × utility_scale, Shell/BP pre_combustion
// pairs); Equinor adds two structurally novel pairs:
//   1. floating_offshore_wind × offshore_platform_power_decarbonisation
//      (Hywind Tampen captive supply to Snorre+Gullfaks platforms;
//      structurally distinct from utility_scale and corporate_ppa)
//   2. cross_border_co2_shipping_transport × industrial_point_source
//      (Northern Lights ship-import model; distinct from pipeline transport)
//
// Cross-client adjacencies expected: floating_offshore_wind ×
// offshore_platform_power_decarbonisation should adjacency-walk back
// to Vattenfall floating × utility_scale; cross_border_co2_shipping
// should adjacency-walk to multiple Shell + BP capture pairs.
//
// Discipline: no duplicate technology rows. Existing floating_offshore_wind
// (Vattenfall) and pre_combustion_capture (CCUS) reused.
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
console.log(`=== Population — Equinor ontology (Hywind + Saltend) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// Equinor ASA company_id = 73 (existing)

const EQUINOR_INITIATIVES = [
  {
    name: 'Floating offshore wind portfolio (Hywind Tampen + ScotWind + Sørlige Nordsjø)',
    strategy_context: 'Renewables — Equinor as floating-offshore-wind technology pioneer; Hywind spar-buoy substructure proprietary IP.',
    brief_description: 'Hywind Tampen (operational 2023, 88 MW; supplies Snorre+Gullfaks platforms); Hywind Scotland (30 MW operational 2017); ScotWind allocation (6+ GW BO2 + Marram); Sørlige Nordsjø II + Utsira Nord allocations.',
    hypothesis_statement: 'Equinor sustains technology leadership in floating offshore wind through 2030 by leveraging Hywind spar-buoy IP and platform-power-decarbonisation use case as commercial anchor while ScotWind + Norwegian allocations come online.',
    why_it_matters: 'Floating offshore wind is the dominant H2 commercial pathway for Norwegian CS development; Equinor\'s technology IP is the principal differentiator vs Vattenfall + Ørsted + RWE.',
    horizon: 'H2',
    persona: 'strategy',
    time_horizon_year: 2030,
    baseline_confidence: 0.55,
  },
  {
    name: 'Industrial decarbonisation services (Saltend + Northern Lights operator + cross-border CO2 transport)',
    strategy_context: 'Industrial decarbonisation — Equinor as ATR+CCS H2 producer (H2H Saltend partnership with BP) and as Northern Lights CO2 transport+storage operator.',
    brief_description: 'H2H Saltend (0.6 Mtpa CO2 capture from ATR+CCS, BP partnership); Northern Lights phase 1 (1.5 Mtpa storage operational 2024, phase 2 expansion to 5 Mtpa at FID 2025); cross-border CO2 ship-import from EU emitters (Yara, Heidelberg, Equinor own).',
    hypothesis_statement: 'Equinor establishes leadership in NW European industrial-decarbonisation services through 2030 by anchoring blue H2 supply (Saltend) and CO2 transport+storage (Northern Lights) as integrated cluster proposition with cross-border CO2 import as additional revenue stream.',
    why_it_matters: 'Northern Lights is the principal CO2 storage destination for European industrial decarbonisation; cross-border ship-import model captures value from continental emitters without local storage geology.',
    horizon: 'H2',
    persona: 'strategy',
    time_horizon_year: 2030,
    baseline_confidence: 0.60,
  },
];

const EQUINOR_COMPONENTS = {
  // Initiative 0 (offshore wind)
  0: [
    {
      name: 'EQUINOR_FLOATING_WIND_PLATFORM',
      description: 'Equinor proprietary floating wind technology platform — Hywind spar-buoy substructure (deepest stable design at >120m water depth); 11+ MW class turbines on spar; mooring system; Hywind Tampen 88 MW operational 2023.',
      vector: 'tech',
      cross_industry: true,
      state: 'strengthening',
      trajectory: 'improving',
      source_citation: 'Equinor Hywind Tampen operator disclosures 2024; Equinor capital markets day 2024',
    },
    {
      name: 'NORWEGIAN_OFFSHORE_ALLOCATION',
      description: 'Norwegian offshore wind allocation regime — Sørlige Nordsjø II (3 GW) and Utsira Nord (1.5 GW) tendered 2024-2025; CfD-style strike price support frameworks under development.',
      vector: 'regulation',
      cross_industry: false,
      state: 'new',
      trajectory: 'improving',
      source_citation: 'Norwegian MPE offshore allocation 2024',
    },
    {
      name: 'NORWEGIAN_CONTINENTAL_SHELF_INFRA',
      description: 'Norwegian Continental Shelf grid + cable infrastructure — Statnett TSO; cross-border interconnectors (NorNed, NordLink, NSL, NorthConnect); offshore cable network supporting platform-power displacement model.',
      vector: 'ecosystem',
      cross_industry: false,
      state: 'strengthening',
      trajectory: 'improving',
      source_citation: 'Statnett grid plan 2024; ENTSO-E TYNDP 2024',
    },
  ],
  // Initiative 1 (industrial decarbonisation)
  1: [
    {
      name: 'EQUINOR_BLUE_H2_ATR_CCS',
      description: 'Equinor ATR+CCS technology platform — H2H Saltend (0.6 Mtpa CO2 capture via Linde ATR + Equinor CCS) at near-FID 2024; broader ATR-CCS partnerships with BP and TotalEnergies. ATR variant achieves ~95% capture rate vs SMR ~60%.',
      vector: 'tech',
      cross_industry: true,
      state: 'holding',
      trajectory: 'improving',
      source_citation: 'Equinor H2H Saltend operator disclosures 2024',
    },
    {
      name: 'NORTHERN_LIGHTS_CO2_TRANSPORT',
      description: 'Northern Lights CO2 transport + storage — Equinor (lead operator) + Shell + TotalEnergies. Phase 1 1.5 Mtpa operational 2024 via ship-import from continental EU emitters (Yara, Heidelberg) plus Norwegian sources; phase 2 FID 2025 expansion to 5 Mtpa; cross-border CO2 transport regulatory framework via EU CCS Directive + London Protocol amendment.',
      vector: 'ecosystem',
      cross_industry: false,
      state: 'strengthening',
      trajectory: 'improving',
      source_citation: 'Northern Lights consortium operator disclosures 2024',
    },
    {
      name: 'EU_INDUSTRIAL_DECARB_DEMAND',
      description: 'European industrial decarbonisation services demand — captures driven by EU ETS Phase IV + CBAM + Innovation Fund grants; CO2 storage demand from continental emitters with no local storage geology (Germany, France, Belgium); cross-border CO2 transport as anchor revenue stream.',
      vector: 'market',
      cross_industry: true,
      state: 'strengthening',
      trajectory: 'improving',
      source_citation: 'EU Innovation Fund disbursements 2024; Global CCS Institute Status Report 2024',
    },
  ],
};

const NEW_TECHNOLOGIES = [
  {
    name: 'cross_border_co2_shipping_transport',
    label: 'Cross-border CO2 shipping transport',
    tech_function: null,
    description: 'CO2 captured at industrial sites in one jurisdiction, liquefied (~6.5 bar, −50C), shipped via specialised semi-refrigerated CO2 carriers, and discharged at receiving terminal for pipeline injection or direct storage. Distinct from pipeline transport (no fixed infrastructure required); enables cross-border trade where source and storage are in different countries. Northern Lights phase 1 (operational 2024); CCS shipping fleet ~6 vessels operating; Norse2x ships in build for phase 2.',
    current_trl: 8,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -3,
    cost_trajectory_unit: 'pct_per_year_unit_cost',
    substitution_risk: 'emerging',
    source_citation: 'Northern Lights consortium technical disclosures 2024; IEAGHG CO2 shipping cost analysis 2024',
  },
];

const NEW_APPLICATIONS = [
  {
    name: 'offshore_platform_power_decarbonisation',
    label: 'Offshore oil/gas platform power decarbonisation',
    domain: 'industrial',
    description: 'Displacement of platform gas-turbine generation with grid-import-from-onshore or direct offshore renewable generation. Distinct from utility_scale_power_generation (no wholesale market intermediation; offtake is captive to platform operator) and from corporate_ppa_power_offtake (offtaker is internal not corporate). Hywind Tampen (Snorre + Gullfaks via 88 MW floating wind); Norwegian Continental Shelf platform-power-from-shore via cable. Norway has carbon tax + NOx tax that materially shifts platform economics toward decarbonisation.',
    market_maturity: 'emerging',
    source_citation: 'Equinor Hywind Tampen operator disclosures 2024; Norwegian Petroleum Directorate offshore decarbonisation analysis 2024',
  },
];

const NEW_PAIRS = [
  {
    label: 'Floating offshore wind × offshore platform power decarbonisation',
    technology: 'floating_offshore_wind',
    application: 'offshore_platform_power_decarbonisation',
    horizon: 'H2',
    horizon_reasoning: 'Hywind Tampen (Norway 2023, 88 MW) supplies ~35% of Snorre + Gullfaks platform power; first commercial-scale floating offshore wind dedicated to platform decarbonisation. Norwegian carbon tax + NOx tax create economic case; Equinor is sole sponsor + operator + offtaker. FID + commissioning record; commercial-scale FOAK working. H2 markers met: FOAK operational; Norwegian regulatory frameworks (carbon tax, NOx tax, CO2 storage requirements) in force; subsidy material via tax structure.',
    confidence: 'high',
    confidence_reasoning: '4 evidence rows. Equinor Hywind Tampen operator disclosures (operator_disclosure, high — Equinor is sole authoritative source for project operating data and capacity factor); Norwegian Petroleum Directorate offshore decarbonisation analysis (government_data, high); IEA Offshore Wind Outlook 2024 (industry_body, high); Equinor capital markets day 2024 (company_filing, high — listed Oslo Børs with audited disclosures). hard_evidence_count=3 (1 government_data + 1 company_filing + 1 operator_disclosure under v1.1 carve-out) → high confidence solid.',
    trajectory: 'improving',
    trajectory_reasoning: 'Norwegian carbon tax trajectory rising; second-generation platform-power FIDs (Norne, Aasta Hansteen) under evaluation; cost trajectory positive.',
    flag: false,
  },
  {
    label: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    technology: 'cross_border_co2_shipping_transport',
    application: 'industrial_point_source_decarbonisation',
    horizon: 'H1',
    horizon_reasoning: 'Northern Lights phase 1 1.5 Mtpa cross-border CO2 ship-import operational 2024 — first commercial-scale cross-border CO2 transport globally; receives from Yara (Norway domestic), Heidelberg Materials (Norway), and contracts with continental EU emitters (Yara Sluiskil 2024 onwards). EU CCS Directive + London Protocol amendment in force. H1 markers met: commercial-scale operating; FID+commissioning achieved; multiple offtake contracts; regulatory framework in force; capital flowing under EU Innovation Fund + Norwegian state backing.',
    confidence: 'high',
    confidence_reasoning: '3 evidence rows. Northern Lights consortium technical disclosures (operator_disclosure, high — consortium is sole authoritative source for project operating data); IEAGHG CO2 shipping cost analysis 2024 (industry_body, high); EU Commission Innovation Fund award disclosures (government_data, high). hard_evidence_count=2 (1 government_data + 1 operator_disclosure under v1.1 carve-out) → high confidence.',
    trajectory: 'improving',
    trajectory_reasoning: 'Phase 2 expansion to 5 Mtpa at FID 2025; vessel fleet expansion in build; cross-border contract pipeline lengthening.',
    flag: false,
  },
];

const NEW_EVIDENCE = [
  // floating × platform_decarb (4)
  { pair: 'Floating offshore wind × offshore platform power decarbonisation',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'Equinor Hywind Tampen: 88 MW operational since 2023 supplying ~35% of Snorre + Gullfaks platform power demand; world\'s largest floating wind farm; spar-buoy substructure design proprietary to Equinor. Operator is sole authoritative source for capacity factor, operating data, and platform integration metrics.',
    citation: 'Equinor Hywind Tampen operator disclosures 2024',
    url: 'https://www.equinor.com/energy/hywind-tampen',
    publication_date: '2024-08-01' },
  { pair: 'Floating offshore wind × offshore platform power decarbonisation',
    type: 'government_data', strength: 'high', supports: 'H2',
    text: 'Norwegian Petroleum Directorate offshore decarbonisation analysis 2024: ~12% of Norwegian Continental Shelf scope-1 emissions addressed by platform-power-from-shore + offshore renewables; floating offshore wind dedicated to platform supply is the dominant model in deep-water North Sea zones.',
    citation: 'Norwegian Petroleum Directorate analysis 2024',
    url: 'https://www.sodir.no/en/whats-new/news/general-news/2024/',
    publication_date: '2024-06-01' },
  { pair: 'Floating offshore wind × offshore platform power decarbonisation',
    type: 'industry_body', strength: 'high', supports: 'H2',
    text: 'IEA Offshore Wind Outlook 2024: floating offshore wind dedicated to platform-power decarbonisation is the most commercially mature application of floating wind globally; Hywind Tampen as sole operating commercial-scale example.',
    citation: 'IEA Offshore Wind Outlook 2024',
    url: 'https://www.iea.org/reports/renewables-2024',
    publication_date: '2024-10-01' },
  { pair: 'Floating offshore wind × offshore platform power decarbonisation',
    type: 'company_filing', strength: 'high', supports: 'H2',
    text: 'Equinor capital markets day 2024: Hywind Tampen operating to design capacity; second-generation platform-power FIDs (Norne, Aasta Hansteen) under evaluation; capital allocation framework prioritises platform-decarbonisation over wholesale-market wind. Listed on Oslo Børs with audited disclosures.',
    citation: 'Equinor capital markets day 2024',
    url: 'https://www.equinor.com/investors',
    publication_date: '2024-02-01' },

  // co2_shipping × IPSD (3)
  { pair: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    type: 'operator_disclosure', strength: 'high', supports: 'H1',
    text: 'Northern Lights phase 1 (Equinor + Shell + TotalEnergies): 1.5 Mtpa cross-border CO2 ship-import operational 2024; receives from Yara Sluiskil (Netherlands), Heidelberg Materials (Norway), Yara Porsgrunn (Norway); 6 vessels Norse Phase 1; Norse2x ships in build for phase 2. Consortium is sole authoritative source for shipping operating data + offtake contract structures.',
    citation: 'Northern Lights consortium technical disclosures 2024',
    url: 'https://norlights.com/news-and-media/',
    publication_date: '2024-09-01' },
  { pair: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    type: 'industry_body', strength: 'high', supports: 'H1',
    text: 'IEAGHG CO2 shipping cost analysis 2024: CO2 ship-import economics competitive with pipeline transport at distances >300km; ~$15-25/t CO2 transport cost depending on volume + distance. Operating fleet capacity ~2 Mtpa globally 2024.',
    citation: 'IEAGHG CO2 shipping cost analysis 2024',
    url: 'https://ieaghg.org/publications/technical-reports',
    publication_date: '2024-04-01' },
  { pair: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    type: 'government_data', strength: 'high', supports: 'H1',
    text: 'EU Commission Innovation Fund award disclosures 2024: cross-border CO2 transport recognised under EU CCS Directive 2009/31/EC (amended) and London Protocol Article 6 (amended 2009, ratification 2024 advancing); regulatory framework in force.',
    citation: 'EU Commission Innovation Fund + CCS Directive 2024',
    url: 'https://climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund_en',
    publication_date: '2024-07-01' },
];

const NEW_ADJACENCIES = [
  // floating × platform_decarb (4 adj — including cross-client to Vattenfall pair)
  { from: 'Floating offshore wind × offshore platform power decarbonisation',
    to:   'Floating offshore wind × utility-scale power generation',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same floating offshore wind technology; offtake mechanic differs (captive platform supply vs wholesale market). CROSS-CLIENT ADJACENCY: this pair is Equinor-anchored (Hywind Tampen); the target is Vattenfall + others-anchored (Hornsea + ScotWind + Hollandse Kust). Both rest on same physical platform with different commercial models.' },
  { from: 'Floating offshore wind × offshore platform power decarbonisation',
    to:   'Floating offshore wind × corporate PPA power offtake',
    type: 'same_technology_different_application', strength: 'moderate',
    reason: 'Same floating tech; corporate-PPA model is third commercial mode alongside utility-scale and platform-captive.' },
  { from: 'Floating offshore wind × offshore platform power decarbonisation',
    to:   'Floating offshore wind × green hydrogen supply',
    type: 'same_technology_different_application', strength: 'moderate',
    reason: 'Same floating tech; offshore-H2-via-electrolyser model is the alternative captive-supply application — both displace platform fossil consumption but via different end-use.' },
  { from: 'Floating offshore wind × offshore platform power decarbonisation',
    to:   'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'predecessor_successor', strength: 'weak',
    reason: 'Fixed-bottom utility-scale is the H1 anchor; floating-platform-decarb is the H2 derivative in deeper-water platform-supply use cases.' },

  // cross_border_co2_shipping × IPSD (5 adj — multiple cross-client complements)
  { from: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    to:   'Post-combustion amine capture × industrial point-source decarbonisation',
    type: 'complement', strength: 'strong',
    reason: 'CROSS-CLIENT ADJACENCY: amine-captured CO2 from European industrial sites (Heidelberg Brevik, Yara Sluiskil) ships via Northern Lights to Norwegian Continental Shelf storage. Pair is the storage-side complement to the capture-side pair. CCUS pair (Shell-anchored) and this pair (Equinor-anchored) are operational nodes in same supply chain.' },
  { from: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    to:   'Pre-combustion capture × industrial point-source decarbonisation',
    type: 'complement', strength: 'strong',
    reason: 'CROSS-CLIENT ADJACENCY: pre-combustion-captured CO2 from blue H2 production (Shell + BP H2Teesside + Saltend) ships or pipelines to Northern Lights for storage. Cross-client structural connection between capture-side (Shell + BP-anchored) and storage-side (Equinor-anchored) pairs.' },
  { from: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    to:   'Pre-combustion capture × hard-to-abate industrial H2 demand',
    type: 'complement', strength: 'moderate',
    reason: 'CROSS-CLIENT ADJACENCY: blue H2 supply pair generates CO2 captured at production; Northern Lights ships and stores. Cross-client complement at the supply-chain level.' },
  { from: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    to:   'Post-combustion next-gen solvent × industrial point-source decarbonisation',
    type: 'complement', strength: 'moderate',
    reason: 'Next-gen solvent capture at industrial sites also routes captured CO2 via shipping to Northern Lights; same complement pattern as first-gen amine.' },
  { from: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    to:   'Direct air capture × CDR voluntary market',
    type: 'substitute', strength: 'weak',
    reason: 'Both are storage-side pathways enabling CDR settlement: industrial-capture-plus-shipping vs DAC-plus-mineralisation. Substitute relationship at the demand-side (corporate CDR procurement).' },
];

const COMPONENT_LINKS = [
  // EQUINOR_FLOATING_WIND_PLATFORM
  { component: 'EQUINOR_FLOATING_WIND_PLATFORM',
    pair: 'Floating offshore wind × offshore platform power decarbonisation',
    role: 'primary',
    reason: 'Hywind Tampen is the principal Equinor instance of floating wind for platform decarbonisation; primary anchor.' },
  { component: 'EQUINOR_FLOATING_WIND_PLATFORM',
    pair: 'Floating offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'Equinor ScotWind allocations + Sørlige Nordsjø are utility-scale floating; secondary anchor (cross-client/cross-initiative reuse of Vattenfall-created pair).' },
  { component: 'EQUINOR_FLOATING_WIND_PLATFORM',
    pair: 'Floating offshore wind × green hydrogen supply',
    role: 'secondary',
    reason: 'Equinor explored offshore H2 via floating wind through Hywind Tampen+ adjacent concepts; secondary anchor.' },

  // NORWEGIAN_OFFSHORE_ALLOCATION
  { component: 'NORWEGIAN_OFFSHORE_ALLOCATION',
    pair: 'Floating offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'Sørlige Nordsjø II + Utsira Nord allocation regimes gate Norwegian utility-scale floating economics; secondary anchor.' },
  { component: 'NORWEGIAN_OFFSHORE_ALLOCATION',
    pair: 'Floating offshore wind × offshore platform power decarbonisation',
    role: 'secondary',
    reason: 'Norwegian carbon tax + NOx tax + CO2 storage requirement gate platform-decarb economics; secondary regulation anchor.' },

  // NORWEGIAN_CONTINENTAL_SHELF_INFRA
  { component: 'NORWEGIAN_CONTINENTAL_SHELF_INFRA',
    pair: 'Floating offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'Statnett + cross-border interconnectors enable utility-scale offshore-to-onshore power flow; ecosystem enabler.' },
  { component: 'NORWEGIAN_CONTINENTAL_SHELF_INFRA',
    pair: 'Floating offshore wind × offshore platform power decarbonisation',
    role: 'secondary',
    reason: 'Offshore cable + grid-tie infrastructure supports platform-power decarbonisation alongside floating-wind-direct supply.' },

  // EQUINOR_BLUE_H2_ATR_CCS
  { component: 'EQUINOR_BLUE_H2_ATR_CCS',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'primary',
    reason: 'H2H Saltend ATR+CCS partnership with BP IS the principal Equinor instance of pre-combustion industrial-decarbonisation. Cross-client reuse: pair created during Shell CCUS run, also linked from BP blue H2; now linked from Equinor without duplication.' },
  { component: 'EQUINOR_BLUE_H2_ATR_CCS',
    pair: 'Pre-combustion capture × hard-to-abate industrial H2 demand',
    role: 'primary',
    reason: 'H2H Saltend supplies blue H2 to BP refining + chemicals; primary anchor for Equinor on hard-to-abate H2 demand.' },
  { component: 'EQUINOR_BLUE_H2_ATR_CCS',
    pair: 'Pre-combustion capture × power-sector H2 co-firing',
    role: 'secondary',
    reason: 'Saltend H2 supply also feeds NZT Power H2 co-firing capability via BP+Equinor partnership; secondary anchor.' },

  // NORTHERN_LIGHTS_CO2_TRANSPORT
  { component: 'NORTHERN_LIGHTS_CO2_TRANSPORT',
    pair: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    role: 'primary',
    reason: 'Northern Lights consortium IS the principal commercial example of cross-border CO2 ship-import; primary anchor.' },
  { component: 'NORTHERN_LIGHTS_CO2_TRANSPORT',
    pair: 'Post-combustion amine capture × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'Northern Lights CO2 storage receives amine-captured CO2 from European industrial sites; secondary anchor reflecting storage-side dependency. Cross-client/cross-initiative reuse.' },
  { component: 'NORTHERN_LIGHTS_CO2_TRANSPORT',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'secondary',
    reason: 'Northern Lights stores pre-combustion-captured CO2 from blue H2 production (Saltend, future Shell + BP volumes); secondary anchor.' },

  // EU_INDUSTRIAL_DECARB_DEMAND
  { component: 'EU_INDUSTRIAL_DECARB_DEMAND',
    pair: 'Cross-border CO2 shipping transport × industrial point-source decarbonisation',
    role: 'primary',
    reason: 'EU industrial decarbonisation demand for cross-border CO2 transport IS the primary application driver; principal anchor.' },
  { component: 'EU_INDUSTRIAL_DECARB_DEMAND',
    pair: 'Post-combustion amine capture × industrial point-source decarbonisation',
    role: 'exposure_only',
    reason: 'Demand component carries exposure to amine-capture pair viability — services market depth depends on whether industrial capture continues commercial conversion.' },
  { component: 'EU_INDUSTRIAL_DECARB_DEMAND',
    pair: 'Pre-combustion capture × industrial point-source decarbonisation',
    role: 'exposure_only',
    reason: 'Same exposure to pre-combustion industrial-decarbonisation pair viability.' },
];

// ============================================================================
// Execution
// ============================================================================
try {
  await client.query('BEGIN');

  // Discipline check
  console.log('\n=== Discipline check: duplicate-technology guard ===');
  const FORBIDDEN = ['hywind_floating_wind','spar_buoy_floating_wind','equinor_floating','co2_shipping','co2_pipeline_transport_offshore','equinor_atr_ccs','atr_ccs_blue_hydrogen'];
  const dup = await client.query(`SELECT technology_name FROM technologies WHERE technology_name = ANY($1::text[])`, [FORBIDDEN]);
  if (dup.rows.length > 0) {
    throw new Error(`Discipline failure: duplicate technologies present: ${dup.rows.map(r=>r.technology_name).join(', ')}`);
  }
  for (const t of NEW_TECHNOLOGIES) {
    if (FORBIDDEN.includes(t.name)) throw new Error(`Discipline failure: NEW_TECHNOLOGIES tries to add forbidden: ${t.name}`);
    // Confirm not duplicate of existing floating_offshore_wind
    if (t.name === 'floating_offshore_wind' || t.name === 'fixed_bottom_offshore_wind' || t.name === 'pre_combustion_capture')
      throw new Error(`Discipline failure: NEW_TECHNOLOGIES duplicates existing tech: ${t.name}`);
  }
  console.log(`  no duplicate technology rows present or proposed (${NEW_TECHNOLOGIES.length} new tech proposed) ✓`);

  // Part A: Equinor initiatives + components
  console.log('\n=== Part A: Equinor initiatives + components ===');
  const initIds = [];
  for (let i = 0; i < EQUINOR_INITIATIVES.length; i++) {
    const init = EQUINOR_INITIATIVES[i];
    const ir = await client.query(`
      INSERT INTO initiatives_v2 (company_id, name, strategy_context, brief_description,
        hypothesis_statement, why_it_matters, horizon, persona, time_horizon_year,
        baseline_confidence, current_confidence, draft_status, state, trajectory)
      VALUES (73,$1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'draft_unreviewed','holding','volatile')
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [init.name, init.strategy_context, init.brief_description, init.hypothesis_statement,
        init.why_it_matters, init.horizon, init.persona, init.time_horizon_year, init.baseline_confidence]);
    let id;
    if (ir.rows[0]) id = ir.rows[0].id;
    else {
      const r = await client.query(`SELECT id FROM initiatives_v2 WHERE company_id=73 AND name=$1`, [init.name]);
      id = r.rows[0].id;
    }
    initIds.push(id);
    console.log(`  Equinor initiative ${i+1} id=${id}`);
  }

  const compIds = {};
  for (let idx = 0; idx < EQUINOR_INITIATIVES.length; idx++) {
    for (const cdef of EQUINOR_COMPONENTS[idx]) {
      const r = await client.query(`
        INSERT INTO components (initiative_id, name, description, component_type, vector,
          cross_industry, source_citation, draft_status, state, trajectory)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'draft_unreviewed',$8,$9)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [initIds[idx], cdef.name, cdef.description, cdef.vector, cdef.vector,
          cdef.cross_industry, cdef.source_citation, cdef.state, cdef.trajectory]);
      if (r.rows[0]) compIds[cdef.name] = r.rows[0].id;
      else {
        const r2 = await client.query(`SELECT id FROM components WHERE initiative_id=$1 AND name=$2`, [initIds[idx], cdef.name]);
        compIds[cdef.name] = r2.rows[0].id;
      }
    }
  }
  console.log(`  components: ${Object.keys(compIds).length} across 2 initiatives`);

  // Part B: ontology
  console.log('\n=== Part B: ontology ===');
  const techIds = {};
  for (const name of ['floating_offshore_wind','fixed_bottom_offshore_wind','pre_combustion_capture','post_combustion_amine_capture','post_combustion_solvent_next_gen','direct_air_capture','pem_electrolysis_industrial_scale']) {
    const r = await client.query(`SELECT id FROM technologies WHERE technology_name = $1`, [name]);
    techIds[name] = r.rows[0]?.id;
  }
  for (const t of NEW_TECHNOLOGIES) {
    const r = await client.query(`
      INSERT INTO technologies (technology_name, technology_label, tech_function_id, description,
        current_trl, trl_as_of_date, cost_trajectory_pct_yoy, cost_trajectory_unit, substitution_risk, source_citation)
      VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (technology_name) DO UPDATE SET
        technology_label = EXCLUDED.technology_label, description = EXCLUDED.description, last_updated_at = NOW()
      RETURNING id
    `, [t.name, t.label, t.description, t.current_trl, t.trl_as_of_date, t.cost_trajectory_pct_yoy,
        t.cost_trajectory_unit, t.substitution_risk, t.source_citation]);
    techIds[t.name] = r.rows[0].id;
  }
  console.log(`  technologies (new): ${NEW_TECHNOLOGIES.length}`);

  const appIds = {};
  for (const name of ['utility_scale_power_generation','corporate_ppa_power_offtake','green_hydrogen_supply','industrial_point_source_decarbonisation','industrial_gas_processing','hard_to_abate_industrial_h2_demand','power_sector_h2_co_firing','cdr_voluntary_market']) {
    const r = await client.query(`SELECT id FROM applications WHERE application_name = $1`, [name]);
    appIds[name] = r.rows[0]?.id;
  }
  for (const a of NEW_APPLICATIONS) {
    const r = await client.query(`
      INSERT INTO applications (application_name, application_label, application_domain,
        description, market_maturity, source_citation)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (application_name) DO UPDATE SET
        application_label = EXCLUDED.application_label, description = EXCLUDED.description, last_updated_at = NOW()
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

  // Existing pair labels
  const EXISTING_PAIRS = [
    'Floating offshore wind × utility-scale power generation',
    'Floating offshore wind × corporate PPA power offtake',
    'Floating offshore wind × green hydrogen supply',
    'Fixed-bottom offshore wind × utility-scale power generation',
    'Pre-combustion capture × industrial point-source decarbonisation',
    'Pre-combustion capture × hard-to-abate industrial H2 demand',
    'Pre-combustion capture × power-sector H2 co-firing',
    'Post-combustion amine capture × industrial point-source decarbonisation',
    'Post-combustion next-gen solvent × industrial point-source decarbonisation',
    'Direct air capture × CDR voluntary market',
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
        e.publication_date ?? null, e.supports ?? null, '018_equinor_ontology']);
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
    `, [compIds[l.component], pairIds[l.pair], l.role, l.reason, '018_equinor_ontology']);
  }
  console.log(`  component_pair_links: ${COMPONENT_LINKS.length} (across ${compIdList.length} components)`);

  // Self-marking
  console.log('\n=== Self-marking output (Equinor) ===');
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

  // CROSS-CLIENT ADJACENCY EDGES (this is the run KPI per the prompt)
  console.log('\n=== Cross-client adjacency edges introduced by this run ===');
  const r4 = await client.query(`
    WITH new_adj AS (
      SELECT pa.source_pair_id, pa.target_pair_id, pa.adjacency_type, pa.adjacency_strength
      FROM pair_adjacencies pa
      WHERE pa.source_pair_id = ANY($1::int[])
    )
    SELECT
      src.pair_label AS source_pair,
      tgt.pair_label AS target_pair,
      adj.adjacency_type,
      adj.adjacency_strength,
      array_agg(DISTINCT co_src.name ORDER BY co_src.name) AS source_clients,
      array_agg(DISTINCT co_tgt.name ORDER BY co_tgt.name) AS target_clients
    FROM new_adj adj
    JOIN technology_application_pairs src ON src.id = adj.source_pair_id
    JOIN technology_application_pairs tgt ON tgt.id = adj.target_pair_id
    LEFT JOIN component_pair_links cpl_src ON cpl_src.pair_id = adj.source_pair_id
    LEFT JOIN components c_src ON c_src.id = cpl_src.component_id
    LEFT JOIN initiatives_v2 i_src ON i_src.id = c_src.initiative_id
    LEFT JOIN companies co_src ON co_src.id = i_src.company_id
    LEFT JOIN component_pair_links cpl_tgt ON cpl_tgt.pair_id = adj.target_pair_id
    LEFT JOIN components c_tgt ON c_tgt.id = cpl_tgt.component_id
    LEFT JOIN initiatives_v2 i_tgt ON i_tgt.id = c_tgt.initiative_id
    LEFT JOIN companies co_tgt ON co_tgt.id = i_tgt.company_id
    GROUP BY adj.source_pair_id, adj.target_pair_id, adj.adjacency_type, adj.adjacency_strength, src.pair_label, tgt.pair_label
  `, [newPairIds]);
  let crossClientCount = 0;
  for (const row of r4.rows) {
    const src = row.source_clients.filter(x => x);
    const tgt = row.target_clients.filter(x => x);
    const srcSet = new Set(src);
    const tgtSet = new Set(tgt);
    const overlap = [...srcSet].filter(x => tgtSet.has(x));
    const sameClient = src.length > 0 && tgt.length > 0 && overlap.length === srcSet.size && overlap.length === tgtSet.size;
    const cross = src.length > 0 && tgt.length > 0 && !sameClient;
    if (cross) {
      crossClientCount++;
      console.log(`    ✱ ${row.source_pair} (${src.join(',')}) ↔ ${row.target_pair} (${tgt.join(',')}) [${row.adjacency_type}/${row.adjacency_strength}]`);
    }
  }
  console.log(`  CROSS-CLIENT structural adjacencies introduced: ${crossClientCount}`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — Equinor ontology persisted');
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
