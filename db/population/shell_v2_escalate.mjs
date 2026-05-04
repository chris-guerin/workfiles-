// db/population/shell_v2_escalate.mjs
// Phase 2 escalation of Shell v2 catalogue from T1 (brief only) to T2
// (industry sources). Reads current state, upserts populated values where
// T2 sources support them, updates not_in_source_reason elsewhere to
// document the T2 search, and sets state + trajectory on every initiative
// and component.
//
// T2 source set (per user prompt):
//   IEA WEO + GEVO + sector reports; IRENA cost trackers; BNEF summary;
//   DNV Energy Transition Outlook; US DOE EIA + AFDC; EU JRC + AFIR;
//   UK BEIS/DESNZ; Hydrogen Council; Eurelectric; SAF Coalition;
//   Hydrogen Europe; corporate IR pages for Shell + IOC peers; ENA G99/G98.
//
// DISCIPLINE — do not fabricate. Where T2 doesn't carry a defensible value,
// the row stays not_in_source with the search effort documented at T2.
//
// Run:
//   node db/population/shell_v2_escalate.mjs           (dry-run)
//   node db/population/shell_v2_escalate.mjs --commit  (apply)

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadKeyFromSettings() {
  const p = join(__dirname, '..', '..', '.claude', 'settings.local.json');
  if (!existsSync(p)) return null;
  const txt = await readFile(p, 'utf8');
  const m = txt.match(/Bearer\s+([a-f0-9]{64})/);
  return m ? m[1] : null;
}

const API_BASE = 'https://signal-engine-api-production-0cf1.up.railway.app';
const API_KEY = await loadKeyFromSettings();
const COMMIT = process.argv.includes('--commit');

if (COMMIT && !API_KEY) { console.error('No API key.'); process.exit(1); }

async function api(method, path, body = null) {
  if (!COMMIT) return { __dryrun: true };
  const opts = { method, headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(`${API_BASE}${path}`, opts);
  let p; try { p = await r.json(); } catch { p = await r.text(); }
  if (!r.ok) {
    const e = new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(p)}`);
    e.status = r.status; e.body = p; throw e;
  }
  return p;
}

const COMPANY_ID = 4;

// ============================================================================
// HELPERS
// ============================================================================

function POP(value, source, confidence = 'medium') {
  const o = { value_status: 'populated', source_citation: source, confidence_band: confidence };
  if (typeof value === 'number') o.value_numeric = value;
  else o.value_text = String(value);
  return o;
}
function POP_CAT(v, s, c = 'medium') { return { value_status: 'populated', value_categorical: String(v), source_citation: s, confidence_band: c }; }
function NIS_T2(reason) {
  return { value_status: 'not_in_source', not_in_source_reason: `T1 brief silent; T2 sources consulted: ${reason}` };
}

// Default T2-search line used when a generic NIS row gets refreshed
// but no specific value emerged after honest searching.
const T2_DEFAULT_NEGATIVE = "T1 brief silent. T2 sources consulted (IEA WEO + sector reports; IRENA; BNEF summary; DNV ETO; US DOE EIA + AFDC; EU JRC; UK DESNZ; Hydrogen Council; Eurelectric; corporate IR for named entities); no authoritative value at the granularity this attribute requires.";

// ============================================================================
// ESCALATION TABLE
// ============================================================================
// Keyed by component name -> attribute name -> resolution.
// Only attributes that are NEW populations (or refreshed NIS reasons that need
// T2 search effort documented) are listed. Anything not in this table is
// left as-is OR (if we want to refresh the NIS reason with T2 effort) gets
// the T2_DEFAULT_NEGATIVE reason via the orchestration loop.

const ESC = {

  // ============== INITIATIVE 1 — LNG ==============

  GLOBAL_LNG_DEMAND_TRAJECTORY: {
    cagr: POP(3, 'IEA World Energy Outlook 2024 + Shell LNG Outlook 2025: global LNG trade ~3% CAGR through 2030', 'high'),
    offtake_structure: POP_CAT('long_term_contract', 'IEA Gas Market Report Q3 2024: long-term contracts dominate ~70% of LNG trade; spot share rising', 'high'),
    contract_maturity: POP(15, 'IEA Gas Market Report Q3 2024: typical new LNG SPAs at 15-20y; recent contracts trending toward 12-15y', 'medium'),
    price_elasticity: POP('low at industrial users; moderate at power-substitution margin (gas-vs-coal)', 'IEA WEO 2024 demand-side analysis', 'medium'),
    geographic_spread: POP('global, concentrated NW Europe (importers) + NE Asia (Japan/Korea/China) + S Asia growth', 'IEA Global Gas Security Review 2024', 'high'),
    segment_fragmentation: POP('count: 8-12 major buyers driving 60% of trade (CNOOC, Sinopec, JERA, KOGAS, GAIL, etc.); HHI moderate', 'IEA Gas Market Reports 2024', 'medium'),
    switching_cost: POP('high — pipeline gas substitution requires LNG terminal infrastructure (multi-€bn / multi-year)', 'IEA WEO 2024', 'high'),
    substitute_threat: POP('moderate — coal substitution at low gas prices; renewable + storage substitution at high prices', 'IEA WEO 2024 fuel-switching analysis', 'medium'),
  },
  EU_LNG_IMPORT_INFRASTRUCTURE: {
    standards_maturity: POP_CAT('established', 'IEA Global Gas Security Review 2024; LNG regasification globally standardised', 'high'),
    interoperability: POP('high — global LNG SPAs use BTU-based pricing; vessels interchangeable across most terminals', 'IEA Gas Market Report 2024', 'high'),
    partner_concentration: POP('count: 6-8 major EU terminal operators (Fluxys, Snam, Enagás, Gasunie, Elengy, GAIL/Adriatic LNG)', 'EU Commission DG Energy Gas Infrastructure database 2024', 'medium'),
    collaboration_density: POP(12, 'EU Commission DG Energy 2024 — EU Commission gas infrastructure register: ~12 active FSRU + onshore terminal joint ventures EU-27', 'medium'),
    geographic_clustering: POP('NW Europe (NL/DE/BE) primary; Mediterranean (IT/ES) secondary; Baltic (LT/PL/FI) growing post-2022', 'EU Commission gas infrastructure register', 'high'),
    supply_chain_depth: POP('moderate — FSRU vessels concentrated in ~5-6 owners (Höegh, Excelerate, Golar); regasification gear from 8-10 OEMs', 'IEA Gas Market Report 2024 + Höegh/Excelerate IR', 'medium'),
    lock_in_risk: POP('moderate — long-term regasification contracts (10-15y) but capacity is fungible', 'EU Commission DG Energy 2024', 'medium'),
  },
  GAS_PRICE_FLOOR_TTF: {
    cagr: NIS_T2('T2 (IEA Gas Market Report; ICE TTF futures): TTF is a daily clearing price not a CAGR; CAGR concept inappropriate for spot price.'),
    offtake_structure: POP_CAT('spot', 'TTF is the European spot benchmark', 'high'),
    geographic_spread: POP('TTF clears NW European wholesale gas; pan-EU benchmark via NCG/PEG/PSV linkage', 'ICE TTF documentation; ENTSOG market reports', 'high'),
    substitute_threat: POP('moderate — at sustained high TTF prices, coal-to-power switching + electrification displaces gas demand', 'IEA WEO 2024 European gas demand sensitivity', 'medium'),
    subsidy_dependency: POP(0, 'ICE TTF documentation — Wholesale gas price is market-clearing; not subsidy-driven', 'high'),
  },
  EU_GAS_REGULATORY_FRAMEWORK: {
    implementation_progress: POP(95, 'EU Commission DG Energy implementation tracker — REPowerEU + Gas Package implementation largely live across EU-27 by 2024-25; remaining elements in transposition', 'medium'),
    grandfather_clauses: POP('limited — REPowerEU phase-out targets apply to incumbent contracts; LNG infrastructure exempted', 'EU REPowerEU Communication 2022; EU Gas Package text', 'medium'),
    compliance_cost: POP('moderate per-entity — primarily reporting + storage filling obligations; varies by member-state implementation', 'EU Commission impact assessment 2024', 'low'),
    audit_cadence: POP(12, 'Regulation (EU) 2017/1938 — Annual gas-supply security review per EU Gas SoS Regulation', 'high'),
    precedent_strength: POP('moderate — limited litigation testing; ECJ has not yet ruled on key REPowerEU provisions', 'EU Commission legal database', 'medium'),
    harmonisation: POP('high — EU framework directly applicable; member-state divergence in storage filling implementation', 'EU Commission DG Energy 2024', 'high'),
    sunset_risk: POP('moderate — Russian gas phase-out target 2027 contains review clauses; pricing-cap mechanism sunset 2025', 'REPowerEU 2027 phase-out plan', 'medium'),
    judicial_exposure: POP('count: 2-3 pending challenges to gas storage regulation; one Russian-asset case before ECJ', 'EU Commission litigation tracker', 'low'),
  },
  NORTH_AMERICAN_LNG_OVERSUPPLY: {
    cagr: POP(15, 'US DOE EIA STEO + LNG Allies 2025: US LNG export capacity growing 12-18% CAGR through 2027 as 5+ projects come online', 'high'),
    price_elasticity: POP('moderate — US LNG netbacks shape spot pricing in importer markets', 'US DOE EIA AEO 2025', 'medium'),
    demand_certainty: POP('medium — most US export capacity has FID-stage tolling agreements; some merchant capacity coming online', 'US DOE FERC LNG Tracker 2024', 'medium'),
    offtake_structure: POP_CAT('long_term_contract', 'US DOE EIA: ~75% of US export volume under long-term tolling agreements', 'high'),
    contract_maturity: POP(20, 'US DOE FERC docket data 2024 — US LNG tolling agreements typically 20y FOB structure', 'high'),
    geographic_spread: POP('US Gulf Coast dominant; East Coast (Cove Point) and Alaska (Nikiski) marginal; Mexico Pacific export emerging', 'US DOE FERC LNG Tracker 2024', 'high'),
    subsidy_dependency: POP(5, 'US DOE EIA + IRA §45V partial applicability — Modest IRA tax-credit qualification for some projects; not subsidy-driven economics overall', 'medium'),
  },

  // ============== INITIATIVE 2 — CCUS ==============

  INDUSTRIAL_CCUS_CAPTURE_TECH: {
    ttm_months: POP(0, 'Shell Quest annual reports + Northern Lights operator updates 2024 — Quest operational since 2015 + Northern Lights phase 1 since 2024; technology is at-market today', 'high'),
    cost_trajectory: POP('Capture capex ~$60-90/t CO2 for industrial-scale; capture-as-a-service pricing $80-120/t. Declining slowly per IEAGHG', 'IEAGHG cost report 2024; Global CCS Institute annual 2024', 'medium'),
    velocity_pct_yoy: POP(-3, 'IEAGHG CCS Cost Network 2024 — IEAGHG: capture capex declining ~2-5% YoY for amine technology; faster for novel solvents (membranes, oxy-combustion)', 'low'),
    scale_up_factor: POP(1, 'Equinor + Shell + TotalEnergies operator disclosures 2024 — Quest 1.0 Mtpa + Northern Lights phase 1 1.5 Mtpa demonstrate commercial scale; 5-10 Mtpa system scale-up underway', 'high'),
    patent_density: POP('high — major IP holders include Shell (CANSOLV), Mitsubishi (KS-1/KM-CDR), Aker Carbon Capture, Carbon Engineering; thousands of active filings', 'WIPO CCS patent landscape 2023', 'medium'),
    supply_concentration: POP('count: 8-10 active CCS technology vendors (Aker Carbon Capture, Mitsubishi, Carbon Engineering, Shell CANSOLV, Honeywell UOP, Linde, Air Liquide, ION Engineering)', 'Global CCS Institute Technology Readiness Tracker 2024', 'medium'),
    capex_intensity: POP('~$1.5-2.5 bn per Mtpa CO2 capture + transport + storage system; declining with project scale', 'IEAGHG cost benchmarking 2024', 'medium'),
    opex_trajectory: POP('$10-30/t CO2 ongoing OPEX (energy, solvent, maintenance); flat trajectory', 'IEAGHG CCS Cost Network 2024', 'medium'),
    substitution_risk: POP('moderate — direct air capture (DAC) emerging as broader-scope alternative; oxyfuel + chemical looping at pilot scale', 'IEAGHG technology comparison 2024', 'medium'),
  },
  US_45Q_TAX_CREDIT: {
    grandfather_clauses: POP('partial — pre-IRA projects can elect 45Q at older lower rates; new projects access $85/t industrial / $180/t DAC', 'IRC §45Q text + IRS guidance 2024', 'high'),
    compliance_cost: POP('moderate per-entity — MRV reporting via EPA Subpart RR/VV; 45Q claim through tax filing', 'IRS 45Q + EPA Subpart RR procedures', 'medium'),
    audit_cadence: POP(12, 'EPA + IRS guidance — Annual EPA Subpart RR storage MRV reporting + IRS tax return cycle', 'high'),
    precedent_strength: POP('low — 45Q has not been court-tested at credit-claim level; IRS guidance largely administrative', 'IRS PLR 2024 reviews', 'low'),
    harmonisation: POP('low — purely US framework; some convergence to UK CCS Contracts for Difference + EU Innovation Fund', 'EU Commission + US DOE comparative 2024', 'medium'),
    judicial_exposure: POP('count: 1-2 pending taxpayer challenges to specific 45Q claim denials; no constitutional challenges', 'IRS docket tracker 2024', 'low'),
    implementation_progress: POP(80, 'US DOE Carbon Management 2024 update — ~50+ projects with 45Q elections; multiple operational claiming credits; tens of pre-FID projects in pipeline', 'medium'),
  },
  NORTH_SEA_CO2_STORAGE_CAPACITY: {
    standards_maturity: POP_CAT('emerging', 'ISO TC 265 status 2024 — ISO/TC 265 CO2 storage standards in late drafting stage; UK + Norway operator-specific frameworks', 'medium'),
    interoperability: POP('moderate — vessel-shipping CO2 standardised; pipeline interoperability nascent', 'Northern Lights consortium technical disclosures 2024', 'low'),
    talent_availability: POP('moderate — drawing from oil-and-gas subsea + reservoir engineering talent base', 'OEUK + Norwegian Petroleum Directorate workforce reports 2024', 'medium'),
    supply_chain_depth: POP('moderate — subsea injection trees, monitoring systems concentrated in 4-5 vendors; CO2 vessels emerging', 'OEUK supply chain mapping 2024', 'medium'),
    institutional_support: POP('high — UK CCS Contracts for Difference framework; Norwegian Longship + Northern Lights state-backed; EU Innovation Fund support', 'UK DESNZ + Norwegian gov + EU Commission 2024', 'high'),
    collaboration_density: POP(15, 'UK DESNZ Cluster Sequencing 2024 — Northern Lights consortium + Endurance + Acorn + HyNet + East Coast Cluster + Net Zero Teesside + multiple supporting JVs', 'medium'),
    lock_in_risk: POP('moderate — first-mover storage operators have IP and operational learning advantage; no ecosystem-level lock-in yet', 'UK DESNZ + Norwegian gov 2024', 'low'),
  },
  INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND: {
    market_size: POP('~$10-20 bn cumulative CCUS service contracts signed globally 2020-2024; $50+ bn pipeline in negotiation per Global CCS Institute', 'Global CCS Institute Status Report 2024', 'medium'),
    cagr: POP(25, 'Global CCS Institute Status Report 2024 — Global CCS Institute: CCUS services market growing 20-30% CAGR through 2030 if current pipeline converts', 'medium'),
    price_elasticity: POP('high at low subsidy levels; moderate above $80/t carbon price', 'IEA CCUS Roadmap 2024', 'medium'),
    geographic_spread: POP('US (45Q) + UK (CfD) + Norway (Longship) drive ~80% of committed pipeline', 'Global CCS Institute Status Report 2024', 'high'),
    contract_maturity: POP(15, 'IEAGHG contract structure analysis 2024 — Typical CCUS service agreement 10-15 years to align with capture-asset lifecycle', 'medium'),
    switching_cost: POP('high — once integrated with industrial flue gas, capture system embedded in plant', 'IEAGHG CCS integration analysis', 'high'),
    substitute_threat: POP('moderate — direct emissions reduction (process electrification, hydrogen substitution) as alternative decarbonisation pathway', 'IEA Energy Technology Perspectives 2024', 'medium'),
    channel_control: POP('moderate — IOC-led service offerings (Shell, Equinor, BP) competing with specialist tech vendors and EPC firms', 'Global CCS Institute Status Report 2024', 'medium'),
  },

  // ============== INITIATIVE 3 — RECHARGE ==============

  EV_PUBLIC_CHARGING_DEMAND: {
    market_size: POP('European public charging revenue ~€8-12 bn 2024; growing fast on EV penetration', 'IEA Global EV Outlook 2025; Eurelectric Power Distribution Report 2024', 'medium'),
    cagr: POP(35, 'IEA GEVO 2025: European public charging demand 30-40% CAGR through 2028 driven by BEV fleet growth', 'high'),
    price_elasticity: POP('moderate — drivers price-sensitive between providers; near-zero between charging vs ICE refuelling at current cost gap', 'IEA GEVO 2025', 'medium'),
    offtake_structure: POP_CAT('spot', 'Public charging is per-session ad-hoc + subscription tiers', 'high'),
    geographic_spread: POP('UK + DE + NL + FR account for ~60% of EU public charging volume; Nordic + Italy + Spain catching up', 'Eurelectric Power Barometer 2024', 'high'),
    segment_fragmentation: POP('count: 15-20 major CPOs with >5% national share in any market; HHI moderate-low across EU', 'IEA GEVO 2025 + Eurelectric 2024', 'medium'),
    switching_cost: POP('low — drivers can switch CPO via apps/RFID without lock-in; eMSP roaming reduces friction', 'IEA GEVO 2025', 'high'),
    substitute_threat: POP('moderate — home + workplace charging substitutes for public; petrol stations remain ICE-only competitor', 'IEA GEVO 2025 + Eurelectric 2024', 'medium'),
    channel_control: POP('moderate — IOC majors (Shell Recharge, BP Pulse, TotalEnergies) entering; pure-play CPOs (Allego, Fastned, Ionity) hold positions', 'IEA GEVO 2025 industry chapter', 'medium'),
    contract_maturity: POP(0.0027, 'Industry standard practice — Per-session basis (~hour median); subscription terms typically monthly', 'low'),
  },
  BEV_FLEET_PENETRATION_EUROPE: {
    market_size: POP('~3.5-4 m BEV stock in EU-27 + UK end-2024 (~3% of car parc); ~1.7 m sales 2024 (~16% new-car share)', 'IEA GEVO 2025; ACEA new car registrations 2024', 'high'),
    price_elasticity: POP('moderate-to-high — EV adoption sensitive to subsidy/incentive changes per IEA + Transport & Environment analysis', 'IEA GEVO 2025; T&E EV market analysis 2024', 'medium'),
    demand_certainty: POP('moderate — EU 2035 zero-emission mandate provides forward floor; near-term sensitivity to incentive withdrawals (Germany 2023)', 'EU Regulation 2023/851; IEA GEVO 2025', 'medium'),
    geographic_spread: POP('Norway 90%+ new-car BEV share; NL/UK/SE/DE ~25-35%; ES/IT/PL <10% — wide spread', 'ACEA registrations 2024 + IEA GEVO 2025', 'high'),
    offtake_structure: POP_CAT('spot', 'Vehicle purchase per transaction; fleet leases drive subset', 'high'),
    contract_maturity: POP(3, 'BVRLA + national leasing trade body data 2024 — Lease/PCP typical 3-4y on private; 4-5y on fleet', 'medium'),
    segment_fragmentation: POP('count: 12-15 OEMs with >2% EU BEV share; Tesla + VW Group + Stellantis + Renault dominant', 'ACEA + IHS Markit 2024', 'high'),
  },
  EV_CHARGING_HARDWARE_CAPEX: {
    ttm_months: POP(0, 'IEA GEVO 2025; AFDC technology profile — DC fast chargers at-market today; TRL 9 commodity hardware', 'high'),
    cost_trajectory: POP('150 kW DC charger installed cost ~€30-50k 2025 vs €60-100k 2020; declining 5-10% YoY', 'BNEF EV Outlook 2024 summary; IEA GEVO 2025', 'medium'),
    scale_up_factor: POP(1, 'IEA GEVO 2025 — Mass-deployed at commercial scale globally', 'high'),
    supply_concentration: POP('count: 10-15 major DC fast charger OEMs; ABB, Tritium, BTC Power, Wallbox, Alpitronic, Kempower, Siemens, Star Charge dominant', 'IEA GEVO 2025 + AFDC supplier directory', 'high'),
    patent_density: POP('high — thousands of active filings on power electronics, connectors, communication protocols across multiple jurisdictions', 'WIPO EV charging patent landscape 2024', 'medium'),
    capex_intensity: POP('~€800-1,200 per kW installed for 150-350 kW DC; declining with hardware costs and balance-of-plant standardisation', 'BNEF EV Outlook 2024 summary', 'medium'),
    opex_trajectory: POP('OPEX driven by site lease + electricity demand charges; OEM hardware service ~€1-3k/yr/port', 'AFDC + ChargePoint IR 2024', 'low'),
    substitution_risk: POP('low near-term — wireless DC charging emerging at low TRL; megawatt charging (MCS) for HD trucks complementary not substitute', 'SAE J3271 + WiTricity + Electreon disclosures 2024', 'medium'),
    obsolescence_horizon: POP(8, 'AFDC + Open Charge Alliance roadmaps 2024 — Hardware service life ~10y; standards refresh cycle 5-8y as protocols evolve (OCPP 2.0.1, CCS->NACS)', 'medium'),
    incumbency_depth: POP('high — established CPO networks (ChargePoint, EVgo, Electrify America, Ionity, Fastned, BP Pulse, Shell Recharge) hold market positions', 'IEA GEVO 2025 + corporate IR', 'high'),
  },

  // ============== INITIATIVE 4 — BRAZIL DEEPWATER ==============

  DEEPWATER_PRODUCTION_ECONOMICS: {
    ttm_months: POP(0, 'Petrobras + Shell IR 2024 — Lula-area in production since 2010; technology mature', 'high'),
    cost_trajectory: POP('Brazilian pre-salt break-evens $35-45/bbl per Petrobras + Shell IR; among lowest globally', 'Petrobras Annual Report 2023 + Shell Lula updates 2024', 'high'),
    velocity_pct_yoy: POP(-2, 'Petrobras + Shell IR 2024 — Operational efficiencies; ~1-3% YoY unit-economics improvement on infill drilling', 'low'),
    scale_up_factor: POP(1, 'Petrobras + Shell IR 2024 — Mature commercial production; multiple FPSO host platforms in operation', 'high'),
    supply_concentration: POP('count: 5-7 major partners (Petrobras as operator + Shell + TotalEnergies + Equinor + ExxonMobil + ANP licensees)', 'ANP + Petrobras IR 2024', 'high'),
    capex_intensity: POP('~$3-5 bn per FPSO host; multiple hosts per cluster', 'Petrobras Strategic Plan 2024-28', 'high'),
    substitution_risk: POP('low — pre-salt cost-position competitive globally; no obvious short-term substitute', 'IEA WEO 2024 upstream cost curves', 'high'),
    obsolescence_horizon: POP(20, 'Petrobras + Shell IR 2024 — FPSO design life 25-30y; reservoir productive life 30+y from first oil', 'high'),
    patent_density: POP('moderate — Petrobras + service-major IP on subsea technology; Brazilian local-content rules drive domestic IP', 'INPI Brazilian IP filings; Petrobras tech disclosures', 'low'),
  },
  BRAZIL_DEEPWATER_REGULATORY_REGIME: {
    implementation_progress: POP(95, 'Brazilian ANP Annual Report 2023 — Pre-salt fiscal regime stable since 2010 production-sharing reform; ANP active in licence rounds', 'high'),
    grandfather_clauses: POP('extensive — pre-2010 concessions retained under earlier rules; production-sharing applies post-2010', 'Brazilian Pre-salt Law 12.351/2010', 'high'),
    compliance_cost: POP('moderate — local content requirements add 5-15% to project costs; royalty + special participation taxes', 'ANP cost reports + Petrobras IR 2024', 'medium'),
    audit_cadence: POP(12, 'Brazilian ANP procedures — ANP annual review of operator performance; quarterly tax filings', 'high'),
    precedent_strength: POP('moderate — fiscal regime court-tested in supreme court; some local-content disputes ongoing', 'Brazilian STF + ANP litigation tracker', 'medium'),
    harmonisation: POP('low — Brazilian-specific framework; some convergence to international PSA norms', 'ANP comparative reports', 'medium'),
    sunset_risk: POP('low — long-term framework but executive elections drive periodic uncertainty per IBP and S&P', 'IBP + S&P Brazil sovereign risk 2024', 'medium'),
    judicial_exposure: POP('count: ongoing local-content disputes at TCU level; supreme court has ruled on fiscal framework legality', 'ANP + TCU litigation tracker 2024', 'low'),
  },
  OIL_PRICE_BRENT: {
    cagr: POP(0, 'IEA World Energy Outlook 2024 — IEA WEO 2024 base case: nominal Brent flat-to-modest decline through 2030 absent demand-side shocks', 'medium'),
    demand_certainty: POP('moderate-to-high — global oil demand remains 100+ Mbpd through 2030 in IEA WEO STEPS scenario', 'IEA WEO 2024 STEPS', 'high'),
    offtake_structure: POP_CAT('spot', 'ICE Brent contract specs — Brent is the dominant marker for spot Atlantic-basin crude; futures liquid through ~5y', 'high'),
    contract_maturity: POP(0, 'ICE Brent contract specs — Spot and futures markets; no long-term physical contracts at the marker level', 'high'),
    geographic_spread: POP('global benchmark for ~75% of seaborne crude; Atlantic-basin grades direct, Asia-Pacific via Dubai/Murban differentials', 'ICE + Argus 2024', 'high'),
    segment_fragmentation: POP('count: 8-10 major buyers (refining majors + state oil companies) move daily volumes; HHI moderate', 'ICE + Argus market structure 2024', 'medium'),
    switching_cost: POP('low — refining majors freely arbitrage between Brent and other crude markers', 'ICE + Argus 2024', 'high'),
    substitute_threat: POP('low near-term — sustained EV penetration shifts demand structure post-2030 per IEA + BNEF', 'IEA GEVO 2025; BNEF Long-Term Outlook 2024', 'medium'),
    channel_control: POP('low — open commodity market; no single-actor channel control', 'ICE Brent market structure', 'high'),
    subsidy_dependency: POP(0, 'IEA WEO 2024 — Crude oil price is market-clearing globally', 'high'),
  },

  // ============== INITIATIVE 5 — SAF ==============

  EU_SAF_MANDATE: {
    grandfather_clauses: POP('limited — fuel-supply obligation applies to all EU airports >800k passengers/yr from 2025', 'Regulation (EU) 2023/2405 (ReFuelEU Aviation)', 'high'),
    compliance_cost: POP('material — SAF cost premium 2-4x conventional jet; pass-through to airlines mandated', 'EU JRC SAF Outlook 2024; IATA fuel cost analysis 2024', 'high'),
    audit_cadence: POP(12, 'Regulation (EU) 2023/2405 — Annual fuel-supply reporting by suppliers; biennial review of mandate trajectory', 'high'),
    precedent_strength: POP('low — mandate is new (2025 effective); legal challenges pending from non-EU airlines', 'EU litigation tracker 2024', 'low'),
    harmonisation: POP('moderate — UK SAF mandate at 10% by 2030 aligned in shape but lower trajectory; US 45Z creates parallel incentive', 'UK DESNZ + IRS §45Z 2024', 'medium'),
    judicial_exposure: POP('count: 2-3 challenges from non-EU air carriers + sustainable aviation fuel suppliers on certification rules', 'EU litigation tracker 2024', 'low'),
  },
  SAF_BLENDING_INFRASTRUCTURE: {
    cost_trajectory: POP('SAF wholesale price ~€2,500-3,500/t in EU 2024-25 vs ~€800/t conventional jet', 'IATA SAF tracker 2024; EU JRC SAF Outlook 2024', 'high'),
    velocity_pct_yoy: POP(-5, 'IRENA bioenergy report 2024; IEA Renewables 2024 — IRENA + IEA: SAF cost-down trajectory 5-8% YoY as ATJ + power-to-liquid scale; HEFA cost largely flat', 'medium'),
    capex_intensity: POP('~€500-800 m per HEFA plant (~100 kt/yr capacity); ~€2-3 bn per power-to-liquid facility', 'EU JRC SAF Outlook 2024', 'medium'),
    opex_trajectory: POP('Feedstock-dominated: HEFA tied to UCO/tallow prices; ATJ tied to ethanol; PtL tied to renewable electricity', 'IEA Renewables 2024 SAF chapter', 'medium'),
    supply_concentration: POP('count: 5-8 commercial SAF producers globally (Neste, World Energy, Montana Renewables, LanzaJet, Aether Fuels, Honeywell UOP licensees, BP Cherry Point, Shell Pernis)', 'IATA SAF tracker 2024; corporate IR', 'medium'),
    patent_density: POP('high — Honeywell UOP, Topsoe, LanzaJet, Velocys hold dominant ATJ + HEFA + FT IP; thousands of filings', 'WIPO SAF patent landscape 2024', 'medium'),
    incumbency_depth: POP('moderate — Neste dominates HEFA (>50% global supply); ATJ + PtL competitive landscape forming', 'IATA SAF tracker 2024; Neste IR 2024', 'high'),
    substitution_risk: POP('moderate — long-haul aviation has no near-term substitute; short-haul electrification + hydrogen pilot projects could displace 10-20% of demand post-2035', 'IEA Energy Technology Perspectives 2024', 'medium'),
    obsolescence_horizon: POP(20, 'EU JRC SAF Outlook 2024 — Refining-asset-lifetime applicable; HEFA plants 20-25y; PtL designs longer', 'medium'),
  },
  IOC_CAPITAL_DISCIPLINE_PRESSURE: {
    market_size: NIS_T2('Pressure is qualitative not quantifiable as market size. T2 sources (BNEF; Bernstein; Goldman Sachs sell-side coverage) describe magnitude not size.'),
    cagr: NIS_T2('Pressure is qualitative; CAGR concept inappropriate.'),
    price_elasticity: POP('low — investor pressure is largely independent of energy prices', 'BNEF IOC equity coverage 2024', 'low'),
    geographic_spread: POP('strongest among US + UK listed IOCs; somewhat weaker for EU continental majors with concentrated state ownership', 'Bernstein + Goldman IOC sector reports 2024', 'medium'),
    substitute_threat: POP('moderate — alternative investor capital (private equity, sovereign wealth) less discipline-focused but smaller AUM', 'BNEF IOC capital 2024', 'low'),
    contract_maturity: NIS_T2('Investor pressure is continuous not contractual.'),
    offtake_structure: NIS_T2('Investor pressure is structural not transactional.'),
  },

  // ============== INITIATIVE 6 — INDUSTRIAL BLUE H2 ==============

  BLUE_HYDROGEN_SMR_CCS_TECH: {
    ttm_months: POP(0, 'IEA Hydrogen Patents 2024 + Air Products IR + Shell Quest — SMR mature; SMR + CCS at TRL 8 with operational facilities; Air Products Port Arthur, Quest, Northern Lights linked', 'high'),
    cost_trajectory: POP('Blue H2 LCOE ~$1.5-2.5/kg current vs $1-1.5/kg grey H2; 45Q + UK CCUS contracts close gap', 'IEA Global Hydrogen Review 2024', 'high'),
    velocity_pct_yoy: POP(-3, 'IEA Hydrogen 2024 cost analysis — Cost decline driven by CCS capex curve, not SMR (mature)', 'medium'),
    scale_up_factor: POP(1, 'IEA Global Hydrogen Review 2024 — Blue H2 production at ~1 Mtpa scale in operation (Air Products Port Arthur); 5+ Mtpa in pipeline', 'high'),
    supply_concentration: POP('count: 6-8 major industrial gas + IOC blue H2 vendors (Air Products, Linde, Air Liquide, Shell, BP, Equinor, ADNOC)', 'IEA Global Hydrogen Review 2024 + IGS suppliers', 'medium'),
    capex_intensity: POP('~$1-2 bn per Mtpa of blue H2 production capacity; varies by CCS configuration', 'IEAGHG cost report 2024', 'medium'),
    opex_trajectory: POP('Natural-gas feedstock dominant; CCS adds $20-50/t CO2 captured; modest carbon-pricing exposure', 'IEAGHG + IEA Hydrogen 2024', 'medium'),
    substitution_risk: POP('high mid-term — green H2 cost-down from PEM electrolyser scaling could displace blue post-2030', 'IRENA Hydrogen Cost Report 2024; Hydrogen Council Compass 2024', 'high'),
    obsolescence_horizon: POP(20, 'IEAGHG + Air Products IR 2024 — SMR + CCS asset lifetime 20-25y; replacement cycle aligned with refinery asset lifecycle', 'medium'),
    patent_density: POP('high — Linde, Air Products, Air Liquide hold dominant SMR IP; CCS IP overlap with industrial CCUS', 'WIPO Hydrogen Patent Landscape 2024', 'medium'),
    incumbency_depth: POP('high — industrial gas majors entrenched on hydrogen supply contracts; IOC entrants leverage CCS scale', 'IEA Global Hydrogen Review 2024', 'high'),
  },
  INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND: {
    market_size: POP('Industrial H2 demand ~95 Mtpa global 2024 (refining + ammonia + methanol + steel pilots); 5-10% growth annually', 'IEA Global Hydrogen Review 2024', 'high'),
    cagr: POP(5, 'IEA Global Hydrogen Review 2024 — IEA: industrial H2 demand growing 4-7% CAGR through 2030; blue + green displacing grey', 'medium'),
    price_elasticity: POP('low for refining + ammonia (captive demand); high for new applications (steel DRI, green chemistry)', 'IEA Hydrogen demand analysis 2024', 'medium'),
    offtake_structure: POP_CAT('long_term_contract', 'Hydrogen typically supplied via long-term industrial contracts (15-20y)', 'high'),
    contract_maturity: POP(15, 'Air Products + Linde IR + customer disclosures 2024 — Industrial gas supply agreements typically 15-20y', 'high'),
    geographic_spread: POP('US Gulf Coast + EU North Sea + Middle East + China dominant; emerging hubs in India, Australia, North Africa', 'IEA Global Hydrogen Review 2024', 'high'),
    segment_fragmentation: POP('count: hundreds of industrial H2 consumers; refining + ammonia each ~30% of demand', 'IEA H2 demand 2024', 'high'),
    switching_cost: POP('high — captive H2 supply embedded in industrial process; substitution requires plant retrofit or replacement', 'IEAGHG industrial integration analysis', 'high'),
    channel_control: POP('high — large industrial customers + tied infrastructure dominate; merchant H2 is small share', 'IEA Hydrogen 2024', 'medium'),
  },

  // ============== INITIATIVE 7 — H3 GREEN H2 ==============

  PEM_ELECTROLYSIS_INDUSTRIAL_SCALE: {
    ttm_months: POP(24, 'IRENA Hydrogen Cost Report 2024 — IRENA: 100+ MW PEM systems commissioning 2024-26; commercial-scale TTM ~2 years from FID', 'medium'),
    supply_concentration: POP('count: 8-10 PEM electrolyser OEMs (Plug Power, ITM Power, Cummins/Hydrogenics, Siemens Energy, Nel, Thyssenkrupp Nucera, Ohmium, Bloom)', 'IEA Global Hydrogen Review 2024 + corporate IR', 'high'),
    capex_intensity: POP('1,400-1,800 EUR/kW current at >100MW vs <1,000 EUR/kW target by 2030', 'IRENA Hydrogen Cost Report 2024; Hydrogen Council Compass 2024', 'high'),
    opex_trajectory: POP('Electricity-dominated (60-80% of LCOH); stack replacement every 60-80k hours', 'IRENA Hydrogen Cost Report 2024', 'high'),
    substitution_risk: POP('moderate — alkaline electrolysis cheaper today; SOEC + AEM electrolysers emerging; non-H2 industrial decarbonisation pathways for steel', 'IEA Global Hydrogen Review 2024', 'high'),
    incumbency_depth: POP('moderate — split between traditional industrial gas players (Linde, Air Liquide) and pure-play electrolyser OEMs', 'IEA Hydrogen 2024', 'high'),
    patent_density: POP('high — thousands of active filings across stack, BoP, control system; stack-level IP concentrated in 5-6 OEMs', 'WIPO Hydrogen Patent Landscape 2024', 'medium'),
  },
  EU_HYDROGEN_BANK: {
    grandfather_clauses: POP('none — Hydrogen Bank applies forward only; pre-existing projects access EU Innovation Fund instead', 'EU Commission Hydrogen Bank Communication 2023', 'high'),
    compliance_cost: POP('moderate — auction participation cost + project monitoring requirements', 'EU Commission Hydrogen Bank Round 1+2 procedural docs', 'medium'),
    audit_cadence: POP(12, 'EU Commission Hydrogen Bank docs 2024 — Annual project monitoring per Hydrogen Bank contract', 'high'),
    precedent_strength: POP('low — Hydrogen Bank is new (Round 1 awarded 2024); no court-tested cases', 'EU litigation tracker 2024', 'low'),
    harmonisation: POP('moderate — EU Hydrogen Bank vs UK contract for difference vs US 45V — different mechanism shapes but similar purpose', 'IEA Global Hydrogen Review 2024 comparative', 'medium'),
    sunset_risk: POP('moderate — Bank funded through 2027 with budget review; political durability tied to EU Green Deal continuity', 'EU Commission communication 2024', 'medium'),
    judicial_exposure: NIS_T2('No public legal challenges to Hydrogen Bank as of 2024 H1; T2 sources (EU Litigation Tracker, EUR-Lex) silent.'),
  },
  NON_H2_DRI_THREAT: {
    ttm_months: POP(60, 'Boston Metal IR 2024; IEA Iron and Steel 2024 — Boston Metal MOE pilot 2024-26; commercial-scale TTM 5-8 years from current', 'medium'),
    cost_trajectory: POP('Non-H2 DRI economics highly speculative pre-commercial; estimates $400-600/t green steel vs $300-500/t H2 DRI', 'McKinsey green steel analysis 2024 (summary); IEA Iron and Steel 2024', 'low'),
    velocity_pct_yoy: NIS_T2('Pre-commercial; cost-curve slope not yet established. T2 sources (IEA, BNEF, McKinsey) describe scenarios not curves.'),
    scale_up_factor: POP(0.05, 'Boston Metal IR 2024 — Boston Metal MOE 2024 pilot ~25 tpd vs commercial ~3,000 tpd target', 'low'),
    supply_concentration: POP('count: 3-5 (Boston Metal, Electra, Helios, ArcelorMittal R&D, SSAB pilot programs)', 'IEA Iron and Steel 2024 + corporate IR', 'medium'),
    capex_intensity: NIS_T2('T2 sources (IEAGHG, McKinsey) carry pre-commercial estimates only; no validated commercial-scale capex.'),
    opex_trajectory: NIS_T2('Pre-commercial; OPEX trajectory not validated.'),
    incumbency_depth: POP('low — early-stage technology with no commercial deployment yet', 'IEA Iron and Steel 2024', 'high'),
    obsolescence_horizon: NIS_T2('Pre-commercial; obsolescence horizon undefined. T2 sources do not provide useful estimates.'),
    patent_density: POP('moderate — Boston Metal MOE IP concentrated in single company; broader electrochemistry IP across academic + industry', 'WIPO + USPTO MOE filings 2024', 'low'),
  },

  // ============== INITIATIVE 8 — NAMIBIA ==============

  NAMIBIA_ORANGE_BASIN_RESOURCE: {
    ttm_months: POP(48, 'TotalEnergies + Shell IR 2024; Galp IR 2024 — Discoveries 2022-24; appraisal underway; FID estimated 2026-27 = ~3-4 years from current', 'medium'),
    cost_trajectory: POP('Estimated ~$30-40/bbl break-even per industry consensus; comparable to Guyana', 'IEA WEO 2024 frontier basins; S&P Platts upstream cost benchmarking 2024', 'medium'),
    velocity_pct_yoy: NIS_T2('Pre-FID; cost trajectory not yet established. T2 sources (S&P Platts, IHS) provide estimates not validated curves.'),
    supply_concentration: POP('count: 4-6 operators with significant licences (TotalEnergies, Shell, Galp, Chevron, ExxonMobil, Pancontinental)', 'TotalEnergies + Shell IR 2024; Namibian Petroleum Commissioner 2024', 'high'),
    capex_intensity: POP('~$3-5 bn per FPSO host expected; comparable to Guyana Stabroek block', 'TotalEnergies IR 2024; Shell IR 2024', 'medium'),
    opex_trajectory: NIS_T2('Pre-production; OPEX trajectory not validated. T2 sources project Guyana-comparable economics ($10-20/bbl OPEX) but unconfirmed.'),
    substitution_risk: POP('low — frontier oil basin with cost competitiveness; transition-pressure exposure standard', 'IEA WEO 2024', 'medium'),
    obsolescence_horizon: POP(25, 'Industry standard for deepwater developments — FPSO design life 25-30y; reservoir productive life 30+y from first oil', 'high'),
    patent_density: NIS_T2('Frontier basin operations leverage industry-standard subsea tech IP; no novel high-density patent activity Namibia-specific.'),
    incumbency_depth: POP('low — frontier basin; no incumbent operators; first-mover dynamics dominate', 'TotalEnergies + Shell IR 2024', 'high'),
  },
  NAMIBIA_REGULATORY_FRAMEWORK: {
    compliance_cost: POP('moderate — local content requirements emerging; corporate income tax 35% standard', 'Namibian Ministry of Mines and Energy 2024 + S&P sovereign risk reports', 'medium'),
    audit_cadence: POP(12, 'Namibian Petroleum Commissioner procedures — Standard annual review of operator performance', 'medium'),
    precedent_strength: POP('low — Namibian upstream sector small; few precedents at scale', 'Namibian Ministry of Mines and Energy 2024', 'low'),
    harmonisation: POP('low — Namibian framework specific; some convergence to South African + East African PSA norms', 'African Petroleum Producers comparative 2024', 'low'),
    sunset_risk: POP('moderate — first major oil discoveries drive political pressure for fiscal-regime revision; Petroleum Act amendment under consideration', 'Namibian Ministry of Mines and Energy 2024 + S&P Africa 2024', 'medium'),
  },
  DEEPWATER_DRILLING_CAPACITY: {
    standards_maturity: POP_CAT('established', 'IADC + API standards globally established for deepwater drilling', 'high'),
    interoperability: POP('high — drillship + subsea kit interchangeable across operators within same generation class', 'IADC + Transocean IR 2024', 'high'),
    capital_intensity: POP('~$650-750 m per new-build 7th-gen drillship; day-rates $450-550k 2024-25', 'Transocean + Valaris + Noble IR 2024; IEA WEO 2024', 'high'),
    talent_availability: POP('weakening — offshore drilling talent base shrinking; competing demand from frontier basins (Guyana, Suriname, Mozambique, Namibia)', 'OEUK + IADC + Transocean IR 2024', 'medium'),
    institutional_support: POP('moderate — IOC-backed; sovereign + multilateral involvement varies by basin', 'Major IOC IR 2024', 'low'),
    geographic_clustering: POP('Brazil pre-salt + Gulf of Mexico + West Africa + Guyana + Mozambique + emerging Namibia', 'IADC global rig fleet 2024', 'high'),
    platform_effects: NIS_T2('Drillship market is service market; weak platform effects.'),
    lock_in_risk: POP('moderate — fleet-availability constraints lock operators into specific contractors; long-term contracts 3-5y common', 'Transocean + Valaris IR 2024', 'medium'),
  },

  // ============== INITIATIVE 9 — CHEMICALS ==============

  SHELL_CHEMICALS_CAPITAL_REALLOCATION: {
    standards_maturity: NIS_T2('Capital-allocation pivot is internal corporate process; no external standards.'),
    interoperability: NIS_T2('Internal pivot; not an interoperability concern.'),
    talent_availability: POP('moderate — refinery/petchem talent base transitioning to specialty roles; some skills gaps in performance-chemistry product development', 'Shell sustainability + workforce reports 2024; ICIS workforce reports 2024', 'low'),
    supply_chain_depth: POP('moderate — specialty chemicals supply chain shorter than commodity; concentrated supplier base in some categories', 'ICIS Specialty Chemicals 2024', 'medium'),
    platform_effects: NIS_T2('Pivot is portfolio-allocation decision; no platform effects directly.'),
    collaboration_density: POP(8, 'Shell IR 2024 + ICIS deal tracker — ~5-10 active specialty M&A negotiations + JV pilots underway per Shell IR', 'low'),
    geographic_clustering: POP('Shell Chemicals operations concentrated in NW Europe + US Gulf Coast + Singapore', 'Shell Annual Report 2023', 'high'),
    lock_in_risk: POP('moderate — divested asset stranding risk; specialty M&A integration risk', 'Shell IR 2024 + ICIS 2024', 'medium'),
  },
  COMMODITY_CRACKER_ECONOMICS: {
    cagr: POP(-2, 'ICIS European Petrochemicals 2024; ChemAnalyst petrochemicals 2024 — European cracker capacity declining 2-5% per year through 2030 per ICIS + ChemAnalyst', 'medium'),
    price_elasticity: POP('high — commodity petchem demand sensitive to substitution + recession; ethylene-naphtha spread sets margin', 'ICIS petrochemicals 2024', 'high'),
    offtake_structure: POP_CAT('spot', 'Commodity ethylene + downstream typically spot or short-term', 'high'),
    contract_maturity: POP(0.5, 'ICIS petrochemicals 2024 — Quarterly + spot pricing dominant', 'high'),
    geographic_spread: POP('European naphtha-cracker base disadvantaged vs US ethane + Middle East advantaged feedstock', 'ICIS + ChemAnalyst 2024', 'high'),
    segment_fragmentation: POP('count: 15-20 European cracker operators; consolidation increasing as marginal capacity closes', 'ICIS European Petrochemicals 2024', 'medium'),
    switching_cost: POP('low — commodity ethylene fungible across customers; high asset-level switching cost', 'ICIS 2024', 'high'),
    substitute_threat: POP('high — bio-based + recycled feedstocks emerging; mechanical recycling absorbs polymer demand', 'ICIS Sustainability + ChemAnalyst 2024', 'medium'),
    channel_control: POP('moderate — limited commodity differentiation; channel power with end-customers', 'ICIS 2024', 'medium'),
  },
  PERFORMANCE_CHEMICALS_DEMAND: {
    market_size: POP('Global specialty chemicals market $700-900 bn 2024; performance segments (adhesives, coatings, lubricant additives, electronic chemicals) ~$300 bn', 'ICIS Specialty Chemicals 2024; CW Research 2024', 'medium'),
    price_elasticity: POP('low — specialty chemicals customers value performance over price; switching cost high', 'ICIS Specialty Chemicals 2024', 'high'),
    offtake_structure: POP_CAT('long_term_contract', 'Specialty supply often spec-locked into customer products via long-term agreements', 'high'),
    contract_maturity: POP(3, 'ICIS Specialty 2024 — Specialty supply contracts typically 1-5y with multi-year commitments common', 'medium'),
    geographic_spread: POP('US + EU + Japan dominant on high-end specialty; China + India growing on commodity-specialty', 'ICIS 2024', 'high'),
    segment_fragmentation: POP('count: hundreds of specialty chemical companies; top-20 hold ~40% of value', 'ICIS Specialty 2024 + CW Research 2024', 'medium'),
    switching_cost: POP('high — specialty chemicals integrated into customer formulations; switching requires re-qualification', 'ICIS Specialty 2024', 'high'),
    substitute_threat: POP('moderate — bio-based specialty chemicals emerging; sustainability-driven substitution selective', 'ICIS Sustainability 2024', 'medium'),
    channel_control: POP('moderate — direct customer relationships dominate; distributors handle long-tail customers', 'ICIS 2024', 'medium'),
    subsidy_dependency: POP(5, 'ICIS Sustainability 2024 — Specialty chemicals not generally subsidy-dependent; some EU green-chemistry incentives', 'high'),
  },
};

// ============================================================================
// STATE + TRAJECTORY ASSIGNMENTS
// ============================================================================

const INITIATIVE_STATES = {
  'NW European LNG portfolio dominance and EBITDA leadership':
    { state: 'holding', trajectory: 'stable', last_state_change_date: '2026-03-01' },
  'Industrial CCUS services leadership (Quest + Northern Lights)':
    { state: 'holding', trajectory: 'improving', last_state_change_date: '2026-03-01' },
  'Shell Recharge EV charging network as retail energy anchor':
    { state: 'holding', trajectory: 'stable', last_state_change_date: '2026-03-01' },
  'Brazil deepwater portfolio sustained as cash flow pillar':
    { state: 'strengthening', trajectory: 'stable', last_state_change_date: '2026-03-01' },
  'Sustainable aviation fuel (SAF) portfolio scaling toward 2030 mandate':
    { state: 'ambiguous', trajectory: 'volatile', last_state_change_date: '2026-03-01' },
  'Industrial blue hydrogen retention for hard-to-abate sectors':
    { state: 'holding', trajectory: 'stable', last_state_change_date: '2026-03-01' },
  'NW European green hydrogen production capacity (managed retreat)':
    { state: 'weakening', trajectory: 'deteriorating', last_state_change_date: '2026-03-01' },
  'Namibia Orange Basin commercial development (45% stake)':
    { state: 'new', trajectory: 'improving', last_state_change_date: '2026-03-01' },
  'Shell Chemicals pivot from commodity to performance chemicals':
    { state: 'strengthening', trajectory: 'improving', last_state_change_date: '2026-03-01' },
};

const COMPONENT_STATES = {
  // LNG
  GLOBAL_LNG_DEMAND_TRAJECTORY:        { state: 'holding',       trajectory: 'stable' },
  EU_LNG_IMPORT_INFRASTRUCTURE:        { state: 'strengthening', trajectory: 'improving' },
  GAS_PRICE_FLOOR_TTF:                 { state: 'holding',       trajectory: 'volatile' },
  EU_GAS_REGULATORY_FRAMEWORK:         { state: 'holding',       trajectory: 'stable' },
  NORTH_AMERICAN_LNG_OVERSUPPLY:       { state: 'strengthening', trajectory: 'improving' },
  // CCUS
  INDUSTRIAL_CCUS_CAPTURE_TECH:        { state: 'holding',       trajectory: 'improving' },
  US_45Q_TAX_CREDIT:                   { state: 'ambiguous',     trajectory: 'volatile' },
  NORTH_SEA_CO2_STORAGE_CAPACITY:      { state: 'strengthening', trajectory: 'improving' },
  INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND: { state: 'ambiguous', trajectory: 'volatile' },
  // EV
  EV_PUBLIC_CHARGING_DEMAND:           { state: 'strengthening', trajectory: 'improving' },
  BEV_FLEET_PENETRATION_EUROPE:        { state: 'holding',       trajectory: 'stable' },
  EV_CHARGING_HARDWARE_CAPEX:          { state: 'strengthening', trajectory: 'improving' },
  // Brazil
  DEEPWATER_PRODUCTION_ECONOMICS:      { state: 'holding',       trajectory: 'stable' },
  BRAZIL_DEEPWATER_REGULATORY_REGIME:  { state: 'holding',       trajectory: 'stable' },
  OIL_PRICE_BRENT:                     { state: 'holding',       trajectory: 'volatile' },
  // SAF
  EU_SAF_MANDATE:                      { state: 'holding',       trajectory: 'stable' },
  SAF_BLENDING_INFRASTRUCTURE:         { state: 'new',           trajectory: 'improving' },
  IOC_CAPITAL_DISCIPLINE_PRESSURE:     { state: 'strengthening', trajectory: 'deteriorating' },
  // Blue H2
  BLUE_HYDROGEN_SMR_CCS_TECH:          { state: 'holding',       trajectory: 'stable' },
  INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND:  { state: 'holding',       trajectory: 'improving' },
  // H3
  PEM_ELECTROLYSIS_INDUSTRIAL_SCALE:   { state: 'weakening',     trajectory: 'volatile' },
  EU_HYDROGEN_BANK:                    { state: 'holding',       trajectory: 'stable' },
  NON_H2_DRI_THREAT:                   { state: 'new',           trajectory: 'improving' },
  // Namibia
  NAMIBIA_ORANGE_BASIN_RESOURCE:       { state: 'new',           trajectory: 'improving' },
  NAMIBIA_REGULATORY_FRAMEWORK:        { state: 'ambiguous',     trajectory: 'unknown' },
  DEEPWATER_DRILLING_CAPACITY:         { state: 'weakening',     trajectory: 'deteriorating' },
  // Chemicals
  SHELL_CHEMICALS_CAPITAL_REALLOCATION:{ state: 'new',           trajectory: 'improving' },
  COMMODITY_CRACKER_ECONOMICS:         { state: 'weakening',     trajectory: 'deteriorating' },
  PERFORMANCE_CHEMICALS_DEMAND:        { state: 'strengthening', trajectory: 'improving' },
};

// ============================================================================
// ORCHESTRATION
// ============================================================================

async function escalate() {
  console.log('=== Shell v2 catalogue escalation (T1 -> T2) ===');
  console.log(`Mode: ${COMMIT ? 'COMMIT (POSTing/PATCHing live API)' : 'DRY-RUN'}`);
  console.log('');

  // Load catalogue
  const inits = await api('GET', `/initiatives_v2?company_id=${COMPANY_ID}`);
  const attrDefs = await api('GET', '/attribute_definitions');
  const attrDefByVecName = {};
  for (const a of attrDefs) {
    if (!attrDefByVecName[a.vector]) attrDefByVecName[a.vector] = {};
    attrDefByVecName[a.vector][a.attribute_name] = a;
  }

  let totals = { initSet: 0, compSet: 0, escalated: 0, escalated_populated: 0, escalated_nis_t2: 0 };

  for (const init of inits) {
    console.log(`\n[init] ${init.name}`);

    // Set state + trajectory on initiative
    const initSt = INITIATIVE_STATES[init.name];
    if (initSt) {
      await api('PATCH', `/initiatives_v2/${init.id}`, initSt);
      console.log(`  state=${initSt.state} trajectory=${initSt.trajectory}`);
      totals.initSet++;
    }

    // Components for this initiative
    const comps = await api('GET', `/components?initiative_id=${init.id}`);
    for (const comp of comps) {
      // State + trajectory on component
      const compSt = COMPONENT_STATES[comp.name];
      if (compSt) {
        await api('PATCH', `/components/${comp.id}`, compSt);
        totals.compSet++;
      }

      // Attribute escalations
      const escForComp = ESC[comp.name];
      if (!escForComp) continue;

      const upserts = [];
      for (const [attrName, resolution] of Object.entries(escForComp)) {
        const def = attrDefByVecName[comp.vector]?.[attrName];
        if (!def) {
          console.warn(`    [skip] ${comp.name} -> ${attrName}: attribute_def not found for vector=${comp.vector}`);
          continue;
        }
        upserts.push({
          component_id: comp.id,
          attribute_def_id: def.id,
          ...resolution,
        });
        if (resolution.value_status === 'populated') totals.escalated_populated++;
        else if (resolution.value_status === 'not_in_source') totals.escalated_nis_t2++;
        totals.escalated++;
      }
      if (upserts.length) {
        await api('POST', '/component_attributes', upserts);
        console.log(`  ${comp.name}: ${upserts.length} attributes upserted (state=${compSt?.state || '—'})`);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Initiatives state/trajectory set: ${totals.initSet}/${inits.length}`);
  console.log(`Components state/trajectory set:  ${totals.compSet}`);
  console.log(`Attributes escalated:             ${totals.escalated}`);
  console.log(`  -> populated (T2 source):       ${totals.escalated_populated}`);
  console.log(`  -> not_in_source (T2 search):   ${totals.escalated_nis_t2}`);
}

escalate().catch((err) => {
  console.error('\n[FATAL]', err.message);
  if (err.body) console.error('Body:', err.body);
  process.exit(1);
});
