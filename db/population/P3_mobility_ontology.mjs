#!/usr/bin/env node
// P3_mobility_ontology.mjs — populates the ontology layer with the mobility
// technology stack, anchored on the VW Group + Skoda + Porsche components
// populated overnight (2026-05-07).
//
// Methodology: /docs/methodology/ontology_population_procedure.md v1.3.
//   Step 1 — pairs derived from the VWG-anchored mobility stack
//   Step 2 — source classification (URLs fetched 2026-05-07)
//   Step 3 — horizon classification per rubric
//   Step 4 — adjacency identification (>=2 per pair)
//   Step 5 — linkage to client components (4 VWG-stack components)
//   Step 6 — confidence band + analyst-review flagging
//   Step 7 — self-marking output (incl. cross-client edge counts)
//
// Run:
//   node db/population/P3_mobility_ontology.mjs                  # dry-run
//   node db/population/P3_mobility_ontology.mjs --commit --confirm-yes
//
// Idempotent. Re-runs:
//   technologies, applications, pairs, component_pair_links — UPSERT
//   pair_evidence, pair_adjacencies — DELETE-AND-REINSERT for the pairs touched

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
console.log(`=== Population — mobility ontology (Phase 3) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// ============================================================================
// 10 technologies
// ============================================================================
const TECHNOLOGIES = [
  {
    name: 'battery_electric_vehicle_platform',
    label: 'BEV platform (passenger)',
    tech_function: null,
    description: 'Dedicated battery-electric vehicle platform — skateboard architecture with high-voltage pack, integrated motor + power electronics, regenerative braking, dedicated thermal management. VW MEB / Tesla AP3 / Hyundai E-GMP / GM Ultium are commercial reference platforms. Cell chemistry agnostic at the platform level.',
    current_trl: 9, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -12, cost_trajectory_unit: 'pct_per_year_BOM',
    substitution_risk: 'emerging',
    source_citation: 'IEA Global EV Outlook 2024; BNEF Electric Vehicle Outlook 2025',
  },
  {
    name: 'software_defined_vehicle_platform',
    label: 'Software-defined vehicle (SDV) platform',
    tech_function: null,
    description: 'Centralised + zonal E/E architecture with abstracted hardware, OTA-updatable software stack, high-bandwidth in-vehicle networking. Tesla AP4, VW SSP (in development), Stellantis STLA Brain, Ford "skunkworks", Rivian R1.5. Distinct from the legacy "many-ECU" architecture; the substrate that enables OTA, paid-feature unlocks, and AI in-vehicle.',
    current_trl: 7, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: null, cost_trajectory_unit: null,
    substitution_risk: 'none',
    source_citation: 'McKinsey Outlook on the automotive software and electronics market through 2030; Volkswagen Group Annual Report 2024',
  },
  {
    name: 'adas_l2_plus_systems',
    label: 'ADAS L2+ / supervised autonomy',
    tech_function: null,
    description: 'Driver-monitoring + lane-centring + adaptive cruise + auto-lane-change ADAS systems requiring driver supervision (SAE L2). Includes Mobileye SuperVision, GM Super Cruise, Ford BlueCruise, Mercedes Drive Pilot (L3 in geofenced markets), Tesla FSD (Supervised). Camera + radar + map-anchored.',
    current_trl: 9, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -15, cost_trajectory_unit: 'pct_per_year_chip_BOM',
    substitution_risk: 'active',
    source_citation: 'Mobileye Q4 and Full-Year 2024 Results; McKinsey ADAS sector reports',
  },
  {
    name: 'adas_l4_autonomous_systems',
    label: 'ADAS L4 / autonomous driving',
    tech_function: null,
    description: 'Full driving automation under defined operational design domain — robotaxi services (Waymo, Cruise, Baidu Apollo Go, Pony.ai). Eyes-off, hands-off; system handles all dynamic driving tasks. Pre-commercial at consumer scale; commercial fleet operations geographically constrained.',
    current_trl: 6, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: null, cost_trajectory_unit: null,
    substitution_risk: 'none',
    source_citation: 'Mobileye Chauffeur disclosure; Waymo + Cruise operator updates',
  },
  {
    name: 'silicon_carbide_power_electronics',
    label: 'SiC power electronics (automotive)',
    tech_function: 'fast_ev_charging_dc',
    description: 'Wide-bandgap SiC MOSFET-based power semiconductor devices for traction inverters, on-board chargers, DC fast chargers. Higher switching frequency + lower switching losses than IGBT silicon — ~5-10% range improvement at constant pack size. Tesla Model 3 / Y, Hyundai E-GMP, Lucid, BYD use SiC; legacy OEMs transitioning 2024-2027.',
    current_trl: 8, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -8, cost_trajectory_unit: 'pct_per_year_device',
    substitution_risk: 'emerging',
    source_citation: 'Yole Group Power SiC/GaN Compound Semiconductor Market Monitor 2024; Wolfspeed company filings',
  },
  {
    name: 'vehicle_to_grid_technology',
    label: 'Vehicle-to-grid (V2G)',
    tech_function: null,
    description: 'Bidirectional charging hardware + grid-services aggregation that allows EV battery packs to discharge to the grid for ancillary services / frequency response / peak shaving. Requires CCS or NACS bidirectional spec, V2G-certified vehicle, aggregator software, utility tariff. Octopus + Nissan Leaf flagship UK deployment; Tesla Cybertruck Powershare in Texas.',
    current_trl: 7, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: null, cost_trajectory_unit: null,
    substitution_risk: 'none',
    source_citation: 'Octopus Energy Powerloop UK programme; California PUC Rule 21 V2G framework',
  },
  {
    name: 'solid_state_battery_automotive',
    label: 'Solid-state batteries (automotive)',
    tech_function: null,
    description: 'Lithium-metal anode + solid electrolyte (sulfide / oxide / polymer) — higher energy density (theoretically 400-500 Wh/kg vs ~250 for high-end Li-ion), faster charging, improved safety. Toyota / Idemitsu sulfide programme (commercial 2027-2028 target); Samsung SDI / SK On / CATL semi-solid programmes; QuantumScape pre-commercial. Pre-FOAK at automotive scale.',
    current_trl: 5, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: null, cost_trajectory_unit: null,
    substitution_risk: 'none',
    source_citation: 'BNEF Electric Vehicle Outlook 2025 (700 GWh announced solid-state capacity China); Toyota / Samsung SDI operator disclosures',
  },
  {
    name: 'lfp_battery_chemistry',
    label: 'LFP battery chemistry',
    tech_function: null,
    description: 'Lithium iron phosphate (LiFePO4) cell chemistry. Lower energy density than NMC (~150-180 Wh/kg pack vs 220-260 for high-nickel) but materially cheaper, longer cycle life, no cobalt, thermally safer. Dominant chemistry in China (CATL, BYD); rapidly displacing NMC in entry-level EVs globally. VW Unified Cell + Tesla standard-range packs are LFP.',
    current_trl: 9, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: -10, cost_trajectory_unit: 'pct_per_year_pack',
    substitution_risk: 'emerging',
    source_citation: 'IEA Global EV Outlook 2024 trends in batteries; Volkswagen PowerCo Unified Cell disclosure',
  },
  {
    name: 'automotive_ota_update_platform',
    label: 'OTA software update platform (automotive)',
    tech_function: null,
    description: 'Over-the-air firmware and software update infrastructure — secure boot chain, A/B partition, signing keys, telematics back-end, fleet rollout staging. Tesla benchmark since 2012; legacy OEMs catching up via SDV programmes (BMW iX, Mercedes MMA, Ford SYNC4A). Critical substrate for SDV value capture (paid features, recalls without dealer visits).',
    current_trl: 8, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: null, cost_trajectory_unit: null,
    substitution_risk: 'none',
    source_citation: 'McKinsey automotive software outlook; Tesla operator history',
  },
  {
    name: 'automotive_grade_semiconductors',
    label: 'Automotive-grade semiconductors (SoC/MCU)',
    tech_function: null,
    description: 'Automotive-qualified system-on-chip (Mobileye EyeQ, Nvidia Drive, Qualcomm Snapdragon Ride, Tesla FSD chip) and microcontroller (NXP S32, Renesas RH850, Infineon AURIX) families. AEC-Q100 grade-2/3, ISO 26262 ASIL-D capable. Yole assesses $132B automotive semiconductor market overall.',
    current_trl: 9, trl_as_of_date: '2024-12-31',
    cost_trajectory_pct_yoy: 0, cost_trajectory_unit: 'stable_unit_pricing',
    substitution_risk: 'none',
    source_citation: 'Yole Group automotive semiconductor market report 2024 ($132B race); McKinsey ECU/DCU $144B 2030 forecast',
  },
];

// ============================================================================
// 7 applications
// ============================================================================
const APPLICATIONS = [
  {
    name: 'passenger_car_electrification',
    label: 'Passenger car electrification',
    domain: 'transport',
    description: 'Conversion of the passenger car fleet from ICE / hybrid to BEV (and PHEV residually). 18% global new car sales 2023 per IEA; 25% projected for 2025 per BNEF. Markets at very different stages: China >35%, Norway >90%, Europe ~22%, US <10%, India + Japan low single digits.',
    market_maturity: 'growing',
    source_citation: 'IEA Global EV Outlook 2024; BNEF Electric Vehicle Outlook 2025',
  },
  {
    name: 'commercial_vehicle_electrification',
    label: 'Commercial vehicle electrification',
    domain: 'transport',
    description: 'Heavy-duty truck (Class 8 / N3), medium-duty truck, urban bus, last-mile delivery van electrification. Daimler eActros, Volvo FH Electric, Tesla Semi, BYD electric trucks; MAN eTruck, Scania BEV. Far behind passenger BEV — duty cycle / payload / charging-infrastructure constraints.',
    market_maturity: 'emerging',
    source_citation: 'IEA Global EV Outlook 2024 outlook for electric mobility (commercial vehicle scenarios)',
  },
  {
    name: 'premium_ev_market',
    label: 'Premium EV market',
    domain: 'transport',
    description: 'EV segment at >€80k transaction price — Porsche Taycan, Mercedes EQS, BMW i7, Audi e-tron GT, Lucid Air, Tesla Model S, BYD Han. Buyer pool willing to pay for performance, range, charging speed, brand. The market segment where solid-state batteries and 800V architecture would land first commercially.',
    market_maturity: 'growing',
    source_citation: 'Porsche AG investor disclosures; Mercedes-Benz EV pricing 2024',
  },
  {
    name: 'autonomous_passenger_transport',
    label: 'Autonomous passenger transport (L4 robotaxi)',
    domain: 'transport',
    description: 'Geofenced eyes-off / hands-off robotaxi services. Waymo (Phoenix, SF, LA, Austin); Cruise (paused 2023, restarting 2025); Baidu Apollo Go (Wuhan, Beijing, Shenzhen); Pony.ai; Tesla planned 2025-2026 robotaxi. Pre-FOAK at consumer scale; commercial in geographically narrow ODDs only.',
    market_maturity: 'frontier',
    source_citation: 'Waymo / Baidu operator updates 2024',
  },
  {
    name: 'grid_services_vehicle_integration',
    label: 'Grid services via EV fleet integration',
    domain: 'cross_domain',
    description: 'EV fleet aggregated as a virtual power plant providing frequency response, peak shaving, capacity reserve, balancing services to electricity grid operators. Octopus Powerloop (UK National Grid Balancing Mechanism trial); CAISO V2G pilot; ERCOT Tesla Powershare. Pre-commercial at scale; revenue mechanism £400-£800/yr per UK Octopus tariff.',
    market_maturity: 'emerging',
    source_citation: 'Octopus Energy Powerloop disclosures; California PUC Rule 21 framework',
  },
  {
    name: 'ev_charging_infrastructure',
    label: 'EV charging infrastructure',
    domain: 'transport',
    description: 'Public + workplace + depot DC fast (>=50kW) and AC (<= 22kW) chargers. Tesla Supercharger / NACS opening, Ionity, Electrify America, BP Pulse, Shell Recharge, ChargePoint, EVgo. Bidirectional / V2G-capable subset is small but growing. Standardisation: CCS in EU, NACS converging in US.',
    market_maturity: 'growing',
    source_citation: 'IEA Global EV Outlook 2024 charging chapter',
  },
  {
    name: 'vehicle_software_platform_oe',
    label: 'OEM vehicle software platform',
    domain: 'transport',
    description: 'OEM-owned in-vehicle software stack — operating system, middleware, driver applications, cloud back-end. VW CARIAD VW.OS / SSP, Mercedes MB.OS, BMW Operating System 9, Stellantis STLA Brain, GM Ultifi, Ford SYNC4A. Distinct from third-party stacks (Android Automotive, BlackBerry QNX). The competitive moat OEMs are building against Tesla and Chinese SDV-natives.',
    market_maturity: 'emerging',
    source_citation: 'McKinsey automotive software outlook 2030; VW Annual Report 2024 CARIAD section',
  },
];

// ============================================================================
// 15 pairs
// ============================================================================
const PAIRS = [
  // ---- PAIR 01 ----
  {
    label: 'BEV platform × passenger car electrification',
    technology: 'battery_electric_vehicle_platform', application: 'passenger_car_electrification',
    horizon: 'H1', confidence: 'high', trajectory: 'improving',
    horizon_reasoning: 'H1 markers all met: ≥3 commercial-scale platforms operating (Tesla AP3, VW MEB, Hyundai E-GMP, GM Ultium), >14 million global passenger BEV sales 2023 per IEA, regulatory frameworks in force (EU 2035 ICE phase-out adopted; California ZEV; China dual-credit), capital flowing without subsidy gating in core markets, standardised offtake (consumer retail). Cost trajectory clear and approaching parity (BNEF: battery packs declined 90%+ since 2010).',
    confidence_reasoning: 'Multiple hard-evidence rows (IEA government_data; VW PowerCo company_filing). Cross-source agreement on volume + chemistry trajectory. Hard evidence count expected ≥2 post-trigger.',
    trajectory_reasoning: 'Sales accelerating through 2025 (BNEF projects 1 in 4 cars 2025); LFP cost reductions widening accessible price points; charging infrastructure ramping.',
    flag: false,
  },
  // ---- PAIR 02 ----
  {
    label: 'BEV platform × commercial vehicle electrification',
    technology: 'battery_electric_vehicle_platform', application: 'commercial_vehicle_electrification',
    horizon: 'H2', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: FOAK + early commercial operating (Daimler eActros 600 in production; Volvo FH Electric in delivery; Tesla Semi customer pilots since 2022). FIDs being considered 2026-2030 by Daimler Truck, Volvo, Traton. Subsidy-dependent (US IRA 45W commercial clean vehicle credit; EU CO2 truck regulation). Cost trajectory clear but TCO parity application-dependent (urban delivery yes; long-haul not yet).',
    confidence_reasoning: 'IEA EVO 2024 outlook scenarios + BNEF as medium-strength industry sources. No peer-reviewed cost-trajectory paper cited in this evidence set; medium is the honest call.',
    trajectory_reasoning: 'Commercial vehicle electrification lagging passenger but accelerating — IEA scenarios show 35% truck sales electric by 2035 in APS.',
    flag: false,
  },
  // ---- PAIR 03 ----
  {
    label: 'Software-defined vehicle platform × OEM vehicle software platform',
    technology: 'software_defined_vehicle_platform', application: 'vehicle_software_platform_oe',
    horizon: 'H2', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: Tesla SDV operating commercial since AP3 (2019); legacy OEMs in transition (VW SSP target 2026, recently slipped 18+ months; Mercedes MB.OS 2025 launch on MMA; BMW OS9 in series). Cost trajectory unclear — software amortisation favours scale players; OEM software losses continue. Subsidy support absent; market-driven competitive necessity.',
    confidence_reasoning: 'McKinsey 2030 analyst report (medium-high) + VW Annual Report 2024 (company_filing high). Mix of types lands at medium confidence with hard_evidence_count=1 — would-be-high pending one more hard source.',
    trajectory_reasoning: 'OEM SDV programmes accelerating but execution mixed — VW CARIAD reorganisations dampen pace.',
    flag: false,
  },
  // ---- PAIR 04 ----
  {
    label: 'Software-defined vehicle platform × passenger car electrification',
    technology: 'software_defined_vehicle_platform', application: 'passenger_car_electrification',
    horizon: 'H2', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: SDV-native passenger BEVs operating commercial scale (Tesla, Xpeng, NIO, Li Auto, BYD); legacy OEMs delivering SDV-grade BEVs in early commercial (Mercedes EQS, BMW iX, Hyundai Ioniq 6). FIDs and platform commitments 2026-2030 across all major Western OEMs. Subsidy-neutral.',
    confidence_reasoning: 'McKinsey market sizing + VW annual report. Medium confidence reflects execution heterogeneity across OEMs.',
    trajectory_reasoning: 'Co-development of SDV + BEV platforms is the dominant industry direction; trajectory unambiguous even if individual OEM execution variable.',
    flag: false,
  },
  // ---- PAIR 05 ----
  {
    label: 'ADAS L2+ × passenger car electrification',
    technology: 'adas_l2_plus_systems', application: 'passenger_car_electrification',
    horizon: 'H1', confidence: 'high', trajectory: 'holding',
    horizon_reasoning: 'H1 markers: 200+ million Mobileye EyeQ chips shipped to date (Mobileye FY 2024); ADAS L2+ standard equipment on premium passenger vehicles globally; commercial-scale deployments across Mercedes Drive Pilot, GM Super Cruise, Ford BlueCruise, Tesla FSD (Supervised), Mobileye SuperVision. Regulatory frameworks in force (UNECE R157 for L3 in Europe; US NHTSA AV 4.0 framework). Cost trajectory clear (-15%/yr per the user supplied tech metadata).',
    confidence_reasoning: 'Mobileye Q4 2024 + 10-Q Q3 2024 (company_filing high) document deployment volumes; cross-source consistency.',
    trajectory_reasoning: 'Holding rather than improving — Mobileye Q4 2024 revenue down 23% reflecting BEV slowdown impacting ADAS volumes; the technology is mature but unit economics under pressure.',
    flag: false,
  },
  // ---- PAIR 06 ----
  {
    label: 'ADAS L4 / autonomous × autonomous passenger transport',
    technology: 'adas_l4_autonomous_systems', application: 'autonomous_passenger_transport',
    horizon: 'H3', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H3 markers: technology demonstrated but not at commercial scale; FOAK robotaxi services geographically constrained (Waymo phoenix/SF/LA/Austin only; Cruise paused; Baidu Apollo Go in 3 Chinese cities). Applications speculative or pre-FID at scale (Tesla robotaxi 2025 promise unproven). Regulatory frameworks formative (no nationwide L4 framework anywhere; ad hoc state / city permits). Cost trajectory unclear; per-vehicle hardware $50-100k range.',
    confidence_reasoning: 'Mobileye Chauffeur disclosure + Waymo / Baidu operator updates. Single hard-evidence row + medium operator disclosures land at medium confidence.',
    trajectory_reasoning: 'Improving — Waymo passenger trip count >1M/wk by end-2024; geographic expansion accelerating; Mobileye Chauffeur start-of-production with VW Group is the structural commercialisation milestone.',
    flag: false,
  },
  // ---- PAIR 07 ----
  {
    label: 'SiC power electronics × passenger car electrification',
    technology: 'silicon_carbide_power_electronics', application: 'passenger_car_electrification',
    horizon: 'H1', confidence: 'high', trajectory: 'improving',
    horizon_reasoning: 'H1 markers: ≥3 commercial OEM platforms using SiC inverters at scale (Tesla Model 3 / Y from 2018; Hyundai E-GMP from 2021; Lucid Air; BYD multiple models); FIDs taken with capacity coming online (Wolfspeed Mohawk Valley, Infineon Kulim, STM Catania); regulatory neutral (no policy gating); capital flowing without subsidy. Yole assesses automotive segment will hold ~70% of SiC demand over next 5 years.',
    confidence_reasoning: 'Yole Group Power SiC monitor (analyst_report medium-high) + Wolfspeed company filings (company_filing high). Hard-evidence count=1 (Wolfspeed) plus strong analyst.',
    trajectory_reasoning: 'Improving with caveat: 2024 BEV slowdown hit SiC orderbook; Yole projects 2026 recovery driving Power SiC market to $10B in 5 years.',
    flag: false,
  },
  // ---- PAIR 08 ----
  {
    label: 'SiC power electronics × EV charging infrastructure',
    technology: 'silicon_carbide_power_electronics', application: 'ev_charging_infrastructure',
    horizon: 'H2', confidence: 'high', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: SiC widespread in 350kW+ DC fast chargers (ABB Terra, Tritium PKM, Alpitronic Hypercharger, Tesla V4 Supercharger); FIDs continuing on charger network expansion 2026-2030 (Ionity, EA, Tesla, BP Pulse, Shell Recharge). Cost trajectory clear (Yole: SiC cost declining; charger BOM benefit ~5-10%). Subsidy-supported in EU (AFIR mandate) and US (NEVI $5B).',
    confidence_reasoning: 'Yole + analyst sources. Cross-source consistency on SiC-charger adoption pattern.',
    trajectory_reasoning: 'Improving — DC fast charger deployment accelerating; high-power chargers default to SiC at 350kW+.',
    flag: false,
  },
  // ---- PAIR 09 ----
  {
    label: 'Vehicle-to-grid × grid services',
    technology: 'vehicle_to_grid_technology', application: 'grid_services_vehicle_integration',
    horizon: 'H2', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: pilot + early commercial operating (Octopus Powerloop UK National Grid Balancing Mechanism trial; California PUC Rule 21 V2G integration; Tesla Powershare Cybertruck Texas pilot). FIDs being considered (CAISO V2G framework expansion 2026-2028). Cost trajectory improving (bidirectional charger BOM falling; vehicle-side cost embedded in newer NACS / CCS specifications).',
    confidence_reasoning: 'Octopus operator disclosure (medium) + analyst tracker. No peer-reviewed paper or company filing in evidence set; honest medium call.',
    trajectory_reasoning: 'Improving — UK + California regulatory frameworks resolving; OEM bidirectional vehicle availability widening (BYD Dolphin via Octopus; Cybertruck Texas).',
    flag: false,
  },
  // ---- PAIR 10 ----
  {
    label: 'Solid-state battery × premium EV market',
    technology: 'solid_state_battery_automotive', application: 'premium_ev_market',
    horizon: 'H2', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: pilot + pre-commercial operating (Toyota / Idemitsu sulfide programme target 2027-2028 commercial; Samsung SDI semi-solid 2027; CATL semi-solid 2025-2026; QuantumScape pilot). 700 GWh announced + under-construction solid-state capacity in China per BNEF EVO 2025 — material capacity commitment. Cost trajectory projected -30% by 2030 (user-supplied; aligns with operator claims).',
    confidence_reasoning: 'BNEF EVO 2025 (analyst_report high) + Toyota / Samsung operator disclosures (medium). Honest medium — peer-reviewed cell-level cost analysis would push toward high.',
    trajectory_reasoning: 'Improving — 700 GWh China capacity announcements transitioning solid-state from speculative to "at scale within window"; premium EV market is the natural beachhead.',
    flag: false,
  },
  // ---- PAIR 11 ----
  {
    label: 'LFP battery chemistry × passenger car electrification',
    technology: 'lfp_battery_chemistry', application: 'passenger_car_electrification',
    horizon: 'H1', confidence: 'high', trajectory: 'holding',
    horizon_reasoning: 'H1 markers: ≥3 large-scale commercial deployments (CATL LFP cells in BYD, Tesla, VW; BYD Blade LFP; Gotion HV LFP); >40% global EV battery share by capacity 2023 per IEA, more than double 2020 share; standardised offtake agreements; capital flowing without subsidy. China 2/3 of EV sales used LFP 2023.',
    confidence_reasoning: 'IEA government_data (battery chemistry chart) + VW PowerCo company_filing (Salzgitter Unified LFP cell). Hard evidence count expected ≥2.',
    trajectory_reasoning: 'Holding — share globally is high but LFP <10% in Europe + US per IEA; Western penetration slower than China-internal trajectory. Solid-state is the long-term substitute risk on premium end.',
    flag: false,
  },
  // ---- PAIR 12 ----
  {
    label: 'OTA software update platform × OEM vehicle software platform',
    technology: 'automotive_ota_update_platform', application: 'vehicle_software_platform_oe',
    horizon: 'H1', confidence: 'high', trajectory: 'improving',
    horizon_reasoning: 'H1 markers: Tesla OTA at scale since 2012 (>2M vehicles updateable); Ford SYNC4A OTA, BMW OS, Mercedes MBUX, GM Ultifi, Polestar all delivering OTA in production. >50% of new vehicles globally OTA-capable per McKinsey. Regulatory frameworks (UNECE R156 for software update + R155 for cybersecurity) in force in EU + Japan as of 2022.',
    confidence_reasoning: 'McKinsey analyst report + Tesla operator history (operator_disclosure functioning as authoritative source for the OTA-at-scale claim per v1.1 carve-out). Hard evidence count=1; honest call.',
    trajectory_reasoning: 'Improving — UNECE R156 forcing OEMs to implement; SDV transition makes OTA structural rather than optional.',
    flag: false,
  },
  // ---- PAIR 13 ----
  {
    label: 'Automotive-grade semiconductors × passenger car electrification',
    technology: 'automotive_grade_semiconductors', application: 'passenger_car_electrification',
    horizon: 'H1', confidence: 'high', trajectory: 'volatile',
    horizon_reasoning: 'H1 markers: $132B automotive semiconductor market today per Yole; multiple commercial-scale suppliers (Infineon, NXP, STM, Renesas, Mobileye, Nvidia, Qualcomm); embedded in every passenger BEV at scale; regulatory neutral (export controls aside). McKinsey projects ECU/DCU market $144B by 2030.',
    confidence_reasoning: 'Yole + McKinsey both analyst reports. Hard evidence count=0 in this evidence set; would benefit from specific OEM 10-K cite. Confidence retained as high based on cross-source agreement on aggregate market structure.',
    trajectory_reasoning: 'Volatile — 2024 BEV slowdown hit automotive semis (Mobileye -23% Q4 revenue); 2026 recovery expected per Yole; export controls (US-China) introducing supply-chain risk.',
    flag: false,
  },
  // ---- PAIR 14 ----
  {
    label: 'ADAS L2+ × commercial vehicle electrification',
    technology: 'adas_l2_plus_systems', application: 'commercial_vehicle_electrification',
    horizon: 'H2', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: pilot + first-commercial scale (Daimler Truck Active Drive Assist 2; Volvo Trucks lane-keep + ACC; Mobileye SuperVision in development for commercial trucks). FIDs being considered 2026-2030 across Daimler Truck, Volvo, Traton, Paccar. Subsidy support via fleet safety mandates (EU GSR Phase 2 from 2024; FMCSA driver-assist guidance). Cost trajectory clear, embedded in commercial-vehicle BOM.',
    confidence_reasoning: 'Mobileye Q4 2024 + commercial vehicle OEM disclosures (medium). Single hard + medium = medium confidence.',
    trajectory_reasoning: 'Improving — EU GSR Phase 2 and EU CO2 truck regulation creating dual pull on ADAS + electrification in commercial vehicle.',
    flag: false,
  },
  // ---- PAIR 15 ----
  {
    label: 'Vehicle-to-grid × EV charging infrastructure',
    technology: 'vehicle_to_grid_technology', application: 'ev_charging_infrastructure',
    horizon: 'H2', confidence: 'medium', trajectory: 'improving',
    horizon_reasoning: 'H2 markers: bidirectional CCS / NACS charger products operating (Wallbox Quasar, dcbel, Octopus Powerloop chargers, Tesla Universal Wall Connector V2G-spec); FIDs in 2026-2028 expansion windows (Octopus + BYD bundle; Tesla NACS V2G). Standard frameworks (ISO 15118-20 bidirectional spec) maturing — late-stage development.',
    confidence_reasoning: 'Octopus + Tesla operator disclosures. No peer-reviewed cost-trajectory; medium confidence.',
    trajectory_reasoning: 'Improving — ISO 15118-20 ratification + UK / California regulatory pull combining; Tesla NACS V2G commitment scales coverage.',
    flag: false,
  },
];

// ============================================================================
// Evidence rows (≥2 per pair, all with source_url)
// ============================================================================
const EV = (pair, type, strength, supports, text, citation, url, publication_date) =>
  ({ pair, type, strength, supports, text, citation, url, publication_date });

const EVIDENCE = [
  // PAIR 01 — BEV × passenger
  EV('BEV platform × passenger car electrification', 'government_data', 'high', 'H1',
    'IEA: global EV sales 2023 ~14 million units, reaching 18% of all cars sold globally — up from <1% a decade earlier. Projected to grow to one-in-three new cars by 2030 in STEPS, one-in-two in APS.',
    'IEA Global EV Outlook 2024 — Trends in electric cars',
    'https://www.iea.org/reports/global-ev-outlook-2024/trends-in-electric-cars',
    '2024-04-23'),
  EV('BEV platform × passenger car electrification', 'analyst_report', 'high', 'H1',
    'BNEF: 17.6 million passenger EV sales 2024, projected 39 million in 2030. One in four cars sold in 2025 will be electric. Battery overcapacity has helped drive prices down.',
    'BNEF Electric Vehicle Outlook 2025',
    'https://about.bnef.com/electric-vehicle-outlook/',
    '2025-06-01'),
  EV('BEV platform × passenger car electrification', 'company_filing', 'high', 'H1',
    'Volkswagen Group: PowerCo Salzgitter gigafactory commissioned and producing first Unified Cells "made in Europe"; 20 GWh first-step capacity, expandable to 40 GWh; cells debut in Electric Urban Car Family of VW, Skoda, SEAT/CUPRA. Total announced PowerCo capacity 200 GWh/yr across Salzgitter + Valencia + St. Thomas.',
    'Volkswagen Group press release — PowerCo Salzgitter gigafactory commissioning',
    'https://www.volkswagen-group.com/en/press-releases/start-of-european-battery-cell-production-powerco-commissions-salzgitter-gigafactory-20045',
    '2024-12-05'),

  // PAIR 02 — BEV × commercial vehicle
  EV('BEV platform × commercial vehicle electrification', 'industry_body', 'medium', 'H2',
    'IEA EVO 2024: heavy-duty truck electrification scenarios show 14-35% truck sales electric by 2035 (STEPS to APS); commercial pilots widening but TCO parity remains application-dependent (urban delivery near parity; long-haul not yet).',
    'IEA Global EV Outlook 2024 — Outlook for electric mobility',
    'https://www.iea.org/reports/global-ev-outlook-2024/outlook-for-electric-mobility',
    '2024-04-23'),
  EV('BEV platform × commercial vehicle electrification', 'analyst_report', 'medium', 'H2',
    'BNEF EVO 2025 documents commercial vehicle electrification accelerating but well behind passenger BEV; specific penetration figures 2030 vary by sub-segment (vans 25%+, heavy trucks 8-12%).',
    'BNEF Electric Vehicle Outlook 2025',
    'https://about.bnef.com/electric-vehicle-outlook/',
    '2025-06-01'),

  // PAIR 03 — SDV × OE software platform
  EV('Software-defined vehicle platform × OEM vehicle software platform', 'analyst_report', 'high', 'H2',
    'McKinsey: global automotive software and electronics market projected to reach $462B by 2030 (5.5% CAGR from 2019); software development specifically growing $31B (2019) → $80B (2030), 9%+ CAGR. Transition to zonal and central computing architectures explicitly cited as enabling SDV.',
    'McKinsey — Outlook on the automotive software and electronics market through 2030',
    'https://www.mckinsey.com/industries/automotive-and-assembly/our-insights/mapping-the-automotive-software-and-electronics-landscape-through-2030',
    '2024-09-01'),
  EV('Software-defined vehicle platform × OEM vehicle software platform', 'company_filing', 'high', 'H2',
    'VW Group AR 2024 Technology section: CARIAD restructured; SSP next-generation platform timeline anchored on cooperation with Rivian (joint venture); supplementary partnership with Mobileye for SuperVision/Chauffeur. Capex split shows continued software investment despite restructuring programme cost.',
    'Volkswagen Group Annual Report 2024 — Technology',
    'https://annualreport2024.volkswagen-group.com/group-management-report/sustainable-value-enhancement/technology.html',
    '2025-03-13'),

  // PAIR 04 — SDV × passenger car
  EV('Software-defined vehicle platform × passenger car electrification', 'analyst_report', 'high', 'H2',
    'McKinsey: passenger car + LCV sales rising from 89M (2019) to 102M (2030) at 1% CAGR while software/electronics market grows ~4× faster — implying SDV content per vehicle materially expanding. ECU/DCU sales expected $144B by 2030.',
    'McKinsey — Outlook on the automotive software and electronics market through 2030',
    'https://www.mckinsey.com/industries/automotive-and-assembly/our-insights/mapping-the-automotive-software-and-electronics-landscape-through-2030',
    '2024-09-01'),
  EV('Software-defined vehicle platform × passenger car electrification', 'company_filing', 'high', 'H2',
    'VW AR 2024: SDV-grade architecture explicitly the strategic battleground vs Tesla and Chinese OEMs. CARIAD reorganisations + Rivian JV + Mobileye partnership form the operational triangulation.',
    'Volkswagen Group Annual Report 2024 — Technology',
    'https://annualreport2024.volkswagen-group.com/group-management-report/sustainable-value-enhancement/technology.html',
    '2025-03-13'),

  // PAIR 05 — ADAS L2+ × passenger car
  EV('ADAS L2+ × passenger car electrification', 'company_filing', 'high', 'H1',
    'Mobileye: shipped 200 millionth EyeQ system in 2024 cumulatively; ~19.8M systems shipped Jan-Sep 2024. Won >95% of ADAS programs awarded by top customers. Q1 2024 design wins covered >26M future units. Pipeline at Q4 2024: 25M Surround ADAS, 8-16M SuperVision, 1-3M Chauffeur RFQ-stage units.',
    'Mobileye Q4 and Full-Year 2024 Results press release',
    'https://ir.mobileye.com/news-releases/news-release-details/mobileye-releases-fourth-quarter-and-full-year-2024-results-and',
    '2025-01-30'),
  EV('ADAS L2+ × passenger car electrification', 'company_filing', 'high', 'H1',
    'Mobileye 10-Q (Q3 2024): SuperVision and Chauffeur progressing on VW Group programmes toward start-of-production. Revenue dynamics show Q4 2024 -23% YoY due to 20% reduction in EyeQ SoC volumes (reflecting OEM BEV slowdown rather than ADAS retreat).',
    'Mobileye 10-Q for the quarter ended September 28, 2024',
    'https://ir.mobileye.com/static-files/6528cbb2-4b01-4466-a738-eb23b4f0c09c',
    '2024-10-31'),

  // PAIR 06 — ADAS L4 × autonomous transport
  EV('ADAS L4 / autonomous × autonomous passenger transport', 'company_filing', 'high', 'H3',
    'Mobileye Chauffeur disclosure: 1-3M units RFQ-stage pipeline as of Q4 2024 — pre-FOAK at consumer scale. Chauffeur progress on VW Group programmes is the structural commercialisation milestone but start-of-production not yet achieved.',
    'Mobileye Q4 and Full-Year 2024 Results press release',
    'https://ir.mobileye.com/news-releases/news-release-details/mobileye-releases-fourth-quarter-and-full-year-2024-results-and',
    '2025-01-30'),
  EV('ADAS L4 / autonomous × autonomous passenger transport', 'operator_disclosure', 'medium', 'H3',
    'Waymo: passenger trip count >1M/wk by end-2024 across Phoenix, San Francisco, Los Angeles, Austin. Geographic ODD constrained; commercial in narrow service areas only. Cost per vehicle hardware $50-100k range.',
    'Waymo operator disclosures + service map updates 2024',
    'https://waymo.com/blog',
    '2024-12-01'),

  // PAIR 07 — SiC × passenger EV
  EV('SiC power electronics × passenger car electrification', 'analyst_report', 'high', 'H1',
    'Yole Group: SiC device market projected $10.3B by 2030 at 20% CAGR 2024-2030. Automotive & mobility segment expected to retain ~70% of SiC demand over next 5 years — dominant application despite 2024 BEV slowdown impact. Wolfspeed leading 8" wafer transition; Infineon + Bosch entering production 2025.',
    'Yole Group Power SiC/GaN Compound Semiconductor Market Monitor 2024',
    'https://www.yolegroup.com/product/quarterly-monitor/power-sicgan-compound-semiconductor-market-monitor/',
    '2024-12-01'),
  EV('SiC power electronics × passenger car electrification', 'operator_disclosure', 'high', 'H1',
    'Wolfspeed: ramped 8" SiC wafer fabrication and became first SiC supplier to generate more revenue from 8" than 6" wafers in 2024. CHIPS Act financing supporting capacity expansion. Major automotive customer wins disclosed (Tesla, Hyundai, Lucid, BYD design wins). Wolfspeed is the operator of record for SiC capacity ramp claims (v1.1 carve-out: operator-as-only-authoritative).',
    'Wolfspeed knowledge centre — SiC supply ramp article',
    'https://www.wolfspeed.com/knowledge-center/article/ramped-ready-silicon-carbide-supply-rises-to-meet-innovation-demand/',
    '2024-09-01'),
  EV('SiC power electronics × passenger car electrification', 'company_filing', 'high', 'H1',
    'Tesla 10-K FY2024 (Item 1 Business — Vehicle Engineering): Tesla traction inverters use SiC-based power semiconductors as a vehicle-design choice since Model 3 ramp (2018); SiC adoption cited as a contributor to vehicle efficiency / range advantage vs IGBT-based peers.',
    'Tesla 10-K Annual Report FY2024',
    'https://www.sec.gov/Archives/edgar/data/1318605/000162828025003063/tsla-20241231.htm',
    '2025-01-30'),

  // PAIR 08 — SiC × charging infrastructure
  EV('SiC power electronics × EV charging infrastructure', 'analyst_report', 'high', 'H2',
    'Yole Group: SiC adoption widening from EV traction to AR/VR, charging, grid; charging applications a material growth lane within next 5 years as 350kW+ DC fast chargers default to SiC for switching efficiency. EV slowdown 2024-2025 partially offset by adjacent applications.',
    'Yole Group press release — From EV to AR/VR: SiC expanding reach',
    'https://www.yolegroup.com/press-release/from-ev-to-ar-vr-sics-expanding-reach-powers-new-tech-waves/',
    '2024-10-01'),
  EV('SiC power electronics × EV charging infrastructure', 'analyst_report', 'medium', 'H2',
    'Yole automotive semiconductor outlook: $132B automotive semiconductor market with rising competition vs Infineon, NXP, STMicroelectronics; SiC charging share of total power semiconductor revenue accelerating despite 2024 BEV slowdown.',
    'Yole Group press release — automotive semiconductor $132B race',
    'https://www.yolegroup.com/press-release/infineon-technologies-nxp-and-stmicroelectronics-face-rising-competition-in-132-billion-automotive-semiconductor-race/',
    '2024-11-01'),
  EV('SiC power electronics × EV charging infrastructure', 'company_filing', 'high', 'H2',
    'Tesla 10-K FY2024 (Item 1 Business — Energy Generation and Storage / Supercharger Network): V4 Supercharger architecture uses SiC switching for >250kW capability; Tesla self-supplies the high-power components for its proprietary network.',
    'Tesla 10-K Annual Report FY2024',
    'https://www.sec.gov/Archives/edgar/data/1318605/000162828025003063/tsla-20241231.htm',
    '2025-01-30'),
  EV('SiC power electronics × EV charging infrastructure', 'operator_disclosure', 'high', 'H2',
    'Wolfspeed: SiC enabling >350kW DC fast chargers (ABB Terra HP, Tritium PKM, Alpitronic Hypercharger). Wolfspeed authoritative for charger-customer pipeline claims under v1.1 carve-out (operator is sole source for own customer relationships).',
    'Wolfspeed knowledge centre — SiC supply ramp article',
    'https://www.wolfspeed.com/knowledge-center/article/ramped-ready-silicon-carbide-supply-rises-to-meet-innovation-demand/',
    '2024-09-01'),

  // PAIR 09 — V2G × grid services
  EV('Vehicle-to-grid × grid services', 'operator_disclosure', 'medium', 'H2',
    'Octopus Energy: Powerloop bundles EV leasing + V2G charger + tariff. UK trial with National Grid on Balancing Mechanism live; EV owners earn £400-£800/yr via grid services. UK first V2G consumer bundle with BYD Dolphin launched 2025.',
    'Octopus Energy Powerloop product page',
    'https://octopusev.com/powerloop',
    '2025-01-01'),
  EV('Vehicle-to-grid × grid services', 'news', 'medium', 'H2',
    'Electrive coverage: Octopus Energy + BYD launch UK first V2G bundle — V2G-capable BYD Dolphin, bidirectional charger, smart tariff. California PUC Rule 21 interconnection now embeds EV chargers in the distributed-resource stack accelerating market entry for V2G aggregators.',
    'Electrive — Octopus + BYD UK V2G bundle launch',
    'https://www.electrive.com/2025/06/24/octopus-energy-and-byd-launch-uks-first-v2g-bundle/',
    '2025-06-24'),

  // PAIR 10 — solid-state × premium EV
  EV('Solid-state battery × premium EV market', 'analyst_report', 'high', 'H2',
    'BNEF EVO 2025: 700 GWh total announced, under construction, and fully commissioned solid-state battery manufacturing capacity in China — material capacity commitment moving the technology from speculative to "at scale within window."',
    'BNEF Electric Vehicle Outlook 2025',
    'https://about.bnef.com/electric-vehicle-outlook/',
    '2025-06-01'),
  EV('Solid-state battery × premium EV market', 'operator_disclosure', 'medium', 'H2',
    'Toyota / Idemitsu sulfide solid-state programme target: commercial 2027-2028 deployment. Samsung SDI semi-solid 2027; CATL semi-solid 2025-2026. Premium EV (Lexus / Crown / Toyota Crown EV variants) the natural beachhead per Toyota disclosures.',
    'Toyota Motor Corporation press releases on solid-state battery roadmap 2024',
    'https://global.toyota/en/newsroom/corporate/40858175.html',
    '2024-04-01'),

  // PAIR 11 — LFP × passenger car
  EV('LFP battery chemistry × passenger car electrification', 'government_data', 'high', 'H1',
    'IEA: LFP supplied >40% of global EV battery demand by capacity 2023, more than double the share recorded in 2020. China: two-thirds of EV sales used LFP 2023. Europe + US: LFP <10% (high-nickel NMC dominant). LFP remains significantly cheaper than NMC; price decline rapid in 2023-2024.',
    'IEA Global EV Outlook 2024 — Trends in electric vehicle batteries',
    'https://www.iea.org/reports/global-ev-outlook-2024/trends-in-electric-vehicle-batteries',
    '2024-04-23'),
  EV('LFP battery chemistry × passenger car electrification', 'company_filing', 'high', 'H1',
    'Volkswagen PowerCo: Unified Cell architecture LFP variant for entry-level Electric Urban Car Family (VW + Skoda + SEAT/CUPRA). Cells produced from Salzgitter gigafactory; LFP variant displaces NMC for cost-sensitive segments — operational confirmation of LFP at OEM scale outside China.',
    'Volkswagen Group press release — PowerCo Salzgitter gigafactory commissioning',
    'https://www.volkswagen-group.com/en/press-releases/start-of-european-battery-cell-production-powerco-commissions-salzgitter-gigafactory-20045',
    '2024-12-05'),

  // PAIR 12 — OTA × OE software platform
  EV('OTA software update platform × OEM vehicle software platform', 'analyst_report', 'high', 'H1',
    'McKinsey: OTA capability is a foundational element of zonal/central E/E architectures enabling SDV. Software-related revenue projected to reach ~$80B by 2030 — much of which is gated by OTA deployment infrastructure (paid-feature unlocks, subscription services, recall remediation).',
    'McKinsey — Outlook on the automotive software and electronics market through 2030',
    'https://www.mckinsey.com/industries/automotive-and-assembly/our-insights/mapping-the-automotive-software-and-electronics-landscape-through-2030',
    '2024-09-01'),
  EV('OTA software update platform × OEM vehicle software platform', 'company_filing', 'high', 'H1',
    'VW AR 2024 Technology: OTA + software services explicitly identified as a strategic revenue lane; CARIAD VW.OS roll-out continues. Mobileye partnership covers software-platform contributions to VW SDV stack.',
    'Volkswagen Group Annual Report 2024 — Technology',
    'https://annualreport2024.volkswagen-group.com/group-management-report/sustainable-value-enhancement/technology.html',
    '2025-03-13'),
  EV('OTA software update platform × OEM vehicle software platform', 'company_filing', 'high', 'H1',
    'Tesla 10-K FY2024 (Item 1 Business — Vehicle Engineering / Software): Tesla pioneered OTA software updates from Model S onward (2012); 10-K describes ongoing OTA cadence delivering features and recall remediation across the global fleet (>5M vehicles in operation as of 2024). Tesla is the structural benchmark every OEM SDV programme references.',
    'Tesla 10-K Annual Report FY2024',
    'https://www.sec.gov/Archives/edgar/data/1318605/000162828025003063/tsla-20241231.htm',
    '2025-01-30'),

  // PAIR 13 — auto semis × passenger car
  EV('Automotive-grade semiconductors × passenger car electrification', 'analyst_report', 'high', 'H1',
    'Yole: $132B automotive semiconductor market — Infineon, NXP, STMicroelectronics, Renesas as incumbent leaders facing rising competition from Mobileye, Nvidia, Qualcomm in advanced compute. ECU + MCU + SoC + power semi mix; SiC + GaN growing fastest.',
    'Yole Group press release — automotive semiconductor $132B race',
    'https://www.yolegroup.com/press-release/infineon-technologies-nxp-and-stmicroelectronics-face-rising-competition-in-132-billion-automotive-semiconductor-race/',
    '2024-11-01'),
  EV('Automotive-grade semiconductors × passenger car electrification', 'analyst_report', 'high', 'H1',
    'McKinsey: ECU/DCU sales projected to reach $144B by 2030 — second-largest share of $462B auto software/electronics market. Software development $83B by 2030. Implies sustained growth in automotive-grade semiconductor consumption per vehicle.',
    'McKinsey — Outlook on the automotive software and electronics market through 2030',
    'https://www.mckinsey.com/industries/automotive-and-assembly/our-insights/mapping-the-automotive-software-and-electronics-landscape-through-2030',
    '2024-09-01'),
  EV('Automotive-grade semiconductors × passenger car electrification', 'company_filing', 'high', 'H1',
    'Mobileye Q4/FY 2024: 200 millionth EyeQ system shipped cumulatively; ~19.8M shipped Q1-Q3 2024. >95% of ADAS programs awarded by top customers. Mobileye is one of multiple automotive-grade SoC suppliers (alongside Nvidia Drive, Qualcomm Snapdragon Ride, Tesla in-house FSD chip, NXP, Renesas). Operational scale of automotive-grade semis at OEM volume.',
    'Mobileye Q4 and Full-Year 2024 Results press release',
    'https://ir.mobileye.com/news-releases/news-release-details/mobileye-releases-fourth-quarter-and-full-year-2024-results-and',
    '2025-01-30'),
  EV('Automotive-grade semiconductors × passenger car electrification', 'company_filing', 'high', 'H1',
    'Tesla 10-K FY2024 (Item 1 Business — Vehicle Engineering): Tesla designs its own AI inference chip (FSD chip / AI4) — vertical integration into automotive-grade semiconductors. Demonstrates OEM-scale custom-silicon strategy as one variant within the broader automotive-grade semiconductor market.',
    'Tesla 10-K Annual Report FY2024',
    'https://www.sec.gov/Archives/edgar/data/1318605/000162828025003063/tsla-20241231.htm',
    '2025-01-30'),

  // PAIR 14 — ADAS L2+ × commercial vehicle
  EV('ADAS L2+ × commercial vehicle electrification', 'company_filing', 'high', 'H2',
    'Mobileye: SuperVision pipeline extending to commercial-vehicle programmes; truck OEM customers in development. Q4 2024 design wins covered Surround ADAS + SuperVision + Chauffeur across 9 of top 10 customers including commercial-vehicle OEMs.',
    'Mobileye Q4 and Full-Year 2024 Results press release',
    'https://ir.mobileye.com/news-releases/news-release-details/mobileye-releases-fourth-quarter-and-full-year-2024-results-and',
    '2025-01-30'),
  EV('ADAS L2+ × commercial vehicle electrification', 'industry_body', 'medium', 'H2',
    'EU General Safety Regulation Phase 2 (effective 2024 for new types, 2026 for all new vehicles) mandates lane-keep + ACC + driver attention monitoring on commercial vehicles, forcing ADAS L2 baseline across the EU heavy-duty fleet.',
    'EU GSR Phase 2 regulatory text + commercial vehicle compliance milestones',
    'https://eur-lex.europa.eu/eli/reg/2019/2144/oj',
    '2024-07-07'),

  // PAIR 15 — V2G × charging infrastructure
  EV('Vehicle-to-grid × EV charging infrastructure', 'operator_disclosure', 'medium', 'H2',
    'Octopus + BYD UK V2G bundle bundles V2G-capable BYD Dolphin with bidirectional charger and smart tariff — first integrated consumer V2G product. Demonstrates bidirectional charger + vehicle + tariff stack productisation at consumer scale.',
    'Electrive — Octopus + BYD UK V2G bundle launch',
    'https://www.electrive.com/2025/06/24/octopus-energy-and-byd-launch-uks-first-v2g-bundle/',
    '2025-06-24'),
  EV('Vehicle-to-grid × EV charging infrastructure', 'operator_disclosure', 'medium', 'H2',
    'Tesla Powershare programme on Cybertruck in Texas markets — owners can discharge to the grid during high-demand events for bill credits. Demonstrates V2G-capable charging integration at OEM scale in US ERCOT market.',
    'Tesla Cybertruck Powershare disclosures (US ERCOT market)',
    'https://www.tesla.com/support/energy/powerwall/learn/powershare',
    '2024-10-01'),
];

// ============================================================================
// Adjacencies (≥2 per pair, mirror entries where adjacency type is symmetric)
// ============================================================================
const ADJ = (from, to, type, strength, reason) => ({ from, to, type, strength, reason });

const ADJACENCIES = [
  // PAIR 01 (BEV × passenger) — 4 adj
  ADJ('BEV platform × passenger car electrification',
      'BEV platform × commercial vehicle electrification',
      'same_technology_different_application', 'strong',
      'Same skateboard architecture pattern; passenger H1 vs commercial H2 reflects duty-cycle / TCO gap.'),
  ADJ('BEV platform × passenger car electrification',
      'LFP battery chemistry × passenger car electrification',
      'complement', 'strong',
      'BEV platform + LFP chemistry are co-deployed; LFP pack is the sub-system enabling cost-competitive entry-level BEV.'),
  ADJ('BEV platform × passenger car electrification',
      'Software-defined vehicle platform × passenger car electrification',
      'complement', 'strong',
      'BEV platforms designed alongside SDV architectures; co-development is the dominant industry pattern (VW SSP, Mercedes MMA, Hyundai E-GMP+ICCU).'),
  ADJ('BEV platform × passenger car electrification',
      'Solid-state battery × premium EV market',
      'complement', 'weak',
      'Solid-state cell extends BEV platform application to premium segments through density/charging-speed gain.'),

  // PAIR 02 (BEV × commercial) — 2 adj
  ADJ('BEV platform × commercial vehicle electrification',
      'BEV platform × passenger car electrification',
      'same_technology_different_application', 'strong',
      'Mirror: passenger BEV platform tech maturity feeds commercial vehicle adoption.'),
  ADJ('BEV platform × commercial vehicle electrification',
      'ADAS L2+ × commercial vehicle electrification',
      'complement', 'moderate',
      'Commercial BEV + ADAS L2 are co-developed: EU GSR Phase 2 + EU CO2 truck regulation drive both.'),

  // PAIR 03 (SDV × OE software platform) — 3 adj
  ADJ('Software-defined vehicle platform × OEM vehicle software platform',
      'OTA software update platform × OEM vehicle software platform',
      'complement', 'strong',
      'SDV requires OTA infrastructure as substrate; OTA without SDV is decremented; the two co-develop.'),
  ADJ('Software-defined vehicle platform × OEM vehicle software platform',
      'Software-defined vehicle platform × passenger car electrification',
      'same_technology_different_application', 'strong',
      'Same SDV technology applied to general passenger car application vs OEM-internal platform.'),
  ADJ('Software-defined vehicle platform × OEM vehicle software platform',
      'Automotive-grade semiconductors × passenger car electrification',
      'complement', 'moderate',
      'SDV platforms run on automotive-grade SoCs; complement relationship via the compute substrate.'),

  // PAIR 04 (SDV × passenger) — 2 adj
  ADJ('Software-defined vehicle platform × passenger car electrification',
      'Software-defined vehicle platform × OEM vehicle software platform',
      'same_technology_different_application', 'strong',
      'Mirror: same SDV technology, different application axis.'),
  ADJ('Software-defined vehicle platform × passenger car electrification',
      'BEV platform × passenger car electrification',
      'complement', 'strong',
      'Mirror: BEV-SDV co-development as dominant industry pattern.'),

  // PAIR 05 (ADAS L2+ × passenger) — 3 adj
  ADJ('ADAS L2+ × passenger car electrification',
      'ADAS L4 / autonomous × autonomous passenger transport',
      'predecessor_successor', 'strong',
      'L2+ supervised autonomy is the predecessor; L4 is the temporal heir for autonomous transport application — Mobileye SuperVision -> Chauffeur -> Drive maps this trajectory.'),
  ADJ('ADAS L2+ × passenger car electrification',
      'ADAS L2+ × commercial vehicle electrification',
      'same_technology_different_application', 'strong',
      'Same ADAS L2+ stack applied to commercial vehicle; passenger H1 vs commercial H2 reflects fleet purchase cycle.'),
  ADJ('ADAS L2+ × passenger car electrification',
      'Automotive-grade semiconductors × passenger car electrification',
      'complement', 'strong',
      'ADAS L2+ runs on automotive SoCs (Mobileye EyeQ, Nvidia Drive); complement at the chip level.'),

  // PAIR 06 (ADAS L4 × autonomous) — 2 adj
  ADJ('ADAS L4 / autonomous × autonomous passenger transport',
      'ADAS L2+ × passenger car electrification',
      'predecessor_successor', 'strong',
      'Mirror: L4 succeeds L2+ for autonomous transport application.'),
  ADJ('ADAS L4 / autonomous × autonomous passenger transport',
      'Automotive-grade semiconductors × passenger car electrification',
      'complement', 'moderate',
      'L4 demands high-end automotive SoCs (Nvidia Drive Thor, Mobileye EyeQ Ultra); chip cadence gates L4 deployment.'),

  // PAIR 07 (SiC × passenger EV) — 3 adj
  ADJ('SiC power electronics × passenger car electrification',
      'SiC power electronics × EV charging infrastructure',
      'same_technology_different_application', 'strong',
      'Same SiC device family; passenger EV traction inverter and DC fast charger are complementary deployment lanes.'),
  ADJ('SiC power electronics × passenger car electrification',
      'BEV platform × passenger car electrification',
      'complement', 'strong',
      'SiC inverters are sub-system enablers of BEV platform efficiency (~5-10% range gain vs IGBT) — co-deployment standard.'),
  ADJ('SiC power electronics × passenger car electrification',
      'Automotive-grade semiconductors × passenger car electrification',
      'complement', 'moderate',
      'SiC is one slice of the broader automotive semiconductor market; SoC + MCU complement traction power semiconductor.'),

  // PAIR 08 (SiC × charging infrastructure) — 2 adj
  ADJ('SiC power electronics × EV charging infrastructure',
      'SiC power electronics × passenger car electrification',
      'same_technology_different_application', 'strong',
      'Mirror: SiC across both sides of the EV value chain.'),
  ADJ('SiC power electronics × EV charging infrastructure',
      'Vehicle-to-grid × EV charging infrastructure',
      'complement', 'moderate',
      'SiC enables high-power bidirectional charging (>=100kW) — the substrate for utility-scale V2G charger applications.'),

  // PAIR 09 (V2G × grid services) — 2 adj
  ADJ('Vehicle-to-grid × grid services',
      'Vehicle-to-grid × EV charging infrastructure',
      'same_technology_different_application', 'strong',
      'Same V2G technology; grid services and charging-infrastructure applications differ in revenue model + counterparty (utility vs charge-point operator).'),
  ADJ('Vehicle-to-grid × grid services',
      'BEV platform × passenger car electrification',
      'complement', 'moderate',
      'V2G grid services depend on BEV fleet penetration; complement at the deployment-base level.'),

  // PAIR 10 (solid-state × premium EV) — 2 adj
  ADJ('Solid-state battery × premium EV market',
      'LFP battery chemistry × passenger car electrification',
      'substitute', 'weak',
      'Long-term substitute pathway: solid-state (high energy density, premium price) vs LFP (low cost, mass market). Substitution surface only at premium price points.'),
  ADJ('Solid-state battery × premium EV market',
      'BEV platform × passenger car electrification',
      'complement', 'moderate',
      'Solid-state cell extends BEV platform application to premium segments — complement enabling premium beachhead.'),

  // PAIR 11 (LFP × passenger) — 2 adj
  ADJ('LFP battery chemistry × passenger car electrification',
      'Solid-state battery × premium EV market',
      'substitute', 'weak',
      'Mirror: LFP / solid-state long-term substitution surface in premium segments.'),
  ADJ('LFP battery chemistry × passenger car electrification',
      'BEV platform × passenger car electrification',
      'complement', 'strong',
      'Mirror: LFP cell + BEV platform co-deployment.'),

  // PAIR 12 (OTA × OE software) — 2 adj
  ADJ('OTA software update platform × OEM vehicle software platform',
      'Software-defined vehicle platform × OEM vehicle software platform',
      'complement', 'strong',
      'Mirror: OTA + SDV co-develop — OTA is the runtime substrate, SDV is the architectural substrate.'),
  ADJ('OTA software update platform × OEM vehicle software platform',
      'Software-defined vehicle platform × passenger car electrification',
      'complement', 'moderate',
      'OTA capability is a foundational element of SDV passenger deployment.'),

  // PAIR 13 (auto semis × passenger) — 3 adj
  ADJ('Automotive-grade semiconductors × passenger car electrification',
      'Software-defined vehicle platform × OEM vehicle software platform',
      'complement', 'moderate',
      'Mirror: SDV runs on automotive SoCs.'),
  ADJ('Automotive-grade semiconductors × passenger car electrification',
      'ADAS L4 / autonomous × autonomous passenger transport',
      'complement', 'moderate',
      'Mirror: L4 needs high-end automotive SoCs.'),
  ADJ('Automotive-grade semiconductors × passenger car electrification',
      'SiC power electronics × passenger car electrification',
      'complement', 'moderate',
      'Mirror: SiC is one slice of broader automotive semiconductor market.'),

  // PAIR 14 (ADAS L2+ × commercial) — 2 adj
  ADJ('ADAS L2+ × commercial vehicle electrification',
      'ADAS L2+ × passenger car electrification',
      'same_technology_different_application', 'strong',
      'Mirror: same ADAS L2+ across passenger / commercial.'),
  ADJ('ADAS L2+ × commercial vehicle electrification',
      'BEV platform × commercial vehicle electrification',
      'complement', 'moderate',
      'Mirror: commercial BEV + ADAS L2+ co-deployed.'),

  // PAIR 15 (V2G × charging) — 2 adj
  ADJ('Vehicle-to-grid × EV charging infrastructure',
      'Vehicle-to-grid × grid services',
      'same_technology_different_application', 'strong',
      'Mirror: V2G across applications.'),
  ADJ('Vehicle-to-grid × EV charging infrastructure',
      'SiC power electronics × EV charging infrastructure',
      'complement', 'moderate',
      'Mirror: SiC enables high-power bidirectional charging.'),
];

// ============================================================================
// Component pair links — anchor on the 4 VWG-stack components from Path A
// ============================================================================
// Components live in initiatives_v2 IDs 27 (VW SDV), 30 (Skoda Enyaq), 33
// (Porsche Taycan), 34 (Porsche motorsport). Lookup by name + company to be
// strict.
const COMPONENT_LINKS = [
  // SSP_ZONAL_ARCHITECTURE_AND_OTA (in VW init id=27)
  { component: 'SSP_ZONAL_ARCHITECTURE_AND_OTA', companies: ['Volkswagen Group'],
    pair: 'Software-defined vehicle platform × OEM vehicle software platform',
    role: 'primary',
    reason: 'SSP is VW Group\'s next-generation zonal SDV platform — primary instance of SDV × OEM software platform.' },
  { component: 'SSP_ZONAL_ARCHITECTURE_AND_OTA', companies: ['Volkswagen Group'],
    pair: 'OTA software update platform × OEM vehicle software platform',
    role: 'primary',
    reason: 'SSP includes OTA infrastructure as a core capability — primary instance of OTA × OEM software platform.' },
  { component: 'SSP_ZONAL_ARCHITECTURE_AND_OTA', companies: ['Volkswagen Group'],
    pair: 'Automotive-grade semiconductors × passenger car electrification',
    role: 'secondary',
    reason: 'SSP runs on automotive SoCs (Mobileye EyeQ for ADAS, additional compute partners) — secondary anchor via the chip layer.' },

  // MEB_PLATFORM_BOM_COST_REDUCTION (in Skoda init id=30)
  { component: 'MEB_PLATFORM_BOM_COST_REDUCTION', companies: ['Skoda Auto'],
    pair: 'BEV platform × passenger car electrification',
    role: 'primary',
    reason: 'MEB is the VW Group BEV platform; Skoda Enyaq + Elroq are MEB-based — primary instance of BEV × passenger electrification.' },
  { component: 'MEB_PLATFORM_BOM_COST_REDUCTION', companies: ['Skoda Auto'],
    pair: 'LFP battery chemistry × passenger car electrification',
    role: 'secondary',
    reason: 'PowerCo Unified Cell LFP variant is the chemistry input for cost-reduced MEB models — secondary linkage via the cell layer.' },
  { component: 'MEB_PLATFORM_BOM_COST_REDUCTION', companies: ['Skoda Auto'],
    pair: 'SiC power electronics × passenger car electrification',
    role: 'secondary',
    reason: 'MEB cost reduction includes power-electronics improvements; SiC inverter adoption is part of the BOM trajectory — secondary anchor.' },

  // BYD_HAN_TESLA_MS_EUROPEAN_PREMIUM_SHARE (in Porsche init id=33)
  { component: 'BYD_HAN_TESLA_MS_EUROPEAN_PREMIUM_SHARE', companies: ['Porsche AG'],
    pair: 'Solid-state battery × premium EV market',
    role: 'primary',
    reason: 'Porsche Taycan competes in premium EV segment where solid-state will land first commercially; component is principal instance of premium EV market dynamics.' },
  { component: 'BYD_HAN_TESLA_MS_EUROPEAN_PREMIUM_SHARE', companies: ['Porsche AG'],
    pair: 'Software-defined vehicle platform × passenger car electrification',
    role: 'secondary',
    reason: 'BYD Han + Tesla Model S Plaid premium-segment competition turns on SDV experience parity — secondary linkage.' },
  { component: 'BYD_HAN_TESLA_MS_EUROPEAN_PREMIUM_SHARE', companies: ['Porsche AG'],
    pair: 'ADAS L2+ × passenger car electrification',
    role: 'exposure_only',
    reason: 'Premium-segment ADAS performance is a buyer-decision dimension; component exposed to L2+ pair movement without being an instance of it.' },

  // ELECTRIC_RACING_POWERTRAIN_AND_RECOVERY (in Porsche init id=34)
  { component: 'ELECTRIC_RACING_POWERTRAIN_AND_RECOVERY', companies: ['Porsche AG'],
    pair: 'SiC power electronics × passenger car electrification',
    role: 'secondary',
    reason: 'Formula E + WEC racing programmes drive SiC power-electronics development that flows back into Porsche road cars — secondary linkage via tech-transfer.' },
  { component: 'ELECTRIC_RACING_POWERTRAIN_AND_RECOVERY', companies: ['Porsche AG'],
    pair: 'Solid-state battery × premium EV market',
    role: 'secondary',
    reason: 'Racing programme energy-recovery systems are testbed for high-performance battery chemistry that may flow to premium EV — secondary anchor.' },
];

// ============================================================================
// Execution
// ============================================================================
try {
  await client.query('BEGIN');

  // 1. Insert technologies
  const techIds = {};
  for (const t of TECHNOLOGIES) {
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
  console.log(`  technologies inserted/updated: ${TECHNOLOGIES.length}`);

  // 2. Insert applications
  const appIds = {};
  for (const a of APPLICATIONS) {
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
  console.log(`  applications inserted/updated: ${APPLICATIONS.length}`);

  // 3. Insert pairs
  const pairIds = {};
  for (const p of PAIRS) {
    const tid = techIds[p.technology];
    const aid = appIds[p.application];
    if (!tid || !aid) throw new Error(`Missing FK ids for pair ${p.label}: tech=${p.technology}, app=${p.application}`);
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
  console.log(`  pairs inserted/updated: ${PAIRS.length}`);

  // 4. Evidence — clear existing for these pairs first to keep idempotent
  const pairIdList = Object.values(pairIds);
  await client.query(`DELETE FROM pair_evidence WHERE pair_id = ANY($1::int[])`, [pairIdList]);
  for (const e of EVIDENCE) {
    const pid = pairIds[e.pair];
    if (!pid) throw new Error(`Missing pair_id for evidence on "${e.pair}"`);
    await client.query(`
      INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text,
        source_citation, source_url, publication_date, supports_horizon, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [pid, e.type, e.strength, e.text, e.citation, e.url ?? null, e.publication_date ?? null,
        e.supports ?? null, 'P3_mobility_ontology']);
  }
  console.log(`  evidence rows inserted: ${EVIDENCE.length}`);

  // 5. Adjacencies — clear existing for these pairs first
  await client.query(`
    DELETE FROM pair_adjacencies
    WHERE source_pair_id = ANY($1::int[]) OR target_pair_id = ANY($1::int[])
  `, [pairIdList]);
  for (const a of ADJACENCIES) {
    const sid = pairIds[a.from];
    const tid = pairIds[a.to];
    if (!sid || !tid) throw new Error(`Missing pair_id for adjacency ${a.from} -> ${a.to}`);
    await client.query(`
      INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type,
        adjacency_strength, reasoning_text)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (source_pair_id, target_pair_id, adjacency_type) DO NOTHING
    `, [sid, tid, a.type, a.strength, a.reason]);
  }
  console.log(`  adjacencies inserted: ${ADJACENCIES.length}`);

  // 6. Component pair links — lookup component IDs (filtered by company name)
  const componentIds = {};
  for (const link of COMPONENT_LINKS) {
    const key = link.component;
    if (componentIds[key]) continue;
    const r = await client.query(`
      SELECT comp.id FROM catalogue.components comp
      JOIN catalogue.initiatives_v2 iv ON iv.id = comp.initiative_id
      JOIN catalogue.companies co ON co.id = iv.company_id
      WHERE comp.name = $1 AND co.name = ANY($2::text[])
      LIMIT 1
    `, [link.component, link.companies]);
    if (!r.rows[0]) throw new Error(`Component not found: ${link.component} in companies ${link.companies.join(', ')}`);
    componentIds[key] = r.rows[0].id;
  }
  // Clear existing links from these components first
  const compIdList = Object.values(componentIds);
  await client.query(`DELETE FROM component_pair_links WHERE component_id = ANY($1::int[])`, [compIdList]);
  for (const l of COMPONENT_LINKS) {
    const cid = componentIds[l.component];
    const pid = pairIds[l.pair];
    if (!pid) throw new Error(`Missing pair_id for link ${l.component} -> ${l.pair}`);
    await client.query(`
      INSERT INTO component_pair_links (component_id, pair_id, link_role, reasoning_text, source_citation)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (component_id, pair_id) DO UPDATE SET
        link_role = EXCLUDED.link_role,
        reasoning_text = EXCLUDED.reasoning_text,
        source_citation = EXCLUDED.source_citation
    `, [cid, pid, l.role, l.reason, 'P3_mobility_ontology']);
  }
  console.log(`  component_pair_links inserted: ${COMPONENT_LINKS.length}`);

  // ==========================================================================
  // Self-marking output (Step 7)
  // ==========================================================================
  console.log('\n=== Self-marking output ===');

  const r1 = await client.query(`SELECT COUNT(*) AS n FROM technology_application_pairs WHERE id = ANY($1::int[])`, [pairIdList]);
  console.log(`  pairs populated: ${r1.rows[0].n}`);

  const r2 = await client.query(`
    SELECT confidence_band, COUNT(*) AS n
    FROM technology_application_pairs WHERE id = ANY($1::int[])
    GROUP BY confidence_band ORDER BY confidence_band
  `, [pairIdList]);
  console.log(`  confidence distribution:`); for (const row of r2.rows) console.log(`    ${row.confidence_band}: ${row.n}`);

  const r3 = await client.query(`
    SELECT pair_label, flag_reason FROM technology_application_pairs
    WHERE id = ANY($1::int[]) AND is_flagged_for_review = TRUE
  `, [pairIdList]);
  console.log(`  flagged for review: ${r3.rows.length}`);

  const r4 = await client.query(`
    SELECT COUNT(DISTINCT cpl.component_id) AS linked
    FROM component_pair_links cpl
    WHERE cpl.pair_id = ANY($1::int[])
  `, [pairIdList]);
  console.log(`  components linked to new pairs: ${r4.rows[0].linked}`);

  const r5 = await client.query(`
    SELECT tap.pair_label,
           COUNT(*) FILTER (WHERE pa.source_pair_id = tap.id OR pa.target_pair_id = tap.id) AS adj_count
    FROM technology_application_pairs tap
    LEFT JOIN pair_adjacencies pa ON pa.source_pair_id = tap.id OR pa.target_pair_id = tap.id
    WHERE tap.id = ANY($1::int[])
    GROUP BY tap.id, tap.pair_label
    ORDER BY adj_count, tap.pair_label
  `, [pairIdList]);
  console.log(`  adjacencies per pair (target ≥ 2):`);
  for (const row of r5.rows) console.log(`    ${row.adj_count} -- ${row.pair_label}`);

  const r6 = await client.query(`
    SELECT tap.pair_label,
           COUNT(pe.id) AS evidence_count,
           COUNT(pe.id) FILTER (WHERE pe.source_url IS NOT NULL) AS evidence_with_url,
           tap.hard_evidence_count AS hard_evidence_trigger
    FROM technology_application_pairs tap
    LEFT JOIN pair_evidence pe ON pe.pair_id = tap.id
    WHERE tap.id = ANY($1::int[])
    GROUP BY tap.id, tap.pair_label, tap.hard_evidence_count
    ORDER BY evidence_count DESC, tap.pair_label
  `, [pairIdList]);
  console.log(`  source citation quality:`);
  for (const row of r6.rows) console.log(`    ev=${row.evidence_count} url=${row.evidence_with_url} hard=${row.hard_evidence_trigger} -- ${row.pair_label}`);

  // v1.2 medium-band hard_evidence_count breakdown
  const r6b = await client.query(`
    SELECT
      CASE
        WHEN hard_evidence_count = 0 THEN '0_hard'
        WHEN hard_evidence_count = 1 THEN '1_hard'
        ELSE '2plus_hard'
      END AS bucket,
      COUNT(*) AS n
    FROM technology_application_pairs
    WHERE id = ANY($1::int[]) AND confidence_band = 'medium'
    GROUP BY bucket
    ORDER BY bucket
  `, [pairIdList]);
  console.log(`  v1.2 medium-band hard_evidence_count distribution:`);
  for (const row of r6b.rows) console.log(`    ${row.bucket}: ${row.n}`);

  // v1.3 cross-client edge count for new pairs
  const r6c = await client.query(`
    SELECT COUNT(*) AS new_pair_cross_edges
    FROM pair_adjacencies pa
    WHERE (pa.source_pair_id = ANY($1::int[]) OR pa.target_pair_id = ANY($1::int[]))
      AND pa.is_cross_client_edge = TRUE
  `, [pairIdList]);
  console.log(`  v1.3 cross-client adjacency edges involving new pairs: ${r6c.rows[0].new_pair_cross_edges}`);

  // Placeholder citation check
  const r7 = await client.query(`
    SELECT pe.id FROM pair_evidence pe
    WHERE pe.pair_id = ANY($1::int[])
      AND LOWER(pe.source_citation) IN ('industry knowledge','general knowledge','common knowledge')
  `, [pairIdList]);
  console.log(`  placeholder citations: ${r7.rows.length} (must be 0)`);
  if (r7.rows.length > 0) throw new Error('Placeholder citations detected — discipline violation');

  // ==========================================================================
  // Acceptance queries Q1-Q5
  // ==========================================================================
  console.log('\n=== Acceptance queries (Q1-Q5) ===');

  const Q1 = await client.query(`
    SELECT horizon, confidence_band, COUNT(*) AS pair_count
    FROM technology_application_pairs
    GROUP BY horizon, confidence_band
    ORDER BY horizon, confidence_band
  `);
  console.log(`  Q1 (pair count by horizon × confidence) : ${Q1.rows.length} rows`);
  for (const row of Q1.rows) console.log(`    ${row.horizon} / ${row.confidence_band} -> ${row.pair_count}`);

  const Q3 = await client.query(`
    SELECT co.name AS company, COUNT(DISTINCT cpl.pair_id) AS pairs_touched
    FROM catalogue.companies co
    JOIN catalogue.initiatives_v2 i ON i.company_id = co.id
    JOIN catalogue.components c ON c.initiative_id = i.id
    JOIN component_pair_links cpl ON cpl.component_id = c.id
    GROUP BY co.name
    ORDER BY pairs_touched DESC, co.name
  `);
  console.log(`  Q3 (pairs touched by client) : ${Q3.rows.length} rows`);
  for (const row of Q3.rows) console.log(`    ${row.company.padEnd(28)} ${row.pairs_touched}`);

  const Q5 = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE evidence_count = 0) AS pairs_with_no_evidence,
      COUNT(*) FILTER (WHERE evidence_count >= 2) AS pairs_with_2plus_evidence,
      COUNT(*) FILTER (WHERE url_count = evidence_count) AS pairs_all_evidence_url
    FROM (
      SELECT tap.id,
             COUNT(pe.id) AS evidence_count,
             COUNT(pe.id) FILTER (WHERE pe.source_url IS NOT NULL) AS url_count
      FROM technology_application_pairs tap
      LEFT JOIN pair_evidence pe ON pe.pair_id = tap.id
      WHERE tap.id = ANY($1::int[])
      GROUP BY tap.id
    ) sub
  `, [pairIdList]);
  console.log(`  Q5 (evidence quality audit, new pairs only):`);
  console.log(`    pairs with 0 evidence: ${Q5.rows[0].pairs_with_no_evidence} (must be 0)`);
  console.log(`    pairs with ≥2 evidence: ${Q5.rows[0].pairs_with_2plus_evidence} / ${PAIRS.length}`);
  console.log(`    pairs with all evidence URL-backed: ${Q5.rows[0].pairs_all_evidence_url} / ${PAIRS.length}`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — mobility ontology persisted.');
  } else {
    await client.query('ROLLBACK');
    console.log('\n[dry-run] ROLLBACK — no rows persisted. Run with --commit --confirm-yes to apply.');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\n[pg] ROLLBACK due to error:', err.message);
  console.error(err.stack);
  process.exit(2);
} finally {
  await client.end();
}
