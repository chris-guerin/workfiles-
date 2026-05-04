#!/usr/bin/env node
// 015_vattenfall_offshore_wind_ontology.mjs — populates ontology for
// Vattenfall's offshore wind portfolio initiative.
//
// Per /docs/methodology/ontology_population_procedure.md v1.1.
//
// Vattenfall is not yet in the companies table — the script creates
// the company, the initiative, and 4 v3 components, then runs the
// ontology population. This is the first non-Shell client and the
// first cross-client overlap test.
//
// Test conditions for this run:
//  - Utility client (vs IOC). Different evidence base profile —
//    expect richer government_data + ENTSO-E + grid-operator sources.
//  - Cross-client overlap intentionally exercised: a component links
//    to PEM electrolysis × hard_to_abate_industrial_h2_demand
//    (created by Shell blue H2 run); Q3 cross-client query should
//    surface this pair as touched by 2 distinct companies.
//
// New technologies: 2 (fixed_bottom_offshore_wind, floating_offshore_wind).
// New applications: 3 (utility_scale_power_generation,
//   corporate_ppa_power_offtake, green_hydrogen_supply).
// New pairs: 6.
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
console.log(`=== Population — Vattenfall offshore wind ontology ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// ============================================================================
// Part A: create Vattenfall company + initiative + components
// ============================================================================

const VATTENFALL_INITIATIVE = {
  name: 'Northern European offshore wind portfolio (Hollandse Kust + Norfolk + Nordlicht)',
  strategy_context: 'Renewables — Vattenfall as utility-scale offshore wind operator across Dutch + UK + German waters; build-to-operate model with corporate PPA + government-CfD revenue mix.',
  brief_description: 'Hollandse Kust Zuid (operational 2023, 1.5 GW), Hollandse Kust West (under construction), Norfolk Boreas (CfD AR4 retracted, AR6 redeveloped), Nordlicht 1+2 (FID 2024, 1.6 GW).',
  hypothesis_statement: 'Vattenfall sustains profitable utility-scale offshore wind portfolio in Northern Europe through 2030 by combining government-CfD revenue floors with corporate PPA pricing, while migrating site portfolio toward floating offshore wind in deeper-water North Sea zones from 2028 onwards.',
  why_it_matters: 'Largest non-IOC offshore wind operator in NW Europe; demonstrates utility-financing model viability against IOC entrants (Shell, BP, TotalEnergies) and pure-play developers (Ørsted, RWE).',
  horizon: 'H2',
  persona: 'strategy',
  time_horizon_year: 2030,
  baseline_confidence: 0.55,
};

const VATTENFALL_COMPONENTS = [
  {
    name: 'OFFSHORE_WIND_TURBINE_PLATFORM',
    description: 'Modern offshore wind turbine platform — 15+ MW class (Siemens Gamesa SG 14-236, Vestas V236-15.0, GE Haliade-X 14, Mingyang 18-22 MW). Hub heights 150m+, rotor 220-280m, foundation monopile or jacket; floating substructure variants emerging for >60m water depth.',
    component_type: 'tech',
    vector: 'tech',
    cross_industry: true,
    state: 'strengthening',
    trajectory: 'improving',
    source_citation: 'GWEC Global Wind Report 2024; Siemens Gamesa + Vestas product disclosures 2024',
  },
  {
    name: 'UK_AR6_AR7_CFD_FRAMEWORK',
    description: 'UK Contracts for Difference offshore wind allocation rounds — AR4 cleared 2022 at low strike (£37.35/MWh, retroactively undeliverable), AR5 cleared 2023 at no offshore wind awards, AR6 (2024) cleared offshore wind at higher strike with separate Pot 3 allocation, AR7 (2025-2026) framework redesign post-AR5 failure.',
    component_type: 'regulation',
    vector: 'regulation',
    cross_industry: false,
    state: 'ambiguous',
    trajectory: 'volatile',
    source_citation: 'UK DESNZ CfD allocation rounds 2022-2024; National Grid ESO settlement data',
  },
  {
    name: 'EU_NSEC_OFFSHORE_GRID',
    description: 'EU North Seas Energy Cooperation (NSEC) and ENTSO-E North Sea Grid — coordination of offshore grid build-out, hybrid interconnector + offshore wind assets, cross-border CfD harmonisation. Includes Dutch IJmuiden Ver Beta hub (FID 2024), German SuedOstLink offshore tie, EU Offshore Renewable Energy strategy.',
    component_type: 'ecosystem',
    vector: 'ecosystem',
    cross_industry: false,
    state: 'strengthening',
    trajectory: 'improving',
    source_citation: 'ENTSO-E TYNDP 2024; NSEC Joint Statement 2023',
  },
  {
    name: 'CORPORATE_PPA_OFFTAKE_DEMAND',
    description: 'Corporate PPA market for offshore wind capacity — 15-25 year tenor offtake at fixed-or-CPI-indexed price. Microsoft, Amazon, Google, Meta as primary anchor buyers; H2 supply via dedicated wind-electrolyser PPAs emerging. Pricing pressure from CfD allocation outcomes and corporate ESG commitments.',
    component_type: 'market',
    vector: 'market',
    cross_industry: true,
    state: 'strengthening',
    trajectory: 'improving',
    source_citation: 'BNEF Corporate Energy Market Outlook 2024; RE100 Corporate PPA tracker',
  },
];

// ============================================================================
// Part B: ontology population
// ============================================================================

const NEW_TECHNOLOGIES = [
  {
    name: 'fixed_bottom_offshore_wind',
    label: 'Fixed-bottom offshore wind',
    tech_function: null,
    description: 'Offshore wind turbine on monopile or jacket foundation in waters typically <60m depth. Mature commercial — UK + Germany + Denmark + Netherlands fleets at 30+ GW; Hornsea (UK 1+2+3), Doggerbank, Hollandse Kust, Borssele, Greater Gabbard. 15-MW class turbines standard for new builds 2024-2026.',
    current_trl: 9,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -3,
    cost_trajectory_unit: 'pct_per_year_LCOE',
    substitution_risk: 'none',
    source_citation: 'IEA Offshore Wind Outlook 2024; GWEC Global Wind Report 2024',
  },
  {
    name: 'floating_offshore_wind',
    label: 'Floating offshore wind',
    tech_function: null,
    description: 'Offshore wind turbine on floating substructure (semi-submersible, spar-buoy, TLP) in waters typically >60m depth. Hywind Tampen (Norway 2023, 88 MW, world\'s largest operating floating); Kincardine (Scotland 50 MW); WindFloat Atlantic (Portugal 25 MW). FOAK commercial; ScotWind clearing zones at 5+ GW for 2026-2030 FIDs; CelticSea Round 5 + EU 2030+ build-out.',
    current_trl: 7,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -8,
    cost_trajectory_unit: 'pct_per_year_LCOE',
    substitution_risk: 'none',
    source_citation: 'IEA Offshore Wind Outlook 2024; Equinor Hywind Tampen operator disclosures 2024',
  },
];

const NEW_APPLICATIONS = [
  {
    name: 'utility_scale_power_generation',
    label: 'Utility-scale power generation (wholesale)',
    domain: 'power',
    description: 'Wholesale electricity supply to power markets via TSO-connected generation. Revenue mix of CfD strike prices, capacity market payments, balancing markets and merchant exposure. Covers offshore wind, onshore wind, utility-solar, hydro at TSO-connected scale.',
    market_maturity: 'mature',
    source_citation: 'IEA World Energy Outlook 2024; ENTSO-E TYNDP 2024',
  },
  {
    name: 'corporate_ppa_power_offtake',
    label: 'Corporate PPA power offtake (long-tenor fixed-price contracts)',
    domain: 'power',
    description: 'Direct corporate offtake of generation under 15-25 year PPAs at fixed or CPI-indexed price. Microsoft, Amazon, Google, Meta as anchor buyers driving demand for additional renewable capacity beyond regulated mandates. PPA pricing typically references but de-couples from wholesale and CfD-strike-price signals.',
    market_maturity: 'growing',
    source_citation: 'BNEF Corporate Energy Market Outlook 2024; RE100 Corporate PPA tracker',
  },
  {
    name: 'green_hydrogen_supply',
    label: 'Green hydrogen supply (offshore-wind-fed electrolyser PPAs)',
    domain: 'industrial',
    description: 'Dedicated offshore-wind capacity feeding industrial-scale electrolyser via direct PPA or co-located build, producing green H2 for hard-to-abate industrial demand. Distinct application from utility_scale_power_generation (no wholesale market intermediation) and from hard_to_abate_industrial_h2_demand (which is the H2-product demand application; this is the H2-feedstock supply application from the wind side).',
    market_maturity: 'emerging',
    source_citation: 'IEA Global Hydrogen Review 2024; H2 Green Steel + Stegra project disclosures 2024',
  },
];

const NEW_PAIRS = [
  {
    label: 'Fixed-bottom offshore wind × utility-scale power generation',
    technology: 'fixed_bottom_offshore_wind',
    application: 'utility_scale_power_generation',
    horizon: 'H1',
    horizon_reasoning: 'Mature commercial — 30+ GW operating across NW Europe; multiple 1+ GW projects under construction (Doggerbank A/B/C, Hornsea 3, Norfolk Vanguard, Hollandse Kust West). Capital flowing under CfD frameworks; standardised offtake contracts; LCOE trajectory clear ~−3% YoY. H1 markers met: ≥3 commercial-scale deployments; FIDs operating; regulatory frameworks (CfD, Pot 3, OWA) in force; capital flowing.',
    confidence: 'high',
    confidence_reasoning: '4 evidence rows. IEA Offshore Wind Outlook 2024 (industry_body, high) — but cross-checked with government_data. UK DESNZ CfD round disclosures (government_data, high). ENTSO-E TYNDP 2024 (government_data, high). Ørsted Hornsea 2 operational disclosures (operator_disclosure, high — Ørsted is sole authoritative source for Hornsea operating data). Per v1.1: 2 government_data + Ørsted operator_disclosure (carve-out applies — Ørsted is sole authoritative source for project operating data) → 3 hard-evidence rows → high confidence solid.',
    trajectory: 'volatile',
    trajectory_reasoning: 'Strong long-term trajectory (capacity coming online, mandates locked) but UK AR5 cleared with zero offshore wind awards in 2023 (strike-price too low); inflation + capex pressure + supply-chain bottlenecks make near-term FID rate volatile. Trajectory volatile not weakening.',
    flag: false,
  },
  {
    label: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    technology: 'fixed_bottom_offshore_wind',
    application: 'corporate_ppa_power_offtake',
    horizon: 'H1',
    horizon_reasoning: 'Microsoft + Amazon + Google + Meta corporate offshore-wind PPAs at multi-GW scale 2022-2024 (Amazon 1.5 GW EU offshore, Microsoft 10+ GW total renewables including offshore, Meta long-tenor offshore PPAs in EU). Standardised contract structures emerging; long-tenor fixed-price commercial today. H1 markers: ≥3 commercial deployments; standardised contracts; capital flowing; corporate-PPA framework in force.',
    confidence: 'high',
    confidence_reasoning: '4 evidence rows including Microsoft + Amazon company_filing (Amazon AWS Sustainability disclosures, Microsoft 2024 Environmental Sustainability Report) and BNEF + RE100 industry_body. Per v1.1: 2 company_filing rows hard, 1 industry_body high, 1 operator_disclosure high (Ørsted PPA disclosures). 2 hard-evidence rows → high confidence.',
    trajectory: 'improving',
    trajectory_reasoning: 'Corporate PPA volume accelerating; new buyer entrants (datacenter operators, industrial scope-3 commitments); pricing structures stabilising.',
    flag: false,
  },
  {
    label: 'Floating offshore wind × utility-scale power generation',
    technology: 'floating_offshore_wind',
    application: 'utility_scale_power_generation',
    horizon: 'H2',
    horizon_reasoning: 'Hywind Tampen (Norway 2023, 88 MW) + Kincardine (Scotland 50 MW) + WindFloat Atlantic (Portugal 25 MW) operating at FOAK commercial scale; ScotWind cleared 14.5 GW floating zones in 2022 with FIDs targeted 2026-2030; CelticSea Round 5 (UK 4.5 GW); MarramWind (3 GW); Western Isles. H2 markers: FOAK operational; FIDs being considered 2026-2030; regulatory frameworks (CfD Pot 3 floating-specific allocation) in force; cost trajectory clear (~−8% YoY LCOE).',
    confidence: 'high',
    confidence_reasoning: '4 evidence rows. IEA Offshore Wind Outlook 2024 (industry_body, high). UK Crown Estate Scotland ScotWind (government_data, high). Equinor Hywind Tampen operator disclosures (operator_disclosure, high — Equinor is sole authoritative source). Ocean Winds WindFloat Atlantic (operator_disclosure, high). Per v1.1: 1 government_data + 2 operator_disclosure (both carve-out qualifying) → 3 hard-evidence rows → high confidence.',
    trajectory: 'improving',
    trajectory_reasoning: 'ScotWind clearing momentum + CelticSea Round 5 + EU 2030 floating targets + Norway state-backed Sørlige Nordsjø and Utsira Nord — strong forward FID pipeline.',
    flag: false,
  },
  {
    label: 'Fixed-bottom offshore wind × green hydrogen supply',
    technology: 'fixed_bottom_offshore_wind',
    application: 'green_hydrogen_supply',
    horizon: 'H2',
    horizon_reasoning: 'Holland Hydrogen 1 (Shell 200 MW PEM, Q4 2025 commissioning) sourced from offshore wind via PPA; Stegra/H2 Green Steel offshore-wind PPA structure; Lhyfe + Vattenfall + RWE + Ørsted offshore-wind-to-H2 pre-FID developments. Cost economics dependent on $20-40/MWh offshore wind power and electrolyser capex curve. H2 markers: FOAK at FID stage; 45V + EU Hydrogen Bank in force; subsidy support material.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. IEA Global Hydrogen Review 2024 (industry_body, high); Stegra/H2 Green Steel project disclosures (operator_disclosure, high — sole authoritative for project structure); Lhyfe project disclosures (operator_disclosure, medium). 1 hard-evidence under v1.1 (operator_disclosure on Stegra qualifies; H2 Green Steel publishes structured project data). Held at medium because the wind-to-H2 supply mechanic is still being de-risked at commercial scale; FOAK is mid-2025+.',
    trajectory: 'improving',
    trajectory_reasoning: 'Multiple FIDs in pipeline; cost-down on both wind and electrolyser sides; trajectory positive.',
    flag: false,
  },
  {
    label: 'Floating offshore wind × corporate PPA power offtake',
    technology: 'floating_offshore_wind',
    application: 'corporate_ppa_power_offtake',
    horizon: 'H3',
    horizon_reasoning: 'No commercial floating-specific corporate PPA at scale today; floating output blended with fixed-bottom in mixed-portfolio PPAs (Microsoft + Amazon EU offshore PPAs include some floating exposure post-2027). Floating-specific PPA pricing premium contested. H3 markers: technology demonstrated but corporate-PPA-specific application not at commercial scale; FOAK pre-2027; cost trajectory unclear at PPA-strike level vs CfD-strike level.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. BNEF Corporate Energy Market Outlook 2024 (industry_body, high); Equinor Hywind Tampen operator disclosures (operator_disclosure, high); Microsoft 2024 Environmental Sustainability Report (company_filing, high). 2 hard-evidence rows under v1.1 — could support high but held at medium because floating-specific corporate PPA volume is still small.',
    trajectory: 'improving',
    trajectory_reasoning: 'Floating LCOE trajectory closing gap to fixed-bottom; corporate PPA structures generalisable; expect first floating-specific corporate PPAs 2027-2028.',
    flag: false,
  },
  {
    label: 'Floating offshore wind × green hydrogen supply',
    technology: 'floating_offshore_wind',
    application: 'green_hydrogen_supply',
    horizon: 'H3',
    horizon_reasoning: 'Floating offshore wind paired with offshore electrolyser for green H2 — pre-FID at any scale; Lhyfe Sealhyfe pilot (1 MW offshore electrolyser on floating wind) operational 2022 as proof-of-concept; Hydeep (France) and SoutH2 (Spain) consortium concepts pre-FEED. Speculative beyond 2030 unless costs collapse. H3 markers: technology demonstrated but applications speculative; cost trajectory unclear; demand contingent on conditions not materialised (offshore-H2 supply chain economics, jurisdictional permitting).',
    confidence: 'low',
    confidence_reasoning: 'Only 2 evidence rows: IEA Global Hydrogen Review 2024 (industry_body, high) and Lhyfe Sealhyfe operator disclosures (operator_disclosure, medium). No government_data, no peer-reviewed analysis on floating-wind-plus-offshore-electrolyser economics. Insufficient evidence diversity for medium confidence.',
    trajectory: 'improving',
    trajectory_reasoning: 'Concept proofs under way (Sealhyfe operational); commercial-scale FIDs structurally beyond 2030.',
    flag: true,
    flag_reason: 'low confidence: only operator_disclosure and industry_body evidence on floating-wind-plus-offshore-H2 intersection. Re-run Step 2 with EU JRC Offshore Renewable Energy Strategy economics or Crown Estate offshore-H2 study when published.',
  },
];

const NEW_EVIDENCE = [
  // fixed_bottom × utility_scale (4)
  { pair: 'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'industry_body', strength: 'high', supports: 'H1',
    text: 'IEA Offshore Wind Outlook 2024: 75 GW operating globally end-2024; 30+ GW NW Europe; LCOE trajectory ~−3% YoY weighted-average; 230 GW announced 2030 capacity.',
    citation: 'IEA Offshore Wind Outlook 2024',
    url: 'https://www.iea.org/reports/renewables-2024',
    publication_date: '2024-10-01' },
  { pair: 'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'government_data', strength: 'high', supports: 'H1',
    text: 'UK DESNZ CfD AR6 results 2024: offshore wind cleared 4.9 GW at strike prices £58.87/MWh (2012 prices) for fixed-bottom — recovery from AR5 (zero offshore wind cleared at £37.35/MWh inflation-adjusted strike). Pot 3 separate floating-specific allocation.',
    citation: 'UK DESNZ CfD allocation rounds 2024',
    url: 'https://www.gov.uk/government/publications/contracts-for-difference-cfd-allocation-round-6-results',
    publication_date: '2024-09-01' },
  { pair: 'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'government_data', strength: 'high', supports: 'H1',
    text: 'ENTSO-E TYNDP 2024: NW Europe offshore wind connected capacity 32 GW end-2024; 60+ GW connection requests 2030; grid integration constraint binding in some zones.',
    citation: 'ENTSO-E TYNDP 2024',
    url: 'https://tyndp.entsoe.eu/',
    publication_date: '2024-11-01' },
  { pair: 'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'operator_disclosure', strength: 'high', supports: 'H1',
    text: 'Ørsted Hornsea 2 operational since 2022 at 1.32 GW; world\'s largest at the time; Hornsea 3 under construction at 2.85 GW. Operator is sole authoritative source for Hornsea operating capacity factor and asset performance.',
    citation: 'Ørsted Hornsea operational disclosures 2024',
    url: 'https://orsted.com/en/our-business/offshore-wind/our-offshore-wind-farms',
    publication_date: '2024-09-01' },

  // fixed_bottom × corporate_ppa (4)
  { pair: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    type: 'industry_body', strength: 'high', supports: 'H1',
    text: 'BNEF Corporate Energy Market Outlook 2024: 36 GW corporate PPA contracted globally 2023; offshore wind share growing in EU corporate PPA pipeline; tenor 15-25 years.',
    citation: 'BNEF Corporate Energy Market Outlook 2024',
    url: 'https://about.bnef.com/blog/corporate-clean-power-buying-grew-by-a-third-in-2023-to-46gw/',
    publication_date: '2024-02-01' },
  { pair: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    type: 'company_filing', strength: 'high', supports: 'H1',
    text: 'Amazon 2024 Sustainability Report: contracted ~1.5 GW EU offshore wind across multiple projects; long-tenor fixed-price PPAs; reported in audited corporate sustainability filings.',
    citation: 'Amazon 2024 Sustainability Report',
    url: 'https://sustainability.aboutamazon.com/',
    publication_date: '2024-07-01' },
  { pair: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    type: 'company_filing', strength: 'high', supports: 'H1',
    text: 'Microsoft 2024 Environmental Sustainability Report: contracted 19.8 GW total renewables PPAs globally including substantial offshore wind in EU + US; structured fixed-price contracts; audited disclosures.',
    citation: 'Microsoft 2024 Environmental Sustainability Report',
    url: 'https://www.microsoft.com/en-us/corporate-responsibility/sustainability/report',
    publication_date: '2024-05-01' },
  { pair: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    type: 'operator_disclosure', strength: 'high', supports: 'H1',
    text: 'Ørsted corporate PPA disclosures: AWS, Google, Meta multi-GW PPAs anchored on UK + Dutch offshore wind portfolio; 15+ year tenor structures.',
    citation: 'Ørsted corporate PPA disclosures 2024',
    url: 'https://orsted.com/en/insights/news',
    publication_date: '2024-08-01' },

  // floating × utility_scale (4)
  { pair: 'Floating offshore wind × utility-scale power generation',
    type: 'industry_body', strength: 'high', supports: 'H2',
    text: 'IEA Offshore Wind Outlook 2024: floating capacity 250 MW operating globally 2024; 30+ GW announced 2030; LCOE trajectory ~−8% YoY closing gap to fixed-bottom.',
    citation: 'IEA Offshore Wind Outlook 2024',
    url: 'https://www.iea.org/reports/renewables-2024',
    publication_date: '2024-10-01' },
  { pair: 'Floating offshore wind × utility-scale power generation',
    type: 'government_data', strength: 'high', supports: 'H2',
    text: 'UK Crown Estate Scotland ScotWind: 14.5 GW floating allocation 2022 across 17 projects; cumulative seabed leases for 2026-2030 FIDs; supply-chain commitments structured into lease terms.',
    citation: 'Crown Estate Scotland ScotWind awards 2022 (status update 2024)',
    url: 'https://www.crownestatescotland.com/our-projects/scotwind',
    publication_date: '2024-06-01' },
  { pair: 'Floating offshore wind × utility-scale power generation',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'Equinor Hywind Tampen: 88 MW operational since 2023 supplying Snorre + Gullfaks platforms; world\'s largest floating wind farm. Equinor is sole authoritative source for project operating data, capacity factor, and substructure performance.',
    citation: 'Equinor Hywind Tampen operator disclosures 2024',
    url: 'https://www.equinor.com/energy/hywind-tampen',
    publication_date: '2024-08-01' },
  { pair: 'Floating offshore wind × utility-scale power generation',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'Ocean Winds WindFloat Atlantic (Portugal): 25 MW operational since 2020; first commercial-scale floating in continental Europe; semi-submersible substructure design.',
    citation: 'Ocean Winds WindFloat Atlantic operator disclosures 2024',
    url: 'https://www.oceanwinds.com/projects/windfloat-atlantic/',
    publication_date: '2024-04-01' },

  // fixed_bottom × green_h2 (3)
  { pair: 'Fixed-bottom offshore wind × green hydrogen supply',
    type: 'industry_body', strength: 'high', supports: 'H2',
    text: 'IEA Global Hydrogen Review 2024: offshore-wind-fed green H2 production 0.1 Mt/yr 2024 (early); 5+ Mt/yr announced 2030; PPA structures bridging wind LCOE and electrolyser capex into delivered H2 cost.',
    citation: 'IEA Global Hydrogen Review 2024',
    url: 'https://www.iea.org/reports/global-hydrogen-review-2024',
    publication_date: '2024-10-01' },
  { pair: 'Fixed-bottom offshore wind × green hydrogen supply',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'Stegra (formerly H2 Green Steel) Boden Sweden: 800 MW PEM+alkaline electrolyser PPA-anchored on dedicated wind capacity; FID 2023; commissioning 2026. Operator publishes structured PPA + capex disclosures via investor materials.',
    citation: 'Stegra (H2 Green Steel) project disclosures 2024',
    url: 'https://www.stegra.com/news',
    publication_date: '2024-05-01' },
  { pair: 'Fixed-bottom offshore wind × green hydrogen supply',
    type: 'operator_disclosure', strength: 'medium', supports: 'H2',
    text: 'Lhyfe Bouin France: 5 MW PEM electrolyser supplied from onshore wind PPA — operational 2022 as proof-of-concept for wind-electrolyser direct PPA model that scales to offshore.',
    citation: 'Lhyfe project disclosures 2024',
    url: 'https://www.lhyfe.com/news/',
    publication_date: '2024-07-01' },

  // floating × corporate_ppa (3)
  { pair: 'Floating offshore wind × corporate PPA power offtake',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'BNEF Corporate Energy Market Outlook 2024: floating-specific corporate PPA market not yet emerged at scale; mixed-portfolio PPAs include some floating exposure post-2027.',
    citation: 'BNEF Corporate Energy Market Outlook 2024',
    url: 'https://about.bnef.com/blog/corporate-clean-power-buying-grew-by-a-third-in-2023-to-46gw/',
    publication_date: '2024-02-01' },
  { pair: 'Floating offshore wind × corporate PPA power offtake',
    type: 'operator_disclosure', strength: 'high', supports: 'H3',
    text: 'Equinor Hywind Tampen: output partially supplied to Equinor own platforms (effectively a captive PPA); commercial third-party floating PPA structures pre-2027.',
    citation: 'Equinor Hywind Tampen operator disclosures 2024',
    url: 'https://www.equinor.com/energy/hywind-tampen',
    publication_date: '2024-08-01' },
  { pair: 'Floating offshore wind × corporate PPA power offtake',
    type: 'company_filing', strength: 'high', supports: 'H3',
    text: 'Microsoft 2024 Environmental Sustainability Report: long-tenor offshore-wind PPAs include partial floating exposure post-2027 in mixed-portfolio structures.',
    citation: 'Microsoft 2024 Environmental Sustainability Report',
    url: 'https://www.microsoft.com/en-us/corporate-responsibility/sustainability/report',
    publication_date: '2024-05-01' },

  // floating × green_h2 (2)
  { pair: 'Floating offshore wind × green hydrogen supply',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IEA Global Hydrogen Review 2024: floating-wind-plus-offshore-electrolyser concepts pre-FID globally; Lhyfe Sealhyfe + Hydeep + SoutH2 consortium pre-FEED; speculative commercial scale beyond 2030.',
    citation: 'IEA Global Hydrogen Review 2024',
    url: 'https://www.iea.org/reports/global-hydrogen-review-2024',
    publication_date: '2024-10-01' },
  { pair: 'Floating offshore wind × green hydrogen supply',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'Lhyfe Sealhyfe pilot: 1 MW offshore electrolyser on floating wind substructure operational 2022 — first proof-of-concept; commercial-scale FIDs not yet announced.',
    citation: 'Lhyfe Sealhyfe project disclosures 2024',
    url: 'https://www.lhyfe.com/news/',
    publication_date: '2024-04-01' },
];

const NEW_ADJACENCIES = [
  // fixed_bottom × utility_scale (3)
  { from: 'Fixed-bottom offshore wind × utility-scale power generation',
    to:   'Fixed-bottom offshore wind × corporate PPA power offtake',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same fixed-bottom offshore wind generation; revenue mix (CfD/wholesale vs corporate PPA) differs but the asset is shared. Many projects bundle both revenue streams.' },
  { from: 'Fixed-bottom offshore wind × utility-scale power generation',
    to:   'Floating offshore wind × utility-scale power generation',
    type: 'predecessor_successor', strength: 'strong',
    reason: 'Fixed-bottom is the H1 base; floating succeeds in deeper-water siting where fixed-bottom is uneconomic. Successor will absorb >60m-depth zones from 2027-2030.' },
  { from: 'Fixed-bottom offshore wind × utility-scale power generation',
    to:   'Fixed-bottom offshore wind × green hydrogen supply',
    type: 'same_technology_different_application', strength: 'moderate',
    reason: 'Same generation tech; H2 supply application diverts capacity from grid-connected wholesale to dedicated electrolyser PPA.' },

  // fixed_bottom × corporate_ppa (2)
  { from: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    to:   'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Mirror of above.' },
  { from: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    to:   'Floating offshore wind × corporate PPA power offtake',
    type: 'predecessor_successor', strength: 'moderate',
    reason: 'Fixed-bottom corporate PPA is H1 incumbent; floating corporate PPA is H3 successor when floating-specific PPA pricing matures.' },

  // floating × utility_scale (3)
  { from: 'Floating offshore wind × utility-scale power generation',
    to:   'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'predecessor_successor', strength: 'strong',
    reason: 'Mirror of above — floating is the H2 successor in deeper-water siting.' },
  { from: 'Floating offshore wind × utility-scale power generation',
    to:   'Floating offshore wind × corporate PPA power offtake',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same floating technology; revenue mix differs.' },
  { from: 'Floating offshore wind × utility-scale power generation',
    to:   'Floating offshore wind × green hydrogen supply',
    type: 'same_technology_different_application', strength: 'moderate',
    reason: 'Same floating technology; H2 supply via dedicated electrolyser PPA.' },

  // fixed_bottom × green_h2 (3)
  { from: 'Fixed-bottom offshore wind × green hydrogen supply',
    to:   'Fixed-bottom offshore wind × utility-scale power generation',
    type: 'same_technology_different_application', strength: 'moderate',
    reason: 'Mirror of above.' },
  { from: 'Fixed-bottom offshore wind × green hydrogen supply',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'complement', strength: 'strong',
    reason: 'Cross-client cross-pair complement: fixed-bottom offshore wind feeds dedicated PPA capacity to PEM electrolysers serving hard-to-abate industrial H2 demand. Pairs are complementary nodes in same supply chain — Vattenfall offshore wind supplies the electricity, PEM electrolyser converts to H2, demand-side application pulls the H2.' },
  { from: 'Fixed-bottom offshore wind × green hydrogen supply',
    to:   'Floating offshore wind × green hydrogen supply',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Same green H2 supply application; floating substructure variant.' },

  // floating × corporate_ppa (2)
  { from: 'Floating offshore wind × corporate PPA power offtake',
    to:   'Floating offshore wind × utility-scale power generation',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Mirror of above.' },
  { from: 'Floating offshore wind × corporate PPA power offtake',
    to:   'Fixed-bottom offshore wind × corporate PPA power offtake',
    type: 'predecessor_successor', strength: 'moderate',
    reason: 'Mirror of above.' },

  // floating × green_h2 (2)
  { from: 'Floating offshore wind × green hydrogen supply',
    to:   'Fixed-bottom offshore wind × green hydrogen supply',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Mirror of above.' },
  { from: 'Floating offshore wind × green hydrogen supply',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'complement', strength: 'weak',
    reason: 'Cross-client complement: floating offshore wind as upstream supply to electrolyser-driven H2 demand. Weak because floating-to-H2 supply chain is pre-FID at scale.' },
];

// Component links — including cross-client to PEM electrolysis × hard_to_abate
const COMPONENT_LINKS = [
  // OFFSHORE_WIND_TURBINE_PLATFORM (tech)
  { component: 'OFFSHORE_WIND_TURBINE_PLATFORM',
    pair: 'Fixed-bottom offshore wind × utility-scale power generation',
    role: 'primary',
    reason: 'Vattenfall Hollandse Kust Zuid 1.5 GW operational with 11 MW Siemens Gamesa turbines on monopile — primary instance of fixed-bottom offshore wind for utility-scale power generation.' },
  { component: 'OFFSHORE_WIND_TURBINE_PLATFORM',
    pair: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    role: 'primary',
    reason: 'Hollandse Kust Zuid contracted to corporate offtakers (BASF, Allianz partial PPAs); primary anchor for corporate PPA application of fixed-bottom.' },
  { component: 'OFFSHORE_WIND_TURBINE_PLATFORM',
    pair: 'Floating offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'Vattenfall floating exploratory under ScotWind allocation; pre-FID. Component anchors the technology platform but Vattenfall is not yet a primary floating operator.' },
  { component: 'OFFSHORE_WIND_TURBINE_PLATFORM',
    pair: 'Fixed-bottom offshore wind × green hydrogen supply',
    role: 'secondary',
    reason: 'Vattenfall + Lhyfe + Stegra exploratory wind-to-H2 PPA structures; secondary anchor as Vattenfall investigates green H2 supply path for portfolio.' },

  // UK_AR6_AR7_CFD_FRAMEWORK (regulation)
  { component: 'UK_AR6_AR7_CFD_FRAMEWORK',
    pair: 'Fixed-bottom offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'UK CfD AR6 cleared 4.9 GW fixed-bottom offshore wind 2024 — directly gates UK fixed-bottom utility-scale economics. Vattenfall Norfolk projects under AR6 and AR7 framework.' },
  { component: 'UK_AR6_AR7_CFD_FRAMEWORK',
    pair: 'Floating offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'CfD Pot 3 dedicated floating allocation (AR5 + AR6) governs UK floating economics; Vattenfall ScotWind sites depend on Pot 3 strike pricing.' },

  // EU_NSEC_OFFSHORE_GRID (ecosystem)
  { component: 'EU_NSEC_OFFSHORE_GRID',
    pair: 'Fixed-bottom offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'NSEC + ENTSO-E offshore grid coordination is the principal ecosystem enabler for utility-scale offshore wind in NW Europe; offshore connection capacity gates project FIDs.' },
  { component: 'EU_NSEC_OFFSHORE_GRID',
    pair: 'Floating offshore wind × utility-scale power generation',
    role: 'secondary',
    reason: 'Floating offshore grid integration (HVDC, hybrid asset) is part of the same NSEC + TYNDP framework; ecosystem-level enabler.' },
  { component: 'EU_NSEC_OFFSHORE_GRID',
    pair: 'Fixed-bottom offshore wind × green hydrogen supply',
    role: 'secondary',
    reason: 'Offshore grid + offshore-H2 corridor planning bundled in EU Offshore Renewable Energy Strategy; ecosystem enabler.' },

  // CORPORATE_PPA_OFFTAKE_DEMAND (market) — includes cross-client link
  { component: 'CORPORATE_PPA_OFFTAKE_DEMAND',
    pair: 'Fixed-bottom offshore wind × corporate PPA power offtake',
    role: 'primary',
    reason: 'Corporate PPA market component IS the demand application; primary anchor.' },
  { component: 'CORPORATE_PPA_OFFTAKE_DEMAND',
    pair: 'Floating offshore wind × corporate PPA power offtake',
    role: 'primary',
    reason: 'Same primary anchor for the floating variant.' },
  { component: 'CORPORATE_PPA_OFFTAKE_DEMAND',
    pair: 'Fixed-bottom offshore wind × green hydrogen supply',
    role: 'exposure_only',
    reason: 'Corporate PPA market exposed to wind-to-H2 PPAs — alternative to wholesale corporate PPA structures.' },
  { component: 'CORPORATE_PPA_OFFTAKE_DEMAND',
    pair: 'PEM electrolysis × hard-to-abate industrial H2 demand',
    role: 'exposure_only',
    reason: 'Cross-client overlap: corporate PPAs to electrolysers feeding hard-to-abate industrial H2 demand are a parallel pathway to direct corporate power PPAs. Vattenfall corporate PPA market exposure includes the H2-mediated route. This pair was created during Shell blue H2 ontology run; cross-client overlap working as designed.' },
];

// ============================================================================
// Execution
// ============================================================================
try {
  await client.query('BEGIN');

  // Part A: create Vattenfall company + initiative + components
  console.log('\n=== Part A: Vattenfall company + initiative + components ===');
  const cr = await client.query(`
    INSERT INTO companies (name, sector, notes)
    VALUES ('Vattenfall AB', 'energy', 'Swedish state-owned utility — major NW European offshore wind operator (Hollandse Kust, Norfolk, Nordlicht). Created 2026-05-04 ontology run 3.')
    ON CONFLICT (name) DO UPDATE SET notes = EXCLUDED.notes
    RETURNING id
  `);
  const vatId = cr.rows[0].id;
  console.log(`  Vattenfall AB id=${vatId}`);

  const ir = await client.query(`
    INSERT INTO initiatives_v2 (company_id, name, strategy_context, brief_description,
      hypothesis_statement, why_it_matters, horizon, persona, time_horizon_year,
      baseline_confidence, current_confidence, draft_status, state, trajectory)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,'draft_unreviewed','holding','volatile')
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [vatId, VATTENFALL_INITIATIVE.name, VATTENFALL_INITIATIVE.strategy_context,
      VATTENFALL_INITIATIVE.brief_description, VATTENFALL_INITIATIVE.hypothesis_statement,
      VATTENFALL_INITIATIVE.why_it_matters, VATTENFALL_INITIATIVE.horizon,
      VATTENFALL_INITIATIVE.persona, VATTENFALL_INITIATIVE.time_horizon_year,
      VATTENFALL_INITIATIVE.baseline_confidence]);
  let initId;
  if (ir.rows[0]) {
    initId = ir.rows[0].id;
  } else {
    const r = await client.query(`SELECT id FROM initiatives_v2 WHERE company_id=$1 AND name=$2`, [vatId, VATTENFALL_INITIATIVE.name]);
    initId = r.rows[0].id;
  }
  console.log(`  Vattenfall offshore wind initiative id=${initId}`);

  const compIds = {};
  for (const cdef of VATTENFALL_COMPONENTS) {
    const r = await client.query(`
      INSERT INTO components (initiative_id, name, description, component_type, vector,
        cross_industry, source_citation, draft_status, state, trajectory)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'draft_unreviewed',$8,$9)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [initId, cdef.name, cdef.description, cdef.component_type, cdef.vector,
        cdef.cross_industry, cdef.source_citation, cdef.state, cdef.trajectory]);
    if (r.rows[0]) {
      compIds[cdef.name] = r.rows[0].id;
    } else {
      const r2 = await client.query(`SELECT id FROM components WHERE initiative_id=$1 AND name=$2`, [initId, cdef.name]);
      compIds[cdef.name] = r2.rows[0].id;
    }
  }
  console.log(`  4 Vattenfall components created/looked up: ${Object.entries(compIds).map(([k,v]) => `${k}=${v}`).join(', ')}`);

  // Part B: ontology population
  console.log('\n=== Part B: ontology population ===');

  const techIds = {};
  for (const t of NEW_TECHNOLOGIES) {
    const r = await client.query(`
      INSERT INTO technologies (technology_name, technology_label, tech_function_id, description,
        current_trl, trl_as_of_date, cost_trajectory_pct_yoy, cost_trajectory_unit, substitution_risk, source_citation)
      VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (technology_name) DO UPDATE SET
        technology_label = EXCLUDED.technology_label,
        description = EXCLUDED.description,
        current_trl = EXCLUDED.current_trl,
        trl_as_of_date = EXCLUDED.trl_as_of_date,
        cost_trajectory_pct_yoy = EXCLUDED.cost_trajectory_pct_yoy,
        cost_trajectory_unit = EXCLUDED.cost_trajectory_unit,
        substitution_risk = EXCLUDED.substitution_risk,
        source_citation = EXCLUDED.source_citation,
        last_updated_at = NOW()
      RETURNING id
    `, [t.name, t.label, t.description, t.current_trl, t.trl_as_of_date, t.cost_trajectory_pct_yoy,
        t.cost_trajectory_unit, t.substitution_risk, t.source_citation]);
    techIds[t.name] = r.rows[0].id;
  }
  console.log(`  technologies (new): ${NEW_TECHNOLOGIES.length}`);

  const appIds = {};
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

  // Look up existing cross-client target pair
  const r = await client.query(`SELECT id FROM technology_application_pairs WHERE pair_label = $1`,
    ['PEM electrolysis × hard-to-abate industrial H2 demand']);
  if (!r.rows[0]) throw new Error('Existing cross-client pair not found: PEM electrolysis × hard-to-abate industrial H2 demand');
  pairIds['PEM electrolysis × hard-to-abate industrial H2 demand'] = r.rows[0].id;

  const newPairIds = NEW_PAIRS.map(p => pairIds[p.label]);
  await client.query(`DELETE FROM pair_evidence WHERE pair_id = ANY($1::int[])`, [newPairIds]);
  for (const e of NEW_EVIDENCE) {
    await client.query(`
      INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text,
        source_citation, source_url, publication_date, supports_horizon, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [pairIds[e.pair], e.type, e.strength, e.text, e.citation, e.url ?? null,
        e.publication_date ?? null, e.supports ?? null, '015_vattenfall_offshore_wind_ontology']);
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
    `, [compIds[l.component], pairIds[l.pair], l.role, l.reason, '015_vattenfall_offshore_wind_ontology']);
  }
  console.log(`  component_pair_links: ${COMPONENT_LINKS.length} (across ${compIdList.length} components)`);

  // Self-marking
  console.log('\n=== Self-marking output (Vattenfall) ===');
  const r2 = await client.query(`
    SELECT confidence_band, COUNT(*) AS n FROM technology_application_pairs WHERE id = ANY($1::int[])
    GROUP BY confidence_band ORDER BY confidence_band
  `, [newPairIds]);
  console.log(`  confidence distribution:`); for (const row of r2.rows) console.log(`    ${row.confidence_band}: ${row.n}`);
  const r3 = await client.query(`
    SELECT pair_label, flag_reason FROM technology_application_pairs WHERE id = ANY($1::int[]) AND is_flagged_for_review = TRUE
  `, [newPairIds]);
  console.log(`  flagged for review: ${r3.rows.length}`);
  for (const row of r3.rows) console.log(`    - ${row.pair_label} :: ${row.flag_reason}`);
  const r4 = await client.query(`
    SELECT COUNT(DISTINCT cpl.component_id) AS linked
    FROM component_pair_links cpl WHERE cpl.component_id = ANY($1::int[])
  `, [compIdList]);
  console.log(`  components linked: ${r4.rows[0].linked} / 4 components in Vattenfall initiative`);

  // Cross-client query
  const r6 = await client.query(`
    SELECT tap.pair_label, COUNT(DISTINCT co.id) AS clients_touching, ARRAY_AGG(DISTINCT co.name ORDER BY co.name) AS companies
    FROM technology_application_pairs tap
    JOIN component_pair_links cpl ON cpl.pair_id = tap.id
    JOIN components c ON c.id = cpl.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN companies co ON co.id = i.company_id
    GROUP BY tap.id, tap.pair_label
    HAVING COUNT(DISTINCT co.id) >= 2
    ORDER BY clients_touching DESC, tap.pair_label
  `);
  console.log(`\n  CROSS-CLIENT pairs (touched by >=2 distinct companies): ${r6.rows.length}`);
  for (const row of r6.rows) console.log(`    ${row.clients_touching} (${row.companies.join(' + ')}) -- ${row.pair_label}`);

  // Evidence quality (high-evidence test)
  const r7 = await client.query(`
    SELECT tap.pair_label, tap.confidence_band,
           COUNT(pe.id) AS evidence_count,
           COUNT(pe.id) FILTER (WHERE pe.evidence_type IN ('peer_reviewed','company_filing','government_data')) AS strict_hard,
           COUNT(pe.id) FILTER (WHERE pe.evidence_type IN ('peer_reviewed','company_filing','government_data','operator_disclosure') AND pe.evidence_strength = 'high') AS v11_hard
    FROM technology_application_pairs tap
    LEFT JOIN pair_evidence pe ON pe.pair_id = tap.id
    WHERE tap.id = ANY($1::int[])
    GROUP BY tap.id, tap.pair_label, tap.confidence_band
    ORDER BY tap.confidence_band, tap.pair_label
  `, [newPairIds]);
  console.log(`\n  evidence quality (Vattenfall — high-evidence test):`);
  for (const row of r7.rows) console.log(`    ${row.confidence_band} | strict_hard=${row.strict_hard}, v11_hard=${row.v11_hard} -- ${row.pair_label}`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — Vattenfall offshore wind ontology persisted');
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
