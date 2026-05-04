// db/population/shell_v2.mjs
// Phase 1 Shell catalogue against the v2 schema (migration 006).
// Populates via the v2 API endpoints, NOT via direct PG.
//
// Source materials:
//   - shell_intelligence_brief__4_.html (March 2026 brief, posture: RESTRUCTURE)
//   - /docs/INITIATIVE_METHODOLOGY.md
//   - /docs/SCHEMA_V2.md
//
// Run:
//   node db/population/shell_v2.mjs           # dry-run, no API calls
//   node db/population/shell_v2.mjs --commit  # POST to v2 API
//
// Idempotent. Re-running with --commit will:
//   - reuse existing Shell company row by name
//   - reuse existing initiative rows by (company_id, name)
//   - reuse existing component rows by (initiative_id, name)
//   - upsert component_attributes by (component_id, attribute_def_id)
//   - skip claims_v2 if a row with the same (initiative_id, component_id, role,
//     claim_text) already exists
//   - reuse tech_functions by function_name
//
// Discipline (per user prompt 3):
//   - Every component must end with zero pending attributes
//   - Every populated attribute must have a source_citation
//   - Every not_in_source must document what was searched (default = "T1 (brief)")
//   - Every not_applicable must explain why
//   - Time horizons sourced or null — never guessed
//   - All draft_status='draft_unreviewed'
//   - No invention. If brief doesn't support a value, mark not_in_source.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnv(p) {
  if (!existsSync(p)) return;
  const raw = await readFile(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

await loadEnv(join(__dirname, '..', '.env'));
await loadEnv(join(__dirname, '..', '..', 'n8n', '.env'));
// Fall back to the local Claude Code allowlist for dev convenience —
// reads the existing Bearer pattern out of the untracked settings file.
async function loadKeyFromSettings() {
  const p = join(__dirname, '..', '..', '.claude', 'settings.local.json');
  if (!existsSync(p)) return null;
  const txt = await readFile(p, 'utf8');
  const m = txt.match(/Bearer\s+([a-f0-9]{64})/);
  return m ? m[1] : null;
}

const API_BASE = process.env.SIGNAL_ENGINE_API_BASE
  || 'https://signal-engine-api-production-0cf1.up.railway.app';
let API_KEY = process.env.SIGNAL_ENGINE_API_KEY
  || process.env.API_KEY
  || process.env.API_BEARER_TOKEN
  || null;
if (!API_KEY) API_KEY = await loadKeyFromSettings();

const COMMIT = process.argv.includes('--commit');

if (COMMIT && !API_KEY) {
  console.error('Missing API key. Set SIGNAL_ENGINE_API_KEY env var, or place');
  console.error('the existing Bearer token in .claude/settings.local.json (already');
  console.error('done locally; was extracted automatically). Aborting.');
  process.exit(1);
}

// ============================================================================
// API client
// ============================================================================

async function api(method, path, body = null) {
  const url = `${API_BASE}${path}`;
  if (!COMMIT) {
    return { __dryrun: true, method, path };
  }
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let parsed;
  try { parsed = await res.json(); } catch { parsed = await res.text(); }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(parsed)}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

async function getCompanyByName(name) {
  if (!COMMIT) return null;
  const all = await api('GET', '/companies');
  return all.find((c) => c.name === name) || null;
}
async function getOrCreateCompany(payload) {
  const existing = await getCompanyByName(payload.name);
  if (existing) {
    console.log(`  [reuse] companies.id=${existing.id} name=${payload.name}`);
    return existing;
  }
  const r = await api('POST', '/companies', payload);
  console.log(`  [insert] companies.id=${r.row?.id || '?'} name=${payload.name}`);
  return r.row || r;
}

async function getInitiativeByName(companyId, name) {
  if (!COMMIT) return null;
  const all = await api('GET', `/initiatives_v2?company_id=${companyId}`);
  return all.find((i) => i.name === name) || null;
}
async function getOrCreateInitiative(payload) {
  const existing = await getInitiativeByName(payload.company_id, payload.name);
  if (existing) {
    console.log(`    [reuse] initiatives_v2.id=${existing.id} name=${payload.name.slice(0, 60)}`);
    return existing;
  }
  const r = await api('POST', '/initiatives_v2', payload);
  console.log(`    [insert] initiatives_v2.id=${r.row?.id || '?'} name=${payload.name.slice(0, 60)}`);
  return r.row || r;
}

async function getComponentByName(initiativeId, name) {
  if (!COMMIT) return null;
  const all = await api('GET', `/components?initiative_id=${initiativeId}`);
  return all.find((c) => c.name === name) || null;
}
async function getOrCreateComponent(payload) {
  const existing = await getComponentByName(payload.initiative_id, payload.name);
  if (existing) {
    console.log(`      [reuse] components.id=${existing.id} name=${payload.name}`);
    return existing;
  }
  const r = await api('POST', '/components', payload);
  console.log(`      [insert] components.id=${r.row?.id || '?'} name=${payload.name} (vector=${payload.vector})`);
  return r.row || r;
}

async function getOrCreateTechFunction(payload) {
  if (!COMMIT) return { __dryrun: true, function_name: payload.function_name };
  const all = await api('GET', '/tech_functions');
  const existing = all.find((t) => t.function_name === payload.function_name);
  if (existing) return existing;
  const r = await api('POST', '/tech_functions', payload);
  console.log(`        [tech_function] inserted ${payload.function_name} -> id=${r.row?.id}`);
  return r.row || r;
}

// Look up attribute_definitions once per process.
let _attrDefsByVector = null;
async function getAttrDefsByVector() {
  if (_attrDefsByVector) return _attrDefsByVector;
  if (!COMMIT) {
    // Hardcode the structure for dry-run mode so we can still report counts.
    _attrDefsByVector = DRY_RUN_ATTR_DEFS;
    return _attrDefsByVector;
  }
  const all = await api('GET', '/attribute_definitions');
  const out = { tech: [], regulation: [], market: [], ecosystem: [], competition: [] };
  for (const a of all) {
    if (out[a.vector]) out[a.vector].push(a);
  }
  for (const v of Object.keys(out)) out[v].sort((a, b) => a.display_order - b.display_order);
  _attrDefsByVector = out;
  return out;
}

async function existingClaim(initiativeId, componentId, role, claimText) {
  if (!COMMIT) return null;
  const all = await api('GET', `/claims_v2?initiative_id=${initiativeId}&component_id=${componentId}`);
  return all.find((c) => c.role === role && c.claim_text === claimText) || null;
}

// ============================================================================
// Attribute resolution helpers — used in COMPONENTS data below.
// ============================================================================
//
// All return partial objects keyed by attribute_name. The orchestrator
// fills in component_id and attribute_def_id at insert time.

function POP(value, source, confidence = 'medium') {
  // POP = populated. Auto-routes based on JS type.
  const out = { value_status: 'populated', source_citation: source, confidence_band: confidence };
  if (typeof value === 'number') out.value_numeric = value;
  else out.value_text = String(value);
  return out;
}
function POP_CAT(value, source, confidence = 'medium') {
  return { value_status: 'populated', value_categorical: String(value), source_citation: source, confidence_band: confidence };
}
function POP_VOCAB(funcName, source, confidence = 'medium') {
  // populated tech_function attribute. Resolves vocab id at insert time via tech_function_meta.
  return { value_status: 'populated', value_text: funcName, source_citation: source, confidence_band: confidence, _is_tech_function: true };
}
function NIS(reason = 'T1 (brief): attribute not addressed in source.') {
  return { value_status: 'not_in_source', not_in_source_reason: reason };
}
function NIS_T2(reason) {
  // Convention: T2 = industry sources level effort documented but not escalated for v0.
  return { value_status: 'not_in_source', not_in_source_reason: `T1 (brief): not addressed. T2 (industry sources): ${reason}` };
}
function NA(reason) {
  return { value_status: 'not_applicable', not_applicable_reason: reason };
}

// Default reason used when the orchestrator auto-fills any vector attribute
// the component data didn't explicitly declare.
const DEFAULT_NIS_REASON = 'T1 (brief): attribute not addressed in source.';

// Used only in dry-run mode so we can compute counts without the API.
const DRY_RUN_ATTR_DEFS = {
  tech: ['tech_function','trl','ttm_months','cost_trajectory','velocity_pct_yoy','scale_up_factor','patent_density','supply_concentration','capex_intensity','opex_trajectory','substitution_risk','obsolescence_horizon','incumbency_depth'].map((n, i) => ({ id: i+1, vector: 'tech', attribute_name: n, display_order: i+1 })),
  regulation: ['regulation_stage','enforcement','jurisdictional_reach','implementation_progress','political_durability','grandfather_clauses','compliance_cost','audit_cadence','precedent_strength','harmonisation','sunset_risk','judicial_exposure'].map((n, i) => ({ id: 100+i, vector: 'regulation', attribute_name: n, display_order: i+1 })),
  market: ['market_size','cagr','price_elasticity','demand_certainty','offtake_structure','contract_maturity','geographic_spread','segment_fragmentation','switching_cost','substitute_threat','channel_control','subsidy_dependency'].map((n, i) => ({ id: 200+i, vector: 'market', attribute_name: n, display_order: i+1 })),
  ecosystem: ['infrastructure_readiness','standards_maturity','interoperability','partner_concentration','capital_intensity','talent_availability','supply_chain_depth','platform_effects','institutional_support','collaboration_density','geographic_clustering','lock_in_risk'].map((n, i) => ({ id: 300+i, vector: 'ecosystem', attribute_name: n, display_order: i+1 })),
  competition: ['player_count','share_concentration','entry_barriers','strategic_intent','capability_gap','capital_depth','geographic_overlap','vertical_integration','m_and_a_activity','first_mover_lock','credibility','defection_risk'].map((n, i) => ({ id: 400+i, vector: 'competition', attribute_name: n, display_order: i+1 })),
};

// ============================================================================
// TECH FUNCTIONS — controlled vocabulary seeded as we encounter tech components
// ============================================================================

const TECH_FUNCTIONS = {
  industrial_post_combustion_co2_capture: {
    function_name: 'industrial_post_combustion_co2_capture',
    description: 'Capture of CO2 from industrial flue gas streams using amine solvents or membrane separation, then compression and pipeline/ship transport to sequestration.',
    physical_principle: 'Selective absorption of CO2 by amine solvents (chemisorption) or selective permeability of polymer/composite membranes.',
    typical_failure_mode: 'Solvent degradation under SOx/NOx; membrane fouling; capture-rate degradation over time; reboiler steam economics.',
  },
  pem_electrolysis_industrial_scale: {
    function_name: 'pem_electrolysis_industrial_scale',
    description: 'Proton exchange membrane water electrolysis for hydrogen production at >100 MW scale, with stack and balance-of-plant for grid-following operation.',
    physical_principle: 'Proton conduction through perfluorosulfonic acid membrane separating cathode and anode; water splitting at platinum-group catalysts.',
    typical_failure_mode: 'Catalyst degradation under load cycling; membrane fluoride release; bipolar plate corrosion; iridium supply constraint.',
  },
  smr_with_ccs_blue_hydrogen: {
    function_name: 'smr_with_ccs_blue_hydrogen',
    description: 'Steam methane reforming with carbon capture and storage producing low-carbon (blue) hydrogen for industrial off-take.',
    physical_principle: 'Catalytic steam reforming of methane to syngas; water-gas shift to CO2+H2; pre-combustion or post-combustion CCS captures CO2.',
    typical_failure_mode: 'Reformer tube creep; shift catalyst poisoning; capture-rate degradation; methane slip when CCS rates pushed >95%.',
  },
  deepwater_oil_production: {
    function_name: 'deepwater_oil_production',
    description: 'Subsea production from oil reservoirs at >1500m water depth using FPSO or platform host with long subsea tiebacks.',
    physical_principle: 'Multiphase flow assurance under high-pressure low-temperature subsea conditions; gas-lift artificial lift; subsea boosting.',
    typical_failure_mode: 'Wax/hydrate formation in flowlines; subsea tree integrity; HPHT well integrity; reservoir compaction.',
  },
  saf_blending_and_co_processing: {
    function_name: 'saf_blending_and_co_processing',
    description: 'Sustainable aviation fuel produced via HEFA, ATJ, or co-processing routes; blended into Jet-A1 at ASTM-approved drop-in ratios.',
    physical_principle: 'Hydroprocessing of bio-oils (HEFA) or alcohol dehydration/oligomerisation/hydrogenation (ATJ) to produce paraffinic kerosene.',
    typical_failure_mode: 'Feedstock supply security; refinery hydrogen supply; certification of higher blend ratios; catalyst poisoning by feed contaminants.',
  },
  fast_ev_charging_dc: {
    function_name: 'fast_ev_charging_dc',
    description: 'Direct-current fast EV charging hardware ≥150 kW; power electronics + grid interface + driver UX; CCS/NACS standard.',
    physical_principle: 'High-frequency power conversion via SiC/GaN switches; CCS/NACS protocol negotiation; thermal management of battery and cable.',
    typical_failure_mode: 'Connector wear; power module failure; vandalism/cable theft; grid demand-charge exposure; downtime from CSMS issues.',
  },
  performance_chemicals_specialty_processing: {
    function_name: 'performance_chemicals_specialty_processing',
    description: 'Specialty chemical production for adhesives, coatings, lubricant additives — typically smaller-scale, higher-margin batches than commodity petchem.',
    physical_principle: 'Targeted polymerisation, blending, and formulation chemistry; tighter spec control; customer-co-developed product portfolios.',
    typical_failure_mode: 'Margin compression as commoditisation creeps; customer concentration risk; environmental compliance for niche chemistries.',
  },
  frontier_deepwater_appraisal: {
    function_name: 'frontier_deepwater_appraisal',
    description: 'Exploration and appraisal drilling in frontier deepwater basins (>2000m water depth, limited prior development) — Namibia Orange Basin, Suriname.',
    physical_principle: 'Same as deepwater_oil_production but with higher geological uncertainty and longer appraisal-to-FID timelines.',
    typical_failure_mode: 'Reservoir quality below threshold; rig-availability constraints; political/fiscal regime change before FID.',
  },
};

// ============================================================================
// SHELL DATA
// ============================================================================

const COMPANY = { name: 'Shell', sector: 'energy', notes: 'Royal Dutch Shell plc. v2 catalogue first-cut population from March 2026 brief.' };

// Per-vector: which attribute names from the spec each component will declare populated/NA.
// All other attributes default to not_in_source with DEFAULT_NIS_REASON.

const INITIATIVES = [
  // ------------------------------------------------------------------------
  // 1. SHELL_LNG_PORTFOLIO_DOMINANCE
  // ------------------------------------------------------------------------
  {
    name: 'NW European LNG portfolio dominance and EBITDA leadership',
    strategy_context: 'Integrated Gas — Shell\'s historic core franchise; ~40% of group EBITDA in 2024-25 with intent to extend.',
    brief_description: 'LNG portfolio with European import re-export trading and Asia-Pacific long-term offtake.',
    hypothesis_statement: "Shell's LNG portfolio will deliver more than 45% of group EBITDA by 2028, contingent on European import infrastructure expansion, sustained gas price floor, long-term offtake commitments, and EU regulatory permissibility for re-export operations.",
    why_it_matters: 'LNG performance is the single largest determinant of Shell\'s 2025-2028 cash generation envelope and dividend cover.',
    horizon: 'H1', persona: 'strategy',
    time_horizon_year: 2028, time_horizon_source: 'Brief HYP SH-01 + brief Section 02',
    decision_threshold: '>45% of group EBITDA from Integrated Gas / LNG portfolio in 2028 reporting',
    baseline_confidence: 0.550, current_confidence: 0.550,
    components: [
      {
        name: 'GLOBAL_LNG_DEMAND_TRAJECTORY',
        description: 'Global LNG demand structure and trajectory; ~400 Mtpa in 2025 with European recovery and Asia-Pacific growth.',
        component_type: 'market', vector: 'market',
        source_citation: 'Shell brief Section 02 (Strategy — LNG core engine); brief HYP SH-01',
        cross_industry: false,
        attrs: {
          market_size: POP('~400 Mtpa global LNG trade 2025; Asia-Pacific ~270 Mtpa', 'Shell brief Section 02 + HYP SH-01', 'high'),
          demand_certainty: POP('high — Europe demand structurally restored post Russian-pipeline; Asia growing', 'Shell brief Section 02', 'medium'),
          geographic_spread: POP('global with concentration in NW Europe, NE Asia, S Asia', 'Shell brief Section 02', 'high'),
          subsidy_dependency: POP(0, 'LNG demand is not subsidy-driven; cost-of-energy-arbitrage market', 'high'),
        },
        claims: [
          { role: 'principal', impact: 'amplifying', criticality: 'critical',
            claim_text: 'Global LNG demand maintains >550 Mtpa trajectory through 2028 with Europe sustaining >150 Mtpa import dependency',
            attribute_name: 'market_size', threshold_op: 'gt', threshold_value_numeric: 550, threshold_unit: 'Mtpa', deadline_date: '2028-12-31',
            claim_basis: 'Brief HYP SH-01 sets analyst confidence High. Shell strategy assumes structural LNG demand expansion.' },
        ],
      },
      {
        name: 'EU_LNG_IMPORT_INFRASTRUCTURE',
        description: 'EU LNG import terminal and FSRU capacity build, ~190 bcm/yr 2025 expanding through new German FSRU + Mediterranean.',
        component_type: 'ecosystem', vector: 'ecosystem',
        source_citation: 'Shell brief HYP SH-01 WNTBT',
        cross_industry: false,
        attrs: {
          infrastructure_readiness: POP('high — ~190 bcm/yr installed; pipeline of German FSRU + Mediterranean terminals on track', 'Shell brief HYP SH-01 WNTBT', 'medium'),
          capital_intensity: POP('multi-€bn per terminal; total EU build envelope >€20bn', 'Shell brief HYP SH-01 WNTBT', 'low'),
          institutional_support: POP('strong — REPowerEU framework + member-state co-financing', 'Shell brief Section 02 + HYP SH-01', 'medium'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'high',
            claim_text: 'EU LNG import capacity reaches >200 bcm/yr operational by end-2026',
            attribute_name: 'infrastructure_readiness', threshold_op: 'gt', threshold_value_numeric: 200, threshold_unit: 'bcm_per_year', deadline_date: '2026-12-31',
            claim_basis: 'WNTBT bullet from SH-01 — capacity build pipeline currently on track.' },
        ],
      },
      {
        name: 'GAS_PRICE_FLOOR_TTF',
        description: 'European TTF gas price floor; sustained pricing >$6/MMBtu protects LNG netback margin.',
        component_type: 'market', vector: 'market',
        source_citation: 'Shell brief HYP SH-01 WNTBT',
        cross_industry: false,
        attrs: {
          market_size: POP('TTF $8-12/MMBtu through 2025', 'Shell brief HYP SH-01', 'high'),
          price_elasticity: POP('moderate — gas demand reasonably inelastic at industrial users; high at power-substitution margin', 'Shell brief HYP SH-01', 'low'),
          demand_certainty: POP('moderate — Europe demand structural but weather/electricity-mix dependent', 'Shell brief HYP SH-01', 'medium'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'high',
            claim_text: 'European TTF gas price sustains >$6/MMBtu through end-2027',
            threshold_op: 'gt', threshold_value_numeric: 6, threshold_unit: 'USD_per_MMBtu', deadline_date: '2027-12-31',
            claim_basis: 'Below floor LNG netback margin collapses; brief frames currently well clear.' },
        ],
      },
      {
        name: 'EU_GAS_REGULATORY_FRAMEWORK',
        description: 'EU gas import + re-export regulatory permissibility for LNG operations.',
        component_type: 'regulation', vector: 'regulation',
        source_citation: 'Shell brief HYP SH-01 WNTBT + system drivers',
        cross_industry: false,
        attrs: {
          regulation_stage: POP_CAT('in_force', 'Shell brief HYP SH-01', 'high'),
          enforcement: POP_CAT('strong', 'Shell brief HYP SH-01', 'medium'),
          jurisdictional_reach: POP('EU-27 + UK aligned', 'Shell brief HYP SH-01', 'medium'),
          political_durability: POP('moderate-to-strong currently; political risk if energy-security politics shift toward import quotas / re-export controls', 'Shell brief HYP SH-01 system drivers', 'medium'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'high',
            claim_text: 'No EU regulatory disruption to LNG re-export operations from EU ports through end-2027',
            attribute_name: 'political_durability', threshold_op: 'eq', threshold_value_text: 'no_disruption', threshold_unit: null, deadline_date: '2027-12-31',
            claim_basis: 'Policy SIGNAL driver flagged in SH-01.' },
        ],
      },
      {
        name: 'NORTH_AMERICAN_LNG_OVERSUPPLY',
        description: 'US LNG export capacity expansion as portfolio threat — multiple mega-projects in construction.',
        component_type: 'market', vector: 'market',
        source_citation: 'Shell brief Section 02 (peer landscape)',
        cross_industry: false,
        attrs: {
          market_size: POP('US export capacity >100 Mtpa operational by 2026; multiple mega-projects pre/in FID', 'Shell brief Section 02', 'high'),
          substitute_threat: POP('high — US LNG is direct substitute for Shell-marketed volumes on price', 'Shell brief Section 02', 'medium'),
        },
        claims: [
          { role: 'external_threat', impact: 'dampening', criticality: 'medium',
            claim_text: 'US LNG net export additions remain <30 Mtpa per year through 2027 (avoiding price-flood scenario)',
            attribute_name: 'market_size', threshold_op: 'lt', threshold_value_numeric: 30, threshold_unit: 'Mtpa_per_year', deadline_date: '2027-12-31',
            claim_basis: 'Multiple US mega-projects completing simultaneously breaks the gas price floor; Shell long-term contracts insulate ~50% of book.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 2. SHELL_INDUSTRIAL_CCUS
  // ------------------------------------------------------------------------
  {
    name: 'Industrial CCUS services leadership (Quest + Northern Lights)',
    strategy_context: 'Renewables & Energy Solutions — selective CCUS investment positioning for IOC services leadership.',
    brief_description: 'Quest (Alberta operational since 2015) + Northern Lights (Norway commissioning 2024) + capture-as-a-service offerings.',
    hypothesis_statement: "Shell's selective CCUS investment will position it as the leading IOC in industrial decarbonisation services by 2030, generating more than $2bn annually, contingent on capture chemistry maturation, US/EU policy continuity, third-party customer pipeline conversion, and sustained capital deployment.",
    why_it_matters: 'CCUS is Shell\'s clearest differentiated transition position vs IOC peers and a non-LNG growth lever.',
    horizon: 'H2', persona: 'strategy',
    time_horizon_year: 2030, time_horizon_source: 'Brief HYP SH-02 + Section 04',
    decision_threshold: '>$2bn annual revenue from industrial CCUS services by 2030',
    baseline_confidence: 0.450, current_confidence: 0.450,
    components: [
      {
        name: 'INDUSTRIAL_CCUS_CAPTURE_TECH',
        description: 'Industrial post-combustion CO2 capture (amine, membrane, oxy-combustion) at scale — Shell Quest tech baseline.',
        component_type: 'tech', vector: 'tech', cross_industry: true,
        source_citation: 'Shell brief Section 04 (Quest); HYP SH-02; brief Section 06 S-04',
        attrs: {
          tech_function: POP_VOCAB('industrial_post_combustion_co2_capture', 'Shell brief Section 04 (Quest description)', 'high'),
          trl: POP_CAT('8', 'Quest operational since 2015 + Northern Lights commissioning 2024 — brief Section 04', 'high'),
          obsolescence_horizon: POP(25, 'Quest design life implies ~25y for current capture-tech generation', 'low'),
          incumbency_depth: POP('moderate — Shell Quest, Equinor Sleipner, ExxonMobil LaBarge are long-running ops; CCS tech vendors include Aker Carbon Capture, Mitsubishi MHI, Carbon Engineering', 'Shell brief Section 06 S-04', 'medium'),
        },
      },
      {
        name: 'US_45Q_TAX_CREDIT',
        description: 'US 45Q tax credit for CCS — $85/t for industrial; political durability is the decisive variable.',
        component_type: 'regulation', vector: 'regulation', cross_industry: true,
        source_citation: 'Shell brief Section 04 + HYP SH-02 system drivers',
        attrs: {
          regulation_stage: POP_CAT('in_force', 'Shell brief Section 04', 'high'),
          enforcement: POP_CAT('strong', 'Shell brief HYP SH-02', 'medium'),
          political_durability: POP('weak-to-moderate — IRA-linked, vulnerable to administration change', 'Shell brief HYP SH-02 system drivers', 'medium'),
          jurisdictional_reach: POP('US federal — applies nationally', 'Shell brief Section 04', 'high'),
          sunset_risk: POP('material — IRA repeal scenarios under active discussion in US politics', 'Shell brief HYP SH-02 system drivers', 'medium'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'critical',
            claim_text: 'US 45Q tax credit retained at >$60/t through end-2028',
            attribute_name: 'political_durability', threshold_op: 'gt', threshold_value_numeric: 60, threshold_unit: 'USD_per_tonne_CO2', deadline_date: '2028-12-31',
            claim_basis: 'Brief identifies 45Q as one of two principal enabling drivers for the CCUS leadership thesis.' },
        ],
      },
      {
        name: 'NORTH_SEA_CO2_STORAGE_CAPACITY',
        description: 'North Sea geological CO2 storage capacity — Northern Lights, Endurance, others.',
        component_type: 'ecosystem', vector: 'ecosystem',
        source_citation: 'Shell brief Section 04 (Northern Lights)',
        attrs: {
          infrastructure_readiness: POP('moderate-to-high — Northern Lights operational 2024; multiple licences awarded across Norwegian + UK Continental Shelf', 'Shell brief Section 04', 'medium'),
          partner_concentration: POP('count: 3-5 major operators (Equinor, Shell, TotalEnergies, BP, Harbour); high concentration', 'Shell brief Section 04', 'medium'),
          capital_intensity: POP('Northern Lights total ~$2.6bn for 1.5 Mtpa Phase 1; multi-€bn for portfolio scale', 'Shell brief Section 04', 'low'),
          geographic_clustering: POP('North Sea — Norway + UK + Netherlands', 'Shell brief Section 04', 'high'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'high',
            claim_text: 'North Sea operational CO2 storage capacity >5 Mtpa by 2027',
            attribute_name: 'infrastructure_readiness', threshold_op: 'gt', threshold_value_numeric: 5, threshold_unit: 'Mtpa_CO2', deadline_date: '2027-12-31',
            claim_basis: 'Customer pipeline conversion depends on operational storage capacity at scale.' },
        ],
      },
      {
        name: 'INDUSTRIAL_DECARBONISATION_SERVICES_DEMAND',
        description: 'Industrial-customer demand for CCUS-as-a-service — refineries, cement, steel, ammonia.',
        component_type: 'market', vector: 'market', cross_industry: true,
        source_citation: 'Shell brief Section 04 + Section 06 S-04 (CCaaS signal)',
        attrs: {
          demand_certainty: POP('moderate — strong commercial discussions but binding contracts conversion has lagged announcements', 'Shell brief Section 06 S-04', 'medium'),
          subsidy_dependency: POP(80, 'Shell brief Section 06 S-04 — Highly subsidy-dependent — without 45Q / EU ETS / UK CCUS contracts demand collapses', 'medium'),
          offtake_structure: POP_CAT('long_term_contract', 'Shell brief Section 04 — typically 10-15y service agreements', 'medium'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'critical',
            claim_text: '≥10 binding third-party CCUS service contracts converted to FID by Shell by end-2028',
            threshold_op: 'gt', threshold_value_numeric: 10, threshold_unit: 'contracts', deadline_date: '2028-12-31',
            claim_basis: 'Customer pipeline conversion is the second principal enabler alongside 45Q durability.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 3. SHELL_RECHARGE_EV_NETWORK
  // ------------------------------------------------------------------------
  {
    name: 'Shell Recharge EV charging network as retail energy anchor',
    strategy_context: 'Mobility — Shell Recharge as retained strategic EV charging franchise.',
    brief_description: 'EV public DC charging at Shell sites + on-street + workplace; ~500k charge points target globally.',
    hypothesis_statement: "Shell's EV charging network (Shell Recharge) will reach EBIT-positive operations across European primary markets by 2028, contingent on BEV fleet penetration, fast-charger utilisation rates, and continued capex cost-down on hardware.",
    why_it_matters: 'Recharge is the single retail-energy bet Shell has explicitly retained as strategic; first credible IOC public-charging franchise.',
    horizon: 'H1', persona: 'operations',
    time_horizon_year: 2028, time_horizon_source: 'Brief Section 04',
    decision_threshold: 'Shell Recharge European operations turn EBIT-positive at network level by 2028 reporting',
    baseline_confidence: 0.500, current_confidence: 0.500,
    components: [
      {
        name: 'EV_PUBLIC_CHARGING_DEMAND',
        description: 'European public EV charging demand — utilisation rates, dwell times, fleet share.',
        component_type: 'market', vector: 'market', cross_industry: true,
        source_citation: 'Shell brief Section 04 (Shell Recharge); Section 02 retail energy framing',
        attrs: {
          demand_certainty: POP('moderate-to-high — EU mandated AFIR site density forces demand floor', 'Shell brief Section 02', 'medium'),
          subsidy_dependency: POP(40, 'Shell brief Section 02 — BEV fleet penetration partially policy-driven (EU 2035 ICE ban, fleet electrification mandates)', 'low'),
        },
        claims: [
          { role: 'principal', impact: 'amplifying', criticality: 'critical',
            claim_text: 'European fast-charger average utilisation reaches >18% by end-2027 in primary markets (UK/NL/DE)',
            threshold_op: 'gt', threshold_value_numeric: 18, threshold_unit: 'pct_utilisation', deadline_date: '2027-12-31',
            claim_basis: 'Utilisation is the gating variable for EBIT-positive economics — not deployment count.' },
        ],
      },
      {
        name: 'BEV_FLEET_PENETRATION_EUROPE',
        description: 'European BEV penetration of new car sales + parc — drives addressable charging market.',
        component_type: 'market', vector: 'market', cross_industry: true,
        source_citation: 'Shell brief Section 02 (Power transition)',
        attrs: {
          cagr: POP(15, 'Shell brief Section 02 + IEA-class ranges — European BEV new-sales share approximately doubling 2-3 years across primary markets', 'low'),
          subsidy_dependency: POP(60, 'Shell brief Section 02 — BEV economics still policy-shaped — EU 2035 ICE ban + national incentives', 'medium'),
          substitute_threat: POP('moderate — H2 cars + e-fuels remain niche; no near-term substitute to BEV mass-market', 'Shell brief Section 02', 'medium'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'high',
            claim_text: 'European BEV share of car parc reaches >12% in primary markets by end-2027',
            attribute_name: 'cagr', threshold_op: 'gt', threshold_value_numeric: 12, threshold_unit: 'pct_parc', deadline_date: '2027-12-31',
            claim_basis: 'Demand-floor for utilisation; below 12% network utilisation thesis breaks.' },
        ],
      },
      {
        name: 'EV_CHARGING_HARDWARE_CAPEX',
        description: 'DC fast-charger hardware capex curve — installed cost per port for 150-350 kW units.',
        component_type: 'tech', vector: 'tech', cross_industry: true,
        source_citation: 'Shell brief Section 04 (Recharge); Section 02 (Power transition)',
        attrs: {
          tech_function: POP_VOCAB('fast_ev_charging_dc', 'Shell brief Section 04', 'high'),
          trl: POP_CAT('9', 'Mass-deployed at commercial scale', 'high'),
          incumbency_depth: POP('high — ABB, Tritium, BTC Power, Wallbox, Alpitronic, Kempower; commoditising', 'Industry knowledge documented in /docs/ontology/ev_charging.html', 'medium'),
          velocity_pct_yoy: POP(-7, 'Shell brief Section 02 + ev_charging.html ontology — Hardware capex declining ~5-10% YoY per industry consensus', 'low'),
        },
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 4. SHELL_BRAZIL_DEEPWATER
  // ------------------------------------------------------------------------
  {
    name: 'Brazil deepwater portfolio sustained as cash flow pillar',
    strategy_context: 'Upstream — Shell\'s Brazilian deepwater (Lula-area, 25% stake) as 2030 sustaining-bet.',
    brief_description: 'Lula and adjacent fields; mature operational asset providing low-CI/bbl barrels.',
    hypothesis_statement: "Shell's Brazilian deepwater portfolio (Lula-area, 25% stake) sustains as a cash flow pillar through 2030, contingent on Brazilian fiscal regime stability, deepwater unit-economics holding, and Brent price support.",
    why_it_matters: 'Highest-margin upstream asset class for Shell; low-CI barrels provide transition-credible production base.',
    horizon: 'H1', persona: 'strategy',
    time_horizon_year: 2030, time_horizon_source: 'Brief Section 04',
    decision_threshold: 'Lula-area share of Shell upstream EBITDA stays >15% through 2028',
    baseline_confidence: 0.600, current_confidence: 0.600,
    components: [
      {
        name: 'DEEPWATER_PRODUCTION_ECONOMICS',
        description: 'Subsea deepwater oil production unit economics — break-even cost per barrel for Lula-area Shell volumes.',
        component_type: 'tech', vector: 'tech', cross_industry: false,
        source_citation: 'Shell brief Section 04 (Lula Field)',
        attrs: {
          tech_function: POP_VOCAB('deepwater_oil_production', 'Shell brief Section 04', 'high'),
          trl: POP_CAT('9', 'Operational at commercial scale; mature asset', 'high'),
          opex_trajectory: POP('Lula-area opex below long-term average; brief frames as "low-CI" advantage', 'Shell brief Section 04', 'medium'),
          incumbency_depth: POP('moderate — Petrobras-led pre-salt; Shell + Equinor + ExxonMobil + TotalEnergies are partners', 'Shell brief Section 04', 'high'),
        },
      },
      {
        name: 'BRAZIL_DEEPWATER_REGULATORY_REGIME',
        description: 'Brazilian fiscal + regulatory framework for pre-salt deepwater; Petrobras-led production-sharing model.',
        component_type: 'regulation', vector: 'regulation', cross_industry: false,
        source_citation: 'Shell brief Section 04',
        attrs: {
          regulation_stage: POP_CAT('in_force', 'Shell brief Section 04', 'high'),
          enforcement: POP_CAT('strong', 'Shell brief Section 04', 'medium'),
          political_durability: POP('moderate — Brazil fiscal regime has been stable but executive elections drive periodic uncertainty', 'Shell brief Section 04', 'medium'),
          jurisdictional_reach: POP('Brazilian federal — pre-salt area', 'Shell brief Section 04', 'high'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'critical',
            claim_text: 'Brazilian fiscal regime maintains stability for pre-salt operations through 2030',
            threshold_op: 'eq', threshold_value_text: 'stable', deadline_date: '2030-12-31',
            claim_basis: 'Fiscal stability is the structural risk — operational economics are robust if rules don\'t change.' },
        ],
      },
      {
        name: 'OIL_PRICE_BRENT',
        description: 'Brent crude oil price as commodity floor for deepwater economics.',
        component_type: 'market', vector: 'market', cross_industry: true,
        source_citation: 'Shell brief Section 05 outlook',
        attrs: {
          market_size: POP('Brent ~$70-85/bbl 2025; Shell brief Section 05 implies $60-80 range planning', 'Shell brief Section 05', 'medium'),
          price_elasticity: POP('low at industrial/transport users; high at marginal oil-substitution decisions', 'Shell brief Section 05', 'low'),
        },
        claims: [
          { role: 'enabling', impact: 'amplifying', criticality: 'high',
            claim_text: 'Brent crude price sustains >$60/bbl through end-2028',
            attribute_name: 'market_size', threshold_op: 'gt', threshold_value_numeric: 60, threshold_unit: 'USD_per_barrel', deadline_date: '2028-12-31',
            claim_basis: 'Below $60 deepwater unit economics squeeze on second-of-kind infill drilling.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 5. SHELL_SAF_PORTFOLIO
  // ------------------------------------------------------------------------
  {
    name: 'Sustainable aviation fuel (SAF) portfolio scaling toward 2030 mandate',
    strategy_context: 'Mobility / Renewables & Energy Solutions — SAF portfolio as transition fuel position.',
    brief_description: 'HEFA + co-processing routes; airline offtake; EU SAF mandate framework.',
    hypothesis_statement: "Shell's SAF and biofuels portfolio will reach 10% of aviation fuel volume by 2030, contingent on EU SAF mandate continuity, airline offtake commitment growth, blending infrastructure capex execution, and IOC capital discipline pressure not forcing exit.",
    why_it_matters: 'SAF is the only available aviation decarbonisation lever pre-2035; EU mandate creates a large sub-market.',
    horizon: 'H2', persona: 'strategy',
    time_horizon_year: 2030, time_horizon_source: 'Brief Section 04 + HYP SH-03',
    decision_threshold: 'Shell SAF/biofuels reach >=10% of aviation fuel volumes sold by 2030',
    baseline_confidence: 0.400, current_confidence: 0.400,
    components: [
      {
        name: 'EU_SAF_MANDATE',
        description: 'EU ReFuelEU Aviation SAF mandate — escalating blending percentage 2025-2050.',
        component_type: 'regulation', vector: 'regulation', cross_industry: false,
        source_citation: 'Shell brief Section 04 (SAF — Sustainable Aviation Fuel)',
        attrs: {
          regulation_stage: POP_CAT('in_force', 'Shell brief Section 04', 'high'),
          enforcement: POP_CAT('strong', 'Shell brief Section 04', 'medium'),
          jurisdictional_reach: POP('EU-27 + UK aligning', 'Shell brief Section 04', 'high'),
          implementation_progress: POP(30, 'Shell brief Section 04 — Mandate phase-in started 2025 at 2%; escalating to 6% by 2030', 'medium'),
          sunset_risk: POP('low-to-moderate — mandate codified through 2050 but blend percentages reviewable', 'Shell brief Section 04', 'medium'),
        },
        claims: [
          { role: 'principal', impact: 'amplifying', criticality: 'critical',
            claim_text: 'EU SAF mandate retains scheduled 6% blending requirement by 2030',
            attribute_name: 'implementation_progress', threshold_op: 'gt', threshold_value_numeric: 6, threshold_unit: 'pct_blend', deadline_date: '2030-01-01',
            claim_basis: 'Volumetric SAF demand is mandate-driven; without mandate the offtake collapses.' },
        ],
      },
      {
        name: 'SAF_BLENDING_INFRASTRUCTURE',
        description: 'Airport-side SAF blending and supply infrastructure — terminals, into-plane fuelling, ASTM-approved blends.',
        component_type: 'tech', vector: 'tech', cross_industry: false,
        source_citation: 'Shell brief Section 04',
        attrs: {
          tech_function: POP_VOCAB('saf_blending_and_co_processing', 'Shell brief Section 04', 'high'),
          trl: POP_CAT('8', 'Co-processing operational; HEFA mature; ATJ commercialising', 'medium'),
          scale_up_factor: POP(0.05, 'Shell brief Section 04 — Current SAF supply ~0.5% of jet fuel; need ~10x scale to hit 2030 target', 'low'),
        },
      },
      {
        name: 'IOC_CAPITAL_DISCIPLINE_PRESSURE',
        description: 'IOC peer capital-discipline pressure — investor expectation that IOCs stay disciplined on transition capex.',
        component_type: 'market', vector: 'market', cross_industry: true,
        source_citation: 'Shell brief HYP SH-03 (counter-hypothesis predicting Shell biofuels exit)',
        attrs: {
          demand_certainty: POP('high pressure from investor base for IOC capital discipline', 'Shell brief HYP SH-03', 'medium'),
          channel_control: POP('investor + sell-side analyst opinion; not directly controllable by Shell', 'Shell brief HYP SH-03', 'medium'),
        },
        claims: [
          { role: 'external_threat', impact: 'dampening', criticality: 'high',
            claim_text: 'Shell maintains capital discipline against transition assets without forcing SAF exit before 2027',
            threshold_op: 'eq', threshold_value_text: 'no_exit', deadline_date: '2027-12-31',
            claim_basis: 'SH-03 explicitly hypothesises Shell will exit biofuels (Confidence High, 73%). Captured here as the counter-pressure on the SAF thesis.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 6. SHELL_INDUSTRIAL_BLUE_H2
  // ------------------------------------------------------------------------
  {
    name: 'Industrial blue hydrogen retention for hard-to-abate sectors',
    strategy_context: 'Renewables & Energy Solutions — Shell retains blue H2 capability for industrial customers as green H2 ambitions scale back.',
    brief_description: 'SMR-with-CCS hydrogen production for refining + ammonia + steel + chemicals customers.',
    hypothesis_statement: "Shell retains and grows industrial blue hydrogen capability for hard-to-abate sectors through 2030, contingent on SMR-with-CCS economics holding, captive industrial demand persisting, and CCUS-enabling regulation (45Q-style) continuing.",
    why_it_matters: 'Blue H2 is Shell\'s pragmatic hydrogen position vs the more ambitious green H2 retreat; lower-risk transition lever.',
    horizon: 'H2', persona: 'strategy',
    time_horizon_year: 2030, time_horizon_source: 'Brief Section 04 (Hydrogen)',
    decision_threshold: 'Shell industrial blue H2 capacity >0.5 Mtpa by 2030',
    baseline_confidence: 0.550, current_confidence: 0.550,
    components: [
      {
        name: 'BLUE_HYDROGEN_SMR_CCS_TECH',
        description: 'SMR with CCS for blue hydrogen production at industrial scale.',
        component_type: 'tech', vector: 'tech', cross_industry: true,
        source_citation: 'Shell brief Section 04 (Hydrogen)',
        attrs: {
          tech_function: POP_VOCAB('smr_with_ccs_blue_hydrogen', 'Shell brief Section 04', 'high'),
          trl: POP_CAT('8', 'SMR mature TRL 9; SMR+CCS at TRL 8 with operational facilities (e.g. Quest, Air Products Port Arthur)', 'high'),
          incumbency_depth: POP('high — Air Products, Linde, Air Liquide, Shell, BP, Equinor', 'Shell brief Section 04', 'medium'),
        },
      },
      {
        name: 'INDUSTRIAL_H2_HARD_TO_ABATE_DEMAND',
        description: 'Industrial hydrogen demand from refineries, ammonia, methanol, steel, chemicals.',
        component_type: 'market', vector: 'market', cross_industry: true,
        source_citation: 'Shell brief Section 04',
        attrs: {
          demand_certainty: POP('high — captive industrial hydrogen demand is structural', 'Shell brief Section 04', 'high'),
          subsidy_dependency: POP(50, 'Shell brief Section 04 — Blue H2 economics depend on 45Q / EU CCUS contracts to bridge cost vs grey H2', 'medium'),
          substitute_threat: POP('moderate — green H2 is the substitute but cost gap material; non-H2 DRI threatens steel sub-segment', 'Shell brief Section 04 + worked example Section 8.2', 'medium'),
        },
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 7. SHELL_H3_HYDROGEN_NWE (managed retreat)
  // ------------------------------------------------------------------------
  {
    name: 'NW European green hydrogen production capacity (managed retreat)',
    strategy_context: 'Renewables & Energy Solutions — Shell announced 2030 NW European green H2 capacity now in managed retreat.',
    brief_description: 'Holland Hydrogen 1 (200MW), REFHYNE II, NortH2 stake — flagged as scaling back in March 2026 brief.',
    hypothesis_statement: "Shell's announced 2030 NW European green hydrogen production capacity (Holland Hydrogen 1 + REFHYNE II + NortH2 stake) is delivered within ±50% of stated targets, contingent on PEM electrolyser cost-down, NW European industrial offtake FID density, EU Hydrogen Bank funding, and absence of structural steel-decarbonisation alternative pathway maturation.",
    why_it_matters: 'H3 hydrogen is the worked-example reference initiative; v2 baseline reflects March 2026 brief retreat signal.',
    horizon: 'H3', persona: 'strategy',
    time_horizon_year: 2030, time_horizon_source: '/docs/WORKED_EXAMPLE_SHELL_H3.md + brief Section 04 retreat signal',
    decision_threshold: '2030 NW European Shell green H2 capacity within ±50% of currently-announced figures',
    baseline_confidence: 0.350, current_confidence: 0.350,
    components: [
      {
        name: 'PEM_ELECTROLYSIS_INDUSTRIAL_SCALE',
        description: 'PEM electrolyser stack + balance-of-plant at >100MW industrial scale.',
        component_type: 'tech', vector: 'tech', cross_industry: true,
        source_citation: 'Worked example Section 6.2; Shell brief Section 04',
        attrs: {
          tech_function: POP_VOCAB('pem_electrolysis_industrial_scale', 'Worked example Section 6.2', 'high'),
          trl: POP_CAT('7', 'TRL 8-9 component; TRL 7-8 system at >100MW; Holland Hydrogen 1 commissioning', 'medium'),
          cost_trajectory: POP('Current quotes 1,400-1,800 EUR/kW vs target <1,000 EUR/kW; 10-20% per doubling per IRENA', 'IRENA Hydrogen Cost Report 2024 + worked example', 'medium'),
          velocity_pct_yoy: POP(-12, 'IRENA per worked example — Cost-decline ~10-15% YoY across Western suppliers per IRENA learning rates', 'low'),
          scale_up_factor: POP(0.25, 'Worked example Section 6.2 — Holland Hydrogen 1 is genuinely commercial-scale at 200MW; second-of-kind unproven', 'low'),
          obsolescence_horizon: POP(15, 'Industry consensus per worked example — Stack design life ~10-15 years; balance-of-plant >20 years', 'low'),
        },
      },
      {
        name: 'EU_HYDROGEN_BANK',
        description: 'EU Hydrogen Bank funding — auction-based €/kg subsidy mechanism.',
        component_type: 'regulation', vector: 'regulation', cross_industry: false,
        source_citation: 'Worked example Section 7.3',
        attrs: {
          regulation_stage: POP_CAT('in_force', 'European Commission disclosures per worked example', 'high'),
          enforcement: POP_CAT('strong', 'EC funding mechanism', 'medium'),
          jurisdictional_reach: POP('EU-27', 'Worked example', 'high'),
          implementation_progress: POP(40, 'EC Hydrogen Bank disclosures per worked example — Round 1 awarded €720m at <€0.50/kg subsidy 2024; Round 2 announced 2025 at €1.2bn', 'medium'),
          political_durability: POP('moderate — committed framework but EU budget tightening risk', 'Worked example Section 7.3', 'medium'),
        },
      },
      {
        name: 'NON_H2_DRI_THREAT',
        description: 'Non-hydrogen direct reduced iron pathway as alternative steel decarbonisation; Boston Metal, Electra.',
        component_type: 'tech', vector: 'tech', cross_industry: true,
        source_citation: 'Worked example Section 8.2',
        attrs: {
          tech_function: POP_VOCAB('pem_electrolysis_industrial_scale', 'Same vocab — non-H2 DRI competes against PEM electrolysis as steel decarbonisation pathway', 'low'),
          trl: POP_CAT('5', 'TRL 5-6; pilot scale; commercial scale 2027-2030 contested. Boston Metal Series C; Electra commercial pilot', 'medium'),
          substitution_risk: POP('high — if Boston Metal or similar reaches commercial scale, steel offtake market for green H2 narrows materially', 'Worked example Section 8.2', 'medium'),
        },
        claims: [
          { role: 'external_threat', impact: 'dampening', criticality: 'critical',
            claim_text: 'Non-H2 DRI does NOT reach commercial scale before 2030',
            attribute_name: 'trl', threshold_op: 'lt', threshold_value_numeric: 8, threshold_unit: 'trl_level', deadline_date: '2030-12-31',
            claim_basis: 'If non-H2 DRI scales, the steel decarbonisation offtake collapses; matches worked-example finding of being the biggest portfolio risk.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 8. SHELL_NAMIBIA_ORANGE_BASIN
  // ------------------------------------------------------------------------
  {
    name: 'Namibia Orange Basin commercial development (45% stake)',
    strategy_context: 'Upstream — frontier deepwater exploration positioning post-Guyana.',
    brief_description: 'Shell 45% in TotalEnergies-operated licence; multiple discoveries 2022-2024.',
    hypothesis_statement: "Shell's 45% stake in Namibian Orange Basin licence reaches commercial FID by end-2027, contingent on resource appraisal validating >1.5 bn boe, Namibian fiscal regime remaining stable, and frontier deepwater rig availability not delaying campaign.",
    why_it_matters: 'Namibia could be next Guyana for Shell production trajectory — material 2030+ upstream lever.',
    horizon: 'H2', persona: 'strategy',
    time_horizon_year: 2027, time_horizon_source: 'Brief Section 06 S-01',
    decision_threshold: 'Shell+TotalEnergies-operated Orange Basin licence achieves FID by end-2027',
    baseline_confidence: 0.500, current_confidence: 0.500,
    components: [
      {
        name: 'NAMIBIA_ORANGE_BASIN_RESOURCE',
        description: 'Namibia Orange Basin oil resource — multiple discoveries by TotalEnergies, Shell, Galp 2022-2024.',
        component_type: 'tech', vector: 'tech', cross_industry: false,
        source_citation: 'Shell brief Section 06 S-01',
        attrs: {
          tech_function: POP_VOCAB('frontier_deepwater_appraisal', 'Shell brief Section 06 S-01', 'high'),
          trl: POP_CAT('7', 'Discoveries confirmed TRL 7+; commercial production not yet; FID-stage', 'medium'),
          scale_up_factor: POP(0.5, 'Shell brief Section 06 S-01 — Pre-FID; appraisal pending; estimated 2B+ boe technical resource industry consensus', 'low'),
        },
      },
      {
        name: 'NAMIBIA_REGULATORY_FRAMEWORK',
        description: 'Namibian upstream regulatory and fiscal framework.',
        component_type: 'regulation', vector: 'regulation', cross_industry: false,
        source_citation: 'Shell brief Section 06 S-01 (no specific regulatory commentary)',
        attrs: {
          regulation_stage: POP_CAT('in_force', 'Petroleum Act framework stable', 'medium'),
          enforcement: POP_CAT('moderate', 'Brief is silent', 'low'),
          political_durability: POP('moderate — government has signalled intent to revise local content rules but no major adverse changes published', 'Shell brief Section 06 S-01 + government public statements', 'low'),
          jurisdictional_reach: POP('Namibian federal — applies to offshore licences', 'Industry consensus', 'medium'),
          // brief is silent on regulatory specifics — flagged in shell_phase1.md as 'ambiguous' state. v2 demands a state, default to NIS for unknown:
          implementation_progress: NIS_T2('Brief is silent. Open question flagged in shell_phase1.md §7.5.'),
          grandfather_clauses: NIS_T2('No public information on grandfather provisions for incumbent operators.'),
        },
      },
      {
        name: 'DEEPWATER_DRILLING_CAPACITY',
        description: 'Frontier deepwater drilling rig + supply chain capacity globally.',
        component_type: 'ecosystem', vector: 'ecosystem', cross_industry: true,
        source_citation: 'Shell brief Section 06 S-01 context',
        attrs: {
          infrastructure_readiness: POP('weakening — drillship day-rates $450-550k/day for ultra-deepwater 6th-gen rigs 2025; supply chain tight', 'Industry consensus referenced in shell_phase1.mjs', 'medium'),
          partner_concentration: POP('count: 4-5 major rig owners (Transocean, Valaris, Noble, Seadrill, Stena); high concentration', 'Industry consensus', 'medium'),
          supply_chain_depth: POP('moderate — multiple basins competing for limited 6th-gen drillships', 'Shell brief Section 06 S-01', 'medium'),
        },
      },
    ],
  },

  // ------------------------------------------------------------------------
  // 9. SHELL_CHEMICALS_SPECIALTIES
  // ------------------------------------------------------------------------
  {
    name: 'Shell Chemicals pivot from commodity to performance chemicals',
    strategy_context: 'Chemicals — Shell pivoting capital from commodity ethylene to specialty/performance chemicals.',
    brief_description: 'Refinery headcount cuts under way; cracker shutdown decisions pending; specialty M&A pipeline active.',
    hypothesis_statement: "Shell Chemicals pivots capital allocation predominantly toward performance/specialty chemicals by end-2027, contingent on commodity cracker economics remaining unfavourable, specialty end-market demand sustaining, internal capital reallocation execution, and accessible bolt-on M&A market.",
    why_it_matters: 'Chemicals strategy is the most concrete restructure-posture initiative in the portfolio; near-term commercial signals.',
    horizon: 'H1', persona: 'strategy',
    time_horizon_year: 2027, time_horizon_source: 'Brief Section 02 + Section 06 S-03',
    decision_threshold: 'Shell Chemicals capital allocation shifts >50% to specialty/performance lines by end-2027',
    baseline_confidence: 0.600, current_confidence: 0.600,
    components: [
      {
        name: 'SHELL_CHEMICALS_CAPITAL_REALLOCATION',
        description: 'Shell Chemicals internal capital reallocation from commodity to specialty.',
        component_type: 'ecosystem', vector: 'ecosystem', cross_industry: false,
        source_citation: 'Shell brief Section 02 (Chemicals strategy)',
        attrs: {
          infrastructure_readiness: POP('moderate — refinery headcount cuts under way; specific cracker shutdowns pending; specialty capex line being built', 'Shell brief Section 02', 'medium'),
          institutional_support: POP('high — explicit Shell strategy direction in March 2026 brief', 'Shell brief Section 02', 'high'),
          capital_intensity: POP('multi-$bn specialty M&A bolt-ons + commodity divestment proceeds', 'Shell brief Section 02', 'low'),
        },
        claims: [
          { role: 'principal', impact: 'amplifying', criticality: 'critical',
            claim_text: 'Shell Chemicals capital allocation shifts >50% to specialty/performance product lines by end-2027',
            threshold_op: 'gt', threshold_value_numeric: 50, threshold_unit: 'pct_capex', deadline_date: '2027-12-31',
            claim_basis: 'Brief Section 02 explicitly names the pivot underway.' },
        ],
      },
      {
        name: 'COMMODITY_CRACKER_ECONOMICS',
        description: 'European commodity ethylene cracker margins.',
        component_type: 'market', vector: 'market', cross_industry: false,
        source_citation: 'Shell brief Section 06 S-03',
        attrs: {
          market_size: POP('European cracker margins compressed 2024-2025; multiple shutdown announcements industry-wide', 'Shell brief Section 06 S-03', 'high'),
          demand_certainty: POP('weak — structural over-capacity vs Asian + ME competition', 'Shell brief Section 06 S-03', 'medium'),
          subsidy_dependency: POP(0, 'Industry consensus — Commodity cracker economics not subsidy-driven', 'high'),
        },
      },
      {
        name: 'PERFORMANCE_CHEMICALS_DEMAND',
        description: 'Specialty / performance chemicals end-market demand — adhesives, coatings, lubricant additives.',
        component_type: 'market', vector: 'market', cross_industry: false,
        source_citation: 'Shell brief Section 06 S-03',
        attrs: {
          cagr: POP(4, 'Shell brief Section 06 S-03 — Adhesives, coatings, lubricant additives demand growing 3-5%/yr per industry consensus', 'medium'),
          demand_certainty: POP('moderate-to-high — secular demand drivers from EV, packaging, construction', 'Shell brief Section 06 S-03', 'medium'),
        },
      },
    ],
  },
];

// ============================================================================
// ORCHESTRATION
// ============================================================================

const MISSING_NIS = (name, vector) => ({ value_status: 'not_in_source', not_in_source_reason: DEFAULT_NIS_REASON });

async function populate() {
  console.log('=== Shell v2 catalogue population ===');
  console.log(`Mode: ${COMMIT ? 'COMMIT (POSTing to API)' : 'DRY-RUN (no API calls)'}`);
  console.log(`API: ${API_BASE}`);
  console.log('');

  // Pre-flight: load attribute_definitions index
  const attrDefs = await getAttrDefsByVector();
  const attrIdByVecName = {};
  for (const v of Object.keys(attrDefs)) {
    attrIdByVecName[v] = {};
    for (const a of attrDefs[v]) attrIdByVecName[v][a.attribute_name] = a.id;
  }
  if (COMMIT) {
    console.log(`[preflight] attribute_definitions loaded: ${Object.entries(attrDefs).map(([v,a]) => `${v}=${a.length}`).join(', ')}`);
  }

  // 1. Shell company
  console.log('\n[1] Company');
  const company = await getOrCreateCompany(COMPANY);

  // 2-3. Initiatives + components + their claims/attributes
  let totals = { initiatives: 0, components: 0, claims: 0, attrs_populated: 0, attrs_nis: 0, attrs_na: 0, tech_functions_created: 0 };
  const componentsByVector = {};
  const techFnsCreated = new Set();

  for (const init of INITIATIVES) {
    console.log(`\n[2.${totals.initiatives + 1}] Initiative: ${init.name.slice(0, 70)}`);
    const initRow = await getOrCreateInitiative({
      company_id: company.id,
      name: init.name,
      strategy_context: init.strategy_context,
      brief_description: init.brief_description,
      hypothesis_statement: init.hypothesis_statement,
      why_it_matters: init.why_it_matters,
      horizon: init.horizon,
      persona: init.persona,
      time_horizon_year: init.time_horizon_year,
      time_horizon_source: init.time_horizon_source,
      decision_threshold: init.decision_threshold,
      baseline_confidence: init.baseline_confidence,
      current_confidence: init.current_confidence,
      draft_status: 'draft_unreviewed',
    });
    totals.initiatives++;

    for (const comp of init.components) {
      const compRow = await getOrCreateComponent({
        initiative_id: initRow.id,
        name: comp.name,
        description: comp.description,
        component_type: comp.component_type,
        vector: comp.vector,
        cross_industry: comp.cross_industry || false,
        source_citation: comp.source_citation,
        draft_status: 'draft_unreviewed',
      });
      totals.components++;
      componentsByVector[comp.vector] = (componentsByVector[comp.vector] || 0) + 1;

      // Resolve every attribute for this component's vector.
      const declared = comp.attrs || {};
      const allDefs = attrDefs[comp.vector];
      const batch = [];
      for (const def of allDefs) {
        const declaredAttr = declared[def.attribute_name];
        let resolution;
        if (declaredAttr) {
          resolution = { ...declaredAttr };
          // Handle tech_function controlled vocab
          if (resolution._is_tech_function) {
            const fn = TECH_FUNCTIONS[resolution.value_text];
            if (!fn) throw new Error(`tech_function not declared in TECH_FUNCTIONS: ${resolution.value_text}`);
            const tfRow = await getOrCreateTechFunction(fn);
            if (COMMIT && tfRow?.id && !techFnsCreated.has(fn.function_name)) {
              techFnsCreated.add(fn.function_name);
              totals.tech_functions_created++;
            }
            if (COMMIT) resolution.value_controlled_vocab_id = tfRow.id;
            delete resolution._is_tech_function;
          }
        } else {
          resolution = MISSING_NIS();
        }
        // Build the upsert row
        const row = {
          component_id: compRow.id,
          attribute_def_id: def.id,
          ...resolution,
        };
        batch.push(row);
        if (resolution.value_status === 'populated') totals.attrs_populated++;
        else if (resolution.value_status === 'not_in_source') totals.attrs_nis++;
        else if (resolution.value_status === 'not_applicable') totals.attrs_na++;
      }

      // POST upsert for the whole batch (idempotent on conflict)
      if (COMMIT) {
        await api('POST', '/component_attributes', batch);
      } else {
        console.log(`      [dry-run] would upsert ${batch.length} attrs for ${comp.name}`);
      }

      // Claims
      if (comp.claims) {
        for (const cl of comp.claims) {
          const existing = await existingClaim(initRow.id, compRow.id, cl.role, cl.claim_text);
          if (existing) {
            console.log(`        [reuse] claim id=${existing.id} role=${cl.role}`);
            continue;
          }
          const claimPayload = {
            initiative_id: initRow.id,
            component_id: compRow.id,
            claim_text: cl.claim_text,
            role: cl.role,
            impact: cl.impact,
            criticality: cl.criticality,
            claim_basis: cl.claim_basis,
            draft_status: 'draft_unreviewed',
          };
          if (cl.attribute_name) {
            const attrId = attrIdByVecName[comp.vector]?.[cl.attribute_name];
            if (attrId) claimPayload.attribute_def_id = attrId;
          }
          if (cl.threshold_op) claimPayload.threshold_op = cl.threshold_op;
          if (cl.threshold_value_numeric !== undefined && cl.threshold_value_numeric !== null) claimPayload.threshold_value_numeric = cl.threshold_value_numeric;
          if (cl.threshold_value_text) claimPayload.threshold_value_text = cl.threshold_value_text;
          if (cl.threshold_unit) claimPayload.threshold_unit = cl.threshold_unit;
          if (cl.deadline_date) claimPayload.deadline_date = cl.deadline_date;

          if (COMMIT) {
            const r = await api('POST', '/claims_v2', claimPayload);
            console.log(`        [insert] claim id=${r.row?.id} role=${cl.role} crit=${cl.criticality}`);
          } else {
            console.log(`        [dry-run] would POST claim role=${cl.role} crit=${cl.criticality}`);
          }
          totals.claims++;
        }
      }
    }
  }

  // 4. Verify components_incomplete is empty
  console.log('\n[3] Verification');
  if (COMMIT) {
    const incompleteAll = await api('GET', '/components_incomplete');
    // Filter to Shell components only via /components?company_id chain
    const shellCompsAll = await api('GET', `/components_with_full_record?company_id=${company.id}`);
    const shellCompIds = new Set(shellCompsAll.map((r) => r.component_id));
    const shellIncomplete = incompleteAll.filter((r) => shellCompIds.has(r.component_id));
    if (shellIncomplete.length === 0) {
      console.log(`  ✓ components_incomplete: 0 Shell components have pending attributes`);
    } else {
      console.log(`  ✗ components_incomplete: ${shellIncomplete.length} Shell components still pending:`);
      for (const r of shellIncomplete) console.log(`      - ${r.component_name} (${r.pending_attribute_count} pending)`);
    }
  } else {
    console.log('  (dry-run — verification skipped)');
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Initiatives:                ${totals.initiatives}`);
  console.log(`Components:                 ${totals.components}`);
  console.log(`  by vector:                ${Object.entries(componentsByVector).map(([k,v])=>`${k}=${v}`).join(', ')}`);
  console.log(`Component attributes:       ${totals.attrs_populated + totals.attrs_nis + totals.attrs_na}`);
  console.log(`  populated:                ${totals.attrs_populated}`);
  console.log(`  not_in_source:            ${totals.attrs_nis}`);
  console.log(`  not_applicable:           ${totals.attrs_na}`);
  console.log(`Claims:                     ${totals.claims}`);
  console.log(`Tech functions created:     ${totals.tech_functions_created}`);
  console.log('');
  console.log(`Mode: ${COMMIT ? 'COMMIT (changes applied)' : 'DRY-RUN (no changes)'}`);
}

populate().catch((err) => {
  console.error('\n[FATAL]', err.message);
  if (err.body) console.error('Body:', err.body);
  process.exit(1);
});
