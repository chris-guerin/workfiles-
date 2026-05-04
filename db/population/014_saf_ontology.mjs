#!/usr/bin/env node
// 014_saf_ontology.mjs — populates ontology for Shell's SAF portfolio
// initiative (initiative_id=9).
//
// Per /docs/methodology/ontology_population_procedure.md v1.1.
//
// Fresh domain — aviation. No CCUS pair reuse expected (different
// physical pathways). Decision recorded: Book & Claim sits in
// application_domain='cross_domain' because the certificate market
// spans transport (aviation supply), financial (tradable instrument),
// and voluntary corporate sustainability accounting. Discussed in
// methodology gap section of the run report.
//
// New technologies: 4 (hefa_hydroprocessing, atj_fermentation,
//   ft_synthetic_paraffinic_kerosene, power_to_liquid).
// New applications: 3 (eu_saf_mandate_compliance,
//   voluntary_saf_offtake, book_and_claim_saf_market).
// New pairs: 8.
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
console.log(`=== Population — Shell SAF ontology ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// ============================================================================
// New technologies — 4
// ============================================================================
const NEW_TECHNOLOGIES = [
  {
    name: 'hefa_hydroprocessing',
    label: 'HEFA hydroprocessing (waste oils to SAF)',
    tech_function: 'saf_blending_and_co_processing',
    description: 'Hydroprocessed Esters and Fatty Acids — hydrogenation, deoxygenation and isomerisation of bio-oils (UCO, tallow, palm fatty acid distillate, vegetable oils) to drop-in paraffinic kerosene meeting ASTM D7566 Annex A2. Mature commercial — Neste >1.5 Mtpa global capacity, World Energy, Montana Renewables, BP Cherry Point, Phillips 66, Diamond Green Diesel SAF retrofit.',
    current_trl: 9,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -2,
    cost_trajectory_unit: 'pct_per_year_capex',
    substitution_risk: 'emerging',
    source_citation: 'Neste capital markets day 2024; ICAO CORSIA HEFA pathway documentation',
  },
  {
    name: 'atj_fermentation',
    label: 'Alcohol-to-Jet fermentation pathway',
    tech_function: 'saf_blending_and_co_processing',
    description: 'Fermentation of sugars or syngas to ethanol or isobutanol, followed by dehydration, oligomerisation and hydrogenation to paraffinic jet fuel (ASTM D7566 Annex A5). LanzaJet Freedom Pines (Georgia, 38 Mlpa) commissioning 2024 as FOAK; Gevo Net-Zero 1 (South Dakota) at FID; Honeywell UOP licensee programme. TRL 7-8 — FOAK commercial scale-up underway.',
    current_trl: 8,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -8,
    cost_trajectory_unit: 'pct_per_year_capex',
    substitution_risk: 'none',
    source_citation: 'LanzaJet operator disclosures 2024; Gevo IR 2024; ICAO CORSIA ATJ pathway documentation',
  },
  {
    name: 'ft_synthetic_paraffinic_kerosene',
    label: 'Fischer-Tropsch synthetic paraffinic kerosene',
    tech_function: 'saf_blending_and_co_processing',
    description: 'Fischer-Tropsch synthesis of paraffinic kerosene from biomass-derived syngas (BtL) or waste-derived syngas (gasification + FT). Velocys Bayou Fuels (Mississippi, pre-construction); Fulcrum Sierra plant (mothballed 2024); SkyNRG / KLM partnerships. TRL 7 with FOAK commercial pre-FID at scale; cost premium material vs HEFA.',
    current_trl: 7,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -5,
    cost_trajectory_unit: 'pct_per_year_capex',
    substitution_risk: 'none',
    source_citation: 'Velocys Bayou Fuels operator disclosures 2024; ICAO CORSIA FT-SPK pathway documentation',
  },
  {
    name: 'power_to_liquid',
    label: 'Power-to-liquid synthetic SAF',
    tech_function: 'saf_blending_and_co_processing',
    description: 'Green H2 (PEM/alkaline electrolysis) + captured CO2 (DAC or point-source) combined via Fischer-Tropsch or methanol-to-jet routes to synthetic paraffinic kerosene. Atmosfair PtL (Werlte Germany, ~1 ktpa); Norsk e-Fuel (Norway, FID pending); Synhelion (Switzerland, solar-thermal route, pilot). TRL 5-7. Highest cost premium of any SAF pathway today; PtL sub-mandate in EU ReFuelEU 0.7% by 2030 makes it a binding mandate component.',
    current_trl: 6,
    trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -10,
    cost_trajectory_unit: 'pct_per_year_capex',
    substitution_risk: 'none',
    source_citation: 'IEA Renewables 2024 SAF chapter; Atmosfair PtL operator disclosures 2024',
  },
];

// ============================================================================
// New applications — 3 (note Book & Claim domain decision)
// ============================================================================
const NEW_APPLICATIONS = [
  {
    name: 'eu_saf_mandate_compliance',
    label: 'EU SAF mandate compliance (ReFuelEU Aviation)',
    domain: 'transport',
    description: 'Supply of SAF to meet EU ReFuelEU Aviation Regulation (EU) 2023/2405 obligations: 2% blend 2025, 6% 2030, 20% 2035, 70% 2050; with sub-mandate 0.7% PtL by 2030, 1.2% by 2032. Demand structurally legally mandated; pricing pass-through to airlines codified. Distinct application from voluntary_saf_offtake because the demand mechanic differs entirely.',
    market_maturity: 'emerging',
    source_citation: 'Regulation (EU) 2023/2405 (ReFuelEU Aviation); EU JRC SAF Outlook 2024',
  },
  {
    name: 'voluntary_saf_offtake',
    label: 'Voluntary SAF offtake (airline programs, corporate)',
    domain: 'transport',
    description: 'Voluntary SAF purchases by airlines, freight operators and corporate travellers above mandate floors. JetBlue + KLM + United + Lufthansa Group voluntary blending programs; Microsoft Sky NRG corporate SAF certificate purchases; airline JFK SAF dispensing pilots. Demand contingent on corporate ESG commitments and airline brand differentiation rather than regulatory mandate.',
    market_maturity: 'growing',
    source_citation: 'IATA SAF tracker 2024; Sky NRG corporate disclosures 2024',
  },
  {
    name: 'book_and_claim_saf_market',
    label: 'Book & Claim SAF certificate market',
    domain: 'cross_domain',
    description: 'Tradable certificate market that decouples the physical SAF molecule (delivered at one airport) from the GHG-reduction claim (purchased by a customer flying from a different airport). Settles environmental attributes via registry (RSB, ISCC, Sky NRG). Bridges aviation transport supply with financial-instrument trading and voluntary corporate sustainability accounting. application_domain=cross_domain because the market spans transport (aviation supply), financial (tradable certificate), and built_environment-adjacent (Scope 3 corporate emissions reporting); no single existing domain captures it cleanly. Considered: financial (close fit but understates the underlying physical-fuel anchor); transport (close fit but misses the financial-instrument character). cross_domain is the honest call.',
    market_maturity: 'emerging',
    source_citation: 'RSB Book & Claim guidance 2024; ICAO CORSIA Book & Claim assessment 2023',
  },
];

// ============================================================================
// New pairs — 8
// ============================================================================
const NEW_PAIRS = [
  {
    label: 'HEFA hydroprocessing × EU SAF mandate compliance',
    technology: 'hefa_hydroprocessing',
    application: 'eu_saf_mandate_compliance',
    horizon: 'H1',
    horizon_reasoning: 'Mature commercial — Neste 1.5+ Mtpa, BP Cherry Point, Montana Renewables, Diamond Green Diesel SAF retrofit, Phillips 66 Rodeo all operating at scale today. EU 2025 2% mandate met primarily by HEFA. Capital flowing without subsidy gating (operates within mandate-driven pricing). H1 markers met: ≥3 commercial-scale deployments; FIDs operating; mandate framework in force; standardised contracts.',
    confidence: 'high',
    confidence_reasoning: '4 evidence rows. Neste capital markets day 2024 (company_filing, high) — operator is a publicly listed company with audited disclosures. EU JRC SAF Outlook 2024 (government_data, high). IATA SAF tracker 2024 (industry_body, high). ICAO CORSIA HEFA pathway documentation (government_data, high). Per v1.1 hard-evidence rule: 3 hard-evidence rows (Neste filing + 2 government_data) → high confidence valid.',
    trajectory: 'improving',
    trajectory_reasoning: 'Capacity coming online accelerating; Neste capacity expansions; new HEFA retrofits at major refining sites in EU and US; mandate trajectory locked-in through 2030.',
    flag: false,
  },
  {
    label: 'HEFA hydroprocessing × voluntary SAF offtake',
    technology: 'hefa_hydroprocessing',
    application: 'voluntary_saf_offtake',
    horizon: 'H1',
    horizon_reasoning: 'Voluntary HEFA offtake at airline programs operating since ~2016 (KLM, United, JetBlue) at small commercial scale; Microsoft Sky NRG corporate certificate purchases since 2020. H1 markers: commercial deployments at scale; standardised offtake structures; capital flowing.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. IATA SAF tracker 2024 (industry_body, high); Sky NRG corporate disclosures 2024 (operator_disclosure, medium); JetBlue voluntary blending program disclosures (operator_disclosure, medium). Only 1 hard-evidence row (IATA is industry_body) — per v1.1 the operator_disclosure rows count as hard-evidence only when operator is sole authoritative source. JetBlue and Sky NRG are sole authoritative sources for their own program data, so per v1.1 carve-out 3 hard-evidence rows; held at medium because the IATA aggregation contests some operator self-reported volumes.',
    trajectory: 'holding',
    trajectory_reasoning: 'Voluntary offtake growing modestly but mandate pressure post-2025 may absorb most HEFA supply, squeezing voluntary availability.',
    flag: false,
  },
  {
    label: 'ATJ fermentation × EU SAF mandate compliance',
    technology: 'atj_fermentation',
    application: 'eu_saf_mandate_compliance',
    horizon: 'H2',
    horizon_reasoning: 'LanzaJet Freedom Pines FOAK commissioning 2024 (38 Mlpa); Gevo Net-Zero 1 at FID; FOAK commercial scale-up underway with European mandate as anchor demand. ATJ qualifies under EU mandate as "advanced biofuel" non-HEFA pathway. H2 markers: FOAK operational; FIDs being considered 2026-2030; subsidy material (45Z, EU sub-mandate framework).',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. LanzaJet operator disclosures (operator_disclosure, high — sole authoritative source for Freedom Pines operating data); Gevo IR (company_filing, high); ICAO CORSIA ATJ pathway documentation (government_data, high). 3 hard-evidence rows under v1.1 → could support high but held at medium because field operating data from FOAK is not yet mature (LanzaJet only commissioning 2024).',
    trajectory: 'improving',
    trajectory_reasoning: 'FOAK commissioning in progress; multiple FIDs in pipeline; cost trajectory improving as production scales.',
    flag: false,
  },
  {
    label: 'FT-SPK × EU SAF mandate compliance',
    technology: 'ft_synthetic_paraffinic_kerosene',
    application: 'eu_saf_mandate_compliance',
    horizon: 'H3',
    horizon_reasoning: 'Velocys Bayou Fuels pre-construction; Fulcrum Sierra mothballed 2024; SkyNRG/KLM FT pilot. FOAK commercial pre-FID at scale. Cost premium material vs HEFA; mandate-eligibility creates market but commercial conversion pre-2030 uncertain. H3 markers: technology demonstrated but not at commercial scale; FOAK projects struggling to FID; cost trajectory unclear.',
    confidence: 'medium',
    confidence_reasoning: '2 evidence rows. Velocys operator_disclosure medium (sole authoritative for project status); ICAO CORSIA FT-SPK pathway documentation (government_data, high). 1 hard-evidence row → medium confidence per v1.1 (operator_disclosure on a pre-construction project where data quality is provisional doesn\'t qualify as hard evidence; the only-authoritative-source carve-out applies when operator data is structured and persistent, which pre-construction project data is not).',
    trajectory: 'volatile',
    trajectory_reasoning: 'Fulcrum mothballing in 2024 was a structural reversal; uncertain whether the FT pathway has a viable commercial route in this decade.',
    flag: false,
  },
  {
    label: 'Power-to-liquid × EU SAF mandate compliance',
    technology: 'power_to_liquid',
    application: 'eu_saf_mandate_compliance',
    horizon: 'H3',
    horizon_reasoning: 'EU ReFuelEU sub-mandate creates legally binding PtL demand: 0.7% by 2030, 1.2% by 2032, escalating to 35% by 2050. But supply pre-FID at scale: Atmosfair Werlte ~1 ktpa, Norsk e-Fuel pre-FID, Synhelion solar-thermal pilot. Mandate floor in conflict with supply availability — the most fragile sub-mandate in ReFuelEU. H3 markers: technology demonstrated but not at commercial scale; cost trajectory unclear; mandate floor will be missed unless capacity FIDs accelerate materially.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. EU JRC SAF Outlook 2024 (government_data, high); IEA Renewables 2024 SAF chapter (industry_body, high); Atmosfair PtL operator disclosures (operator_disclosure, medium). 1 hard-evidence row (EU JRC government_data); per v1.1 Atmosfair operator_disclosure at small commercial scale qualifies as authoritative for project but not at structural-trajectory level. Held at medium.',
    trajectory: 'volatile',
    trajectory_reasoning: 'EU mandate floor structurally requires PtL scale-up; supply trajectory uncertain. Mandate compliance risk for 2030 highly material.',
    flag: false,
  },
  {
    label: 'HEFA hydroprocessing × Book & Claim SAF certificate market',
    technology: 'hefa_hydroprocessing',
    application: 'book_and_claim_saf_market',
    horizon: 'H2',
    horizon_reasoning: 'Book & Claim operates at meaningful volume for HEFA today (Sky NRG, RSB-certified certificates) but settlement frameworks contested across registries; ICAO CORSIA Book & Claim assessment ongoing 2023-2024. EU mandate post-2025 forces re-architecture: physical fuel delivered to mandate compliance whereas voluntary B&C must trade above-mandate volumes only. H2 markers: FOAK operational; regulatory frameworks (RSB, ISCC, ICAO CORSIA) in late-stage development.',
    confidence: 'medium',
    confidence_reasoning: '3 evidence rows. RSB Book & Claim guidance 2024 (industry_body, high); ICAO CORSIA Book & Claim assessment 2023 (government_data, high); Sky NRG corporate disclosures (operator_disclosure, medium). 1 hard-evidence row (ICAO government_data); held at medium pending RSB-CORSIA harmonisation outcome.',
    trajectory: 'volatile',
    trajectory_reasoning: 'EU mandate forces re-architecture of which volumes can be B&C-certified; 2025-2027 trajectory volatile until registries align.',
    flag: false,
  },
  {
    label: 'ATJ fermentation × Book & Claim SAF certificate market',
    technology: 'atj_fermentation',
    application: 'book_and_claim_saf_market',
    horizon: 'H3',
    horizon_reasoning: 'B&C settlements for ATJ pathway pre-broad-acceptance; LanzaJet Freedom Pines product entering certificate market 2024-2025 but volumes too small for material trading depth. H3 markers: technology demonstrated but B&C application not at commercial scale.',
    confidence: 'low',
    confidence_reasoning: 'Only 2 evidence rows: RSB Book & Claim guidance (industry_body, high) and LanzaJet operator disclosures (operator_disclosure, medium). No peer-reviewed or government_data on ATJ-specific B&C trading. Insufficient evidence diversity.',
    trajectory: 'improving',
    trajectory_reasoning: 'B&C trading volume growing as ATJ supply enters market; trajectory dependent on registry harmonisation.',
    flag: true,
    flag_reason: 'low confidence: only industry_body and operator_disclosure evidence; no government_data or peer-reviewed source on ATJ-specific Book & Claim trading. Re-run Step 2 with ICAO CORSIA ATJ-specific B&C assessment when published.',
  },
  {
    label: 'Power-to-liquid × Book & Claim SAF certificate market',
    technology: 'power_to_liquid',
    application: 'book_and_claim_saf_market',
    horizon: 'H3',
    horizon_reasoning: 'PtL premium pricing makes B&C structures economically critical — physical PtL delivery at one airport monetised via certificates sold to corporate buyers globally. But PtL supply at certificate-tradeable volume pre-2027. EU mandate sub-mandate compliance separately requires physical PtL delivery, complicating B&C settlement. H3 markers: technology pre-commercial; B&C application speculative pending physical supply.',
    confidence: 'low',
    confidence_reasoning: 'Only 2 evidence rows: ICAO CORSIA Book & Claim assessment (government_data, medium); Atmosfair PtL operator disclosures (operator_disclosure, medium). 1 hard-evidence row but at medium strength; PtL-B&C-specific evidence thin.',
    trajectory: 'improving',
    trajectory_reasoning: 'Long-term trajectory positive given PtL economics depend on B&C; near-term trajectory contingent on physical PtL FIDs.',
    flag: true,
    flag_reason: 'low confidence: thin evidence on PtL-Book & Claim intersection; no peer-reviewed analysis. Re-run Step 2 with EU JRC PtL economics paper or RSB PtL-specific guidance when published.',
  },
];

// ============================================================================
// Evidence per new pair
// ============================================================================
const NEW_EVIDENCE = [
  // hefa × eu_mandate (4)
  { pair: 'HEFA hydroprocessing × EU SAF mandate compliance',
    type: 'company_filing', strength: 'high', supports: 'H1',
    text: 'Neste capital markets day 2024: 1.5 Mtpa renewable products capacity (~50% SAF-eligible); Singapore expansion 2.6 Mtpa Q1 2024; Rotterdam +1.3 Mtpa 2026. Listed on Helsinki Nasdaq with audited disclosures.',
    citation: 'Neste capital markets day 2024',
    url: 'https://www.neste.com/investors',
    publication_date: '2024-03-01' },
  { pair: 'HEFA hydroprocessing × EU SAF mandate compliance',
    type: 'government_data', strength: 'high', supports: 'H1',
    text: 'EU JRC SAF Outlook 2024: HEFA pathway accounts for >90% of EU SAF supply 2024-2025; mandate-eligible volume sufficient for 2% 2025 floor; supply tightening expected post-2027.',
    citation: 'EU JRC SAF Outlook 2024',
    url: 'https://publications.jrc.ec.europa.eu/repository/handle/JRC134529',
    publication_date: '2024-04-01' },
  { pair: 'HEFA hydroprocessing × EU SAF mandate compliance',
    type: 'industry_body', strength: 'high', supports: 'H1',
    text: 'IATA SAF tracker 2024: global HEFA SAF production ~1 Mtpa 2024; ~75% capacity dedicated to EU + US compliance demand; mandate-driven offtake structures emerging at airline level.',
    citation: 'IATA SAF tracker 2024',
    url: 'https://www.iata.org/en/programs/environment/sustainable-aviation-fuels/',
    publication_date: '2024-09-01' },
  { pair: 'HEFA hydroprocessing × EU SAF mandate compliance',
    type: 'government_data', strength: 'high', supports: 'H1',
    text: 'ICAO CORSIA HEFA pathway documentation: HEFA recognised as default-life-cycle-emissions pathway with up to 73% reduction vs conventional jet; technology TRL 9.',
    citation: 'ICAO CORSIA HEFA pathway documentation',
    url: 'https://www.icao.int/environmental-protection/corsia',
    publication_date: '2024-01-01' },

  // hefa × voluntary (3)
  { pair: 'HEFA hydroprocessing × voluntary SAF offtake',
    type: 'industry_body', strength: 'high', supports: 'H1',
    text: 'IATA SAF tracker 2024: voluntary SAF offtake by airlines (KLM, United, JetBlue, Lufthansa Group) operating since ~2016 with small commercial volumes; corporate certificate purchases growing.',
    citation: 'IATA SAF tracker 2024',
    url: 'https://www.iata.org/en/programs/environment/sustainable-aviation-fuels/',
    publication_date: '2024-09-01' },
  { pair: 'HEFA hydroprocessing × voluntary SAF offtake',
    type: 'operator_disclosure', strength: 'medium', supports: 'H1',
    text: 'Sky NRG corporate certificate sales 2024: Microsoft, Salesforce, KLM corporate program; certificate market liquidity growing.',
    citation: 'Sky NRG corporate disclosures 2024',
    url: 'https://skynrg.com/news/',
    publication_date: '2024-06-01' },
  { pair: 'HEFA hydroprocessing × voluntary SAF offtake',
    type: 'operator_disclosure', strength: 'medium', supports: 'H1',
    text: 'JetBlue voluntary SAF blending at JFK and Boston: small commercial volumes operational since 2020 via World Energy supply.',
    citation: 'JetBlue Sustainability Report 2023',
    url: 'https://www.jetblue.com/sustainability',
    publication_date: '2024-04-01' },

  // atj × eu_mandate (3)
  { pair: 'ATJ fermentation × EU SAF mandate compliance',
    type: 'operator_disclosure', strength: 'high', supports: 'H2',
    text: 'LanzaJet Freedom Pines (Soperton GA) commissioned 2024 at 38 Mlpa (~30 ktpa) — FOAK ATJ commercial; supply contracts to British Airways, ANA, JetBlue, US DoD. Operator is sole authoritative source for project operating data.',
    citation: 'LanzaJet operator disclosures 2024',
    url: 'https://www.lanzajet.com/news',
    publication_date: '2024-04-01' },
  { pair: 'ATJ fermentation × EU SAF mandate compliance',
    type: 'company_filing', strength: 'high', supports: 'H2',
    text: 'Gevo IR 2024: Net-Zero 1 (Lake Preston SD) at FID 2024 — 60 Mgallons/yr SAF + co-products; offtake agreements with Delta, American, others; Nasdaq listed with audited disclosures.',
    citation: 'Gevo IR 2024',
    url: 'https://investors.gevo.com/',
    publication_date: '2024-08-01' },
  { pair: 'ATJ fermentation × EU SAF mandate compliance',
    type: 'government_data', strength: 'high', supports: 'H2',
    text: 'ICAO CORSIA ATJ pathway documentation: ATJ recognised default-life-cycle-emissions pathway 2018; TRL 7-8 with FOAK commercial scale-up.',
    citation: 'ICAO CORSIA ATJ pathway documentation',
    url: 'https://www.icao.int/environmental-protection/corsia',
    publication_date: '2024-01-01' },

  // ft-spk × eu_mandate (2)
  { pair: 'FT-SPK × EU SAF mandate compliance',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'Velocys Bayou Fuels (Mississippi): pre-construction; targeted 2026-2027 commissioning; biomass gasification + FT to SAF.',
    citation: 'Velocys Bayou Fuels operator disclosures 2024',
    url: 'https://www.velocys.com/projects/bayou-fuels/',
    publication_date: '2024-07-01' },
  { pair: 'FT-SPK × EU SAF mandate compliance',
    type: 'government_data', strength: 'high', supports: 'H3',
    text: 'ICAO CORSIA FT-SPK pathway documentation: FT-SPK recognised pathway; TRL 7; commercial pre-FID at scale; Fulcrum Sierra mothballing 2024 a structural reversal.',
    citation: 'ICAO CORSIA FT-SPK pathway documentation',
    url: 'https://www.icao.int/environmental-protection/corsia',
    publication_date: '2024-01-01' },

  // ptl × eu_mandate (3)
  { pair: 'Power-to-liquid × EU SAF mandate compliance',
    type: 'government_data', strength: 'high', supports: 'H3',
    text: 'EU JRC SAF Outlook 2024: PtL sub-mandate (0.7% by 2030, 1.2% by 2032) creates binding demand floor; supply trajectory pre-2030 compliance highly uncertain.',
    citation: 'EU JRC SAF Outlook 2024',
    url: 'https://publications.jrc.ec.europa.eu/repository/handle/JRC134529',
    publication_date: '2024-04-01' },
  { pair: 'Power-to-liquid × EU SAF mandate compliance',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'IEA Renewables 2024 SAF chapter: PtL global capacity ~1-3 ktpa 2024; 100+ ktpa announced 2030 capacity but minimal at FID; cost premium 5-10x conventional jet.',
    citation: 'IEA Renewables 2024 SAF chapter',
    url: 'https://www.iea.org/reports/renewables-2024',
    publication_date: '2024-10-01' },
  { pair: 'Power-to-liquid × EU SAF mandate compliance',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'Atmosfair Werlte plant: ~1 ktpa PtL operating since 2021 at demonstrator scale; supply to Lufthansa Group corporate offtake.',
    citation: 'Atmosfair PtL operator disclosures 2024',
    url: 'https://www.atmosfair.de/en/about_us/atmosfair_company/atmosfair_efuels/',
    publication_date: '2024-05-01' },

  // hefa × b&c (3)
  { pair: 'HEFA hydroprocessing × Book & Claim SAF certificate market',
    type: 'industry_body', strength: 'high', supports: 'H2',
    text: 'RSB Book & Claim guidance 2024: HEFA-derived certificate trading at meaningful volume since 2020; settlement protocols mature; ISCC + RSB cross-recognition advancing 2024.',
    citation: 'RSB Book & Claim guidance 2024',
    url: 'https://rsb.org/our-work/standards/',
    publication_date: '2024-03-01' },
  { pair: 'HEFA hydroprocessing × Book & Claim SAF certificate market',
    type: 'government_data', strength: 'high', supports: 'H2',
    text: 'ICAO CORSIA Book & Claim assessment 2023: framework recognised but harmonisation across registries (RSB, ISCC) and CORSIA pending; EU ReFuelEU mandate post-2025 limits voluntary B&C scope to above-mandate volumes.',
    citation: 'ICAO CORSIA Book & Claim assessment 2023',
    url: 'https://www.icao.int/environmental-protection/corsia',
    publication_date: '2023-09-01' },
  { pair: 'HEFA hydroprocessing × Book & Claim SAF certificate market',
    type: 'operator_disclosure', strength: 'medium', supports: 'H2',
    text: 'Sky NRG corporate disclosures 2024: HEFA-anchored Book & Claim certificates trading; Microsoft, Salesforce, Bloomberg as anchor buyers.',
    citation: 'Sky NRG corporate disclosures 2024',
    url: 'https://skynrg.com/news/',
    publication_date: '2024-06-01' },

  // atj × b&c (2)
  { pair: 'ATJ fermentation × Book & Claim SAF certificate market',
    type: 'industry_body', strength: 'high', supports: 'H3',
    text: 'RSB Book & Claim guidance 2024: ATJ pathway B&C eligible under RSB; settlement protocol applicable to LanzaJet Freedom Pines volumes 2024 onwards.',
    citation: 'RSB Book & Claim guidance 2024',
    url: 'https://rsb.org/our-work/standards/',
    publication_date: '2024-03-01' },
  { pair: 'ATJ fermentation × Book & Claim SAF certificate market',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'LanzaJet operator disclosures: certificate market participation under RSB; trading depth limited by FOAK production volume.',
    citation: 'LanzaJet operator disclosures 2024',
    url: 'https://www.lanzajet.com/news',
    publication_date: '2024-04-01' },

  // ptl × b&c (2)
  { pair: 'Power-to-liquid × Book & Claim SAF certificate market',
    type: 'government_data', strength: 'medium', supports: 'H3',
    text: 'ICAO CORSIA Book & Claim assessment 2023: PtL-specific B&C protocol pending; recognition requires harmonisation of green-H2 attribute trading with PtL output certificate.',
    citation: 'ICAO CORSIA Book & Claim assessment 2023',
    url: 'https://www.icao.int/environmental-protection/corsia',
    publication_date: '2023-09-01' },
  { pair: 'Power-to-liquid × Book & Claim SAF certificate market',
    type: 'operator_disclosure', strength: 'medium', supports: 'H3',
    text: 'Atmosfair PtL operator disclosures: small commercial PtL volumes (~1 ktpa) entering certificate market; Lufthansa Group corporate offtake bridges physical and certificate.',
    citation: 'Atmosfair PtL operator disclosures 2024',
    url: 'https://www.atmosfair.de/en/',
    publication_date: '2024-05-01' },
];

// ============================================================================
// Adjacencies (>=2 per new pair)
// ============================================================================
const NEW_ADJACENCIES = [
  // hefa × eu_mandate (4)
  { from: 'HEFA hydroprocessing × EU SAF mandate compliance',
    to:   'HEFA hydroprocessing × voluntary SAF offtake',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same HEFA process; mandate-driven vs voluntary-driven demand. EU mandate post-2025 absorbs majority of HEFA supply, squeezing voluntary availability.' },
  { from: 'HEFA hydroprocessing × EU SAF mandate compliance',
    to:   'HEFA hydroprocessing × Book & Claim SAF certificate market',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same HEFA process; physical-fuel mandate compliance vs certificate-market trading. EU mandate post-2025 forces B&C market re-architecture.' },
  { from: 'HEFA hydroprocessing × EU SAF mandate compliance',
    to:   'ATJ fermentation × EU SAF mandate compliance',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Same EU mandate compliance; HEFA is the H1 incumbent, ATJ is the H2 derivative pathway competing for non-HEFA mandate share.' },
  { from: 'HEFA hydroprocessing × EU SAF mandate compliance',
    to:   'Power-to-liquid × EU SAF mandate compliance',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Same EU mandate envelope but PtL serves a separate sub-mandate (0.7% by 2030 PtL-specific) — competition is artificial because of mandate carve-outs.' },

  // hefa × voluntary (2)
  { from: 'HEFA hydroprocessing × voluntary SAF offtake',
    to:   'HEFA hydroprocessing × EU SAF mandate compliance',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Mirror of above.' },
  { from: 'HEFA hydroprocessing × voluntary SAF offtake',
    to:   'HEFA hydroprocessing × Book & Claim SAF certificate market',
    type: 'complement', strength: 'strong',
    reason: 'Voluntary offtake operates partly via B&C settlement; complementary structures for above-mandate corporate purchases.' },

  // atj × eu_mandate (3)
  { from: 'ATJ fermentation × EU SAF mandate compliance',
    to:   'HEFA hydroprocessing × EU SAF mandate compliance',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Mirror of above.' },
  { from: 'ATJ fermentation × EU SAF mandate compliance',
    to:   'ATJ fermentation × Book & Claim SAF certificate market',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same ATJ process; mandate compliance vs B&C certificate trading.' },
  { from: 'ATJ fermentation × EU SAF mandate compliance',
    to:   'FT-SPK × EU SAF mandate compliance',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Same EU mandate envelope; advanced-biofuel-pathway alternatives.' },

  // ft-spk × eu_mandate (2)
  { from: 'FT-SPK × EU SAF mandate compliance',
    to:   'ATJ fermentation × EU SAF mandate compliance',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Mirror of above.' },
  { from: 'FT-SPK × EU SAF mandate compliance',
    to:   'Power-to-liquid × EU SAF mandate compliance',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Both H3 advanced pathways; FT-SPK is biomass-derived FT, PtL is electricity-derived FT — same downstream FT step but different feedstock.' },

  // ptl × eu_mandate (3)
  { from: 'Power-to-liquid × EU SAF mandate compliance',
    to:   'Power-to-liquid × Book & Claim SAF certificate market',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same PtL process; mandate compliance (sub-mandate) vs B&C certificate. PtL economics depend on B&C trading.' },
  { from: 'Power-to-liquid × EU SAF mandate compliance',
    to:   'PEM electrolysis × hard-to-abate industrial H2 demand',
    type: 'complement', strength: 'moderate',
    reason: 'PtL requires green H2 input (PEM electrolysis upstream); H2 demand pair complements PtL as upstream supply chain.' },
  { from: 'Power-to-liquid × EU SAF mandate compliance',
    to:   'Direct air capture × CDR voluntary market',
    type: 'complement', strength: 'weak',
    reason: 'PtL requires CO2 input — DAC supplies one source of feedstock CO2; pairs are complementary in PtL upstream supply chain.' },

  // hefa × b&c (2)
  { from: 'HEFA hydroprocessing × Book & Claim SAF certificate market',
    to:   'ATJ fermentation × Book & Claim SAF certificate market',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Same B&C application; HEFA is mature in B&C trading, ATJ is emerging.' },
  { from: 'HEFA hydroprocessing × Book & Claim SAF certificate market',
    to:   'Power-to-liquid × Book & Claim SAF certificate market',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Same B&C application; PtL certificates are higher-premium and treated differently in registries.' },

  // atj × b&c (2)
  { from: 'ATJ fermentation × Book & Claim SAF certificate market',
    to:   'HEFA hydroprocessing × Book & Claim SAF certificate market',
    type: 'same_application_different_technology', strength: 'strong',
    reason: 'Mirror of above.' },
  { from: 'ATJ fermentation × Book & Claim SAF certificate market',
    to:   'ATJ fermentation × EU SAF mandate compliance',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Same ATJ process; B&C trading vs mandate compliance.' },

  // ptl × b&c (2)
  { from: 'Power-to-liquid × Book & Claim SAF certificate market',
    to:   'HEFA hydroprocessing × Book & Claim SAF certificate market',
    type: 'same_application_different_technology', strength: 'moderate',
    reason: 'Same B&C application; PtL certificates command higher premium.' },
  { from: 'Power-to-liquid × Book & Claim SAF certificate market',
    to:   'Power-to-liquid × EU SAF mandate compliance',
    type: 'same_technology_different_application', strength: 'strong',
    reason: 'Mirror of above.' },
];

// ============================================================================
// Component links
// ============================================================================
const COMPONENT_LINKS = [
  // EU_SAF_MANDATE (id=18) — primary to all eu_saf_mandate_compliance pairs
  { component: 'EU_SAF_MANDATE',
    pair: 'HEFA hydroprocessing × EU SAF mandate compliance',
    role: 'primary',
    reason: 'EU_SAF_MANDATE component IS the regulation governing this pair; primary anchor. HEFA is the H1 mandate-compliance technology.' },
  { component: 'EU_SAF_MANDATE',
    pair: 'ATJ fermentation × EU SAF mandate compliance',
    role: 'primary',
    reason: 'Same regulation; ATJ is the H2 mandate-compliance technology.' },
  { component: 'EU_SAF_MANDATE',
    pair: 'FT-SPK × EU SAF mandate compliance',
    role: 'primary',
    reason: 'Same regulation; FT-SPK is an H3 mandate-compliance technology.' },
  { component: 'EU_SAF_MANDATE',
    pair: 'Power-to-liquid × EU SAF mandate compliance',
    role: 'primary',
    reason: 'EU sub-mandate (0.7% PtL by 2030) creates binding PtL-specific demand; primary regulation anchor.' },

  // SAF_BLENDING_INFRASTRUCTURE (id=19) — primary to HEFA pairs (Shell Pernis HEFA), secondary to ATJ/FT/PtL (Shell co-investments)
  { component: 'SAF_BLENDING_INFRASTRUCTURE',
    pair: 'HEFA hydroprocessing × EU SAF mandate compliance',
    role: 'primary',
    reason: 'Shell Pernis HEFA SAF retrofit is the principal Shell instance of HEFA mandate compliance; Shell brief Section 04 SAF.' },
  { component: 'SAF_BLENDING_INFRASTRUCTURE',
    pair: 'HEFA hydroprocessing × voluntary SAF offtake',
    role: 'primary',
    reason: 'Shell SAF supply to airline voluntary programs (KLM, JetBlue) operating today; primary Shell instance.' },
  { component: 'SAF_BLENDING_INFRASTRUCTURE',
    pair: 'HEFA hydroprocessing × Book & Claim SAF certificate market',
    role: 'primary',
    reason: 'Shell certificate trading anchored on HEFA volumes; primary Shell instance via Pernis output.' },
  { component: 'SAF_BLENDING_INFRASTRUCTURE',
    pair: 'ATJ fermentation × EU SAF mandate compliance',
    role: 'secondary',
    reason: 'Shell co-investments and offtake agreements with LanzaJet; secondary anchor (Shell does not directly operate ATJ assets).' },
  { component: 'SAF_BLENDING_INFRASTRUCTURE',
    pair: 'Power-to-liquid × EU SAF mandate compliance',
    role: 'secondary',
    reason: 'Shell PtL pilots and partnerships (Shell-Phillips 66 PtL JV exploratory); secondary anchor.' },

  // IOC_CAPITAL_DISCIPLINE_PRESSURE (id=20) — exposure_only to all SAF pairs
  { component: 'IOC_CAPITAL_DISCIPLINE_PRESSURE',
    pair: 'HEFA hydroprocessing × EU SAF mandate compliance',
    role: 'exposure_only',
    reason: 'IOC capital discipline pressure influences whether Shell expands HEFA capacity; exposure surface for portfolio capital allocation.' },
  { component: 'IOC_CAPITAL_DISCIPLINE_PRESSURE',
    pair: 'ATJ fermentation × EU SAF mandate compliance',
    role: 'exposure_only',
    reason: 'Same exposure dynamic — capital discipline pressure influences ATJ co-investment scale.' },
  { component: 'IOC_CAPITAL_DISCIPLINE_PRESSURE',
    pair: 'Power-to-liquid × EU SAF mandate compliance',
    role: 'exposure_only',
    reason: 'Capital discipline pressure especially material for PtL — highest cost, longest payback; capital allocation pressure may force Shell exit before PtL commercial conversion.' },
  { component: 'IOC_CAPITAL_DISCIPLINE_PRESSURE',
    pair: 'Power-to-liquid × Book & Claim SAF certificate market',
    role: 'exposure_only',
    reason: 'PtL economics depend on B&C; capital allocation pressure on PtL flows through to Shell B&C trading scale.' },
];

// ============================================================================
// Execution
// ============================================================================
try {
  await client.query('BEGIN');

  // Insert technologies
  const techIds = {};
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

  // Insert applications
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

  // Insert pairs
  const pairIds = {};
  for (const p of NEW_PAIRS) {
    const tid = techIds[p.technology];
    const aid = appIds[p.application];
    if (!tid || !aid) throw new Error(`Missing FK for pair ${p.label}`);
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

  // Look up existing pairs for adjacency targets and component links
  const EXTERNAL_PAIR_LABELS = [
    'PEM electrolysis × hard-to-abate industrial H2 demand',
    'Direct air capture × CDR voluntary market',
  ];
  for (const label of EXTERNAL_PAIR_LABELS) {
    const r = await client.query(`SELECT id FROM technology_application_pairs WHERE pair_label = $1`, [label]);
    if (!r.rows[0]) throw new Error(`Existing pair not found: ${label}`);
    pairIds[label] = r.rows[0].id;
  }

  // Insert evidence
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
        e.supports ?? null, '014_saf_ontology']);
  }
  console.log(`  evidence rows (new): ${NEW_EVIDENCE.length}`);

  // Insert adjacencies
  await client.query(`DELETE FROM pair_adjacencies WHERE source_pair_id = ANY($1::int[])`, [newPairIds]);
  for (const a of NEW_ADJACENCIES) {
    const sid = pairIds[a.from];
    let tid = pairIds[a.to];
    if (!tid) throw new Error(`Missing target pair: ${a.to}`);
    await client.query(`
      INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type,
        adjacency_strength, reasoning_text)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (source_pair_id, target_pair_id, adjacency_type) DO NOTHING
    `, [sid, tid, a.type, a.strength, a.reason]);
  }
  console.log(`  adjacencies (new): ${NEW_ADJACENCIES.length}`);

  // Component links
  const compIds = {};
  for (const cname of new Set(COMPONENT_LINKS.map(l => l.component))) {
    const r = await client.query(`SELECT id FROM components WHERE name = $1 AND initiative_id = 9`, [cname]);
    if (!r.rows[0]) throw new Error(`Component not found in initiative 9: ${cname}`);
    compIds[cname] = r.rows[0].id;
  }
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
    `, [cid, pid, l.role, l.reason, '014_saf_ontology']);
  }
  console.log(`  component_pair_links: ${COMPONENT_LINKS.length} (across ${compIdList.length} components)`);

  // Self-marking output
  console.log('\n=== Self-marking output (Shell SAF) ===');
  const r2 = await client.query(`
    SELECT confidence_band, COUNT(*) AS n FROM technology_application_pairs WHERE id = ANY($1::int[])
    GROUP BY confidence_band ORDER BY confidence_band
  `, [newPairIds]);
  console.log(`  confidence distribution:`); for (const row of r2.rows) console.log(`    ${row.confidence_band}: ${row.n}`);
  const r3 = await client.query(`
    SELECT pair_label, flag_reason FROM technology_application_pairs
    WHERE id = ANY($1::int[]) AND is_flagged_for_review = TRUE
  `, [newPairIds]);
  console.log(`  flagged for review: ${r3.rows.length}`);
  for (const row of r3.rows) console.log(`    - ${row.pair_label} :: ${row.flag_reason}`);
  const r4 = await client.query(`
    SELECT COUNT(DISTINCT cpl.component_id) AS linked
    FROM component_pair_links cpl WHERE cpl.component_id = ANY($1::int[])
  `, [compIdList]);
  console.log(`  components linked: ${r4.rows[0].linked} / ${compIdList.length} components in initiative 9`);
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

  // Note: Book & Claim domain decision
  console.log(`\n  application_domain decision: book_and_claim_saf_market = 'cross_domain'`);
  console.log(`    rationale: B&C market spans transport (aviation supply), financial`);
  console.log(`    (tradable certificate), and built_environment-adjacent (Scope 3 corporate`);
  console.log(`    emissions reporting). No single existing domain captures it cleanly.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — Shell SAF ontology persisted');
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
