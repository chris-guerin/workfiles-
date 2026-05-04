// db/_phase4_seed_synthetic.mjs — seeds 6 synthetic mini_signals_v3 rows
// with content that intentionally matches Shell catalogue components, so the
// Phase 5 matching pipeline has rich test data.
//
// Tagged with extraction_model='_phase4_seed' so they can be cleaned up
// after the Phase 5 end-to-end test if needed.
//
// Run:
//   node db/_phase4_seed_synthetic.mjs --commit

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
    const eq = t.indexOf('='); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '..', '.claude', 'settings.local.json'));  // not env style; manual below

async function getApiKey() {
  if (process.env.API_KEY) return process.env.API_KEY;
  const p = join(__dirname, '..', '.claude', 'settings.local.json');
  if (existsSync(p)) {
    const txt = await readFile(p, 'utf8');
    const m = txt.match(/Bearer\s+([a-f0-9]{64})/);
    if (m) return m[1];
  }
  return null;
}

const COMMIT = process.argv.includes('--commit');
const API_KEY = await getApiKey();
const API_BASE = 'https://signal-engine-api-production-0cf1.up.railway.app';

if (COMMIT && !API_KEY) { console.error('No API key'); process.exit(1); }

// Synthetic signals designed to exercise direct_name + attribute_reference + tech_function matching
const NOW_ISO = new Date().toISOString();
const TODAY = NOW_ISO.slice(0, 10);

const SYNTHETIC = [
  {
    signal_text: 'EU Hydrogen Bank announces Round 3 auction results: €1.5bn awarded at average €0.42/kg subsidy, ten projects across Germany, Netherlands, Spain. Subsidy floor down 16% versus Round 2.',
    signal_type: 'regulatory_change',
    extracted_entities: ['EU Hydrogen Bank', 'NortH2', 'NW European green hydrogen production capacity (managed retreat)'],
    extracted_attribute_types: ['regulation_stage', 'implementation_progress', 'subsidy_dependency'],
    extracted_values: {
      regulation_stage: { value_text: 'in_force', context: 'Round 3 awarded', direction: 'stable' },
      implementation_progress: { value_numeric: 60, value_unit: 'pct', context: 'three rounds awarded', direction: 'rising' },
      subsidy_dependency: { value_numeric: 0.42, value_unit: 'EUR_per_kg', context: 'auction strike price', direction: 'falling' },
    },
    extracted_geographic_scope: ['EU', 'DE', 'NL', 'ES'],
    extracted_temporal_scope_start: TODAY, extracted_temporal_scope_end: null,
    confidence: 0.9,
  },
  {
    signal_text: 'PEM electrolyser stack capex hits €920/kW at 100MW scale per ITM Power Q1 2026 disclosure — first sub-€1,000/kW deployment in Europe.',
    signal_type: 'data_release',
    extracted_entities: ['PEM_ELECTROLYSIS_INDUSTRIAL_SCALE', 'pem_electrolysis_industrial_scale', 'ITM Power'],
    extracted_attribute_types: ['capex_intensity', 'scale_up_factor', 'cost_trajectory'],
    extracted_values: {
      capex_intensity: { value_numeric: 920, value_unit: 'EUR_per_kW', context: '100MW scale', direction: 'falling' },
      scale_up_factor: { value_numeric: 0.5, value_unit: 'multiplier', context: '100MW vs 200MW commercial target', direction: 'rising' },
    },
    extracted_geographic_scope: ['EU', 'GB'],
    extracted_temporal_scope_start: TODAY,
    confidence: 0.85,
  },
  {
    signal_text: 'Boston Metal raises Series D for first commercial-scale MOE green steel facility, $300m round, FID expected end-2027 with first molten oxide steel by 2029.',
    signal_type: 'commitment',
    extracted_entities: ['Boston Metal', 'NON_H2_DRI_THREAT'],
    extracted_attribute_types: ['ttm_months', 'scale_up_factor', 'substitution_risk'],
    extracted_values: {
      ttm_months: { value_numeric: 36, value_unit: 'months', context: 'FID 2027 + first steel 2029', direction: 'falling' },
      scale_up_factor: { value_numeric: 0.3, value_unit: 'multiplier', context: 'commercial pilot vs full-scale', direction: 'rising' },
    },
    extracted_geographic_scope: ['US'],
    extracted_temporal_scope_start: '2027-12-31', extracted_temporal_scope_end: '2029-12-31',
    confidence: 0.9,
  },
  {
    signal_text: 'US Treasury issues final 45Q guidance preserving $85/t industrial credit despite political pressure for repeal; multi-year administrative durability confirmed for projects FID-stage by end-2027.',
    signal_type: 'regulatory_change',
    extracted_entities: ['US 45Q', 'US_45Q_TAX_CREDIT'],
    extracted_attribute_types: ['regulation_stage', 'enforcement', 'political_durability', 'sunset_risk'],
    extracted_values: {
      regulation_stage: { value_text: 'in_force', context: 'final guidance', direction: 'stable' },
      political_durability: { value_text: 'strengthening — final guidance neutralises near-term repeal scenarios', direction: 'rising' },
      sunset_risk: { value_text: 'reduced — guidance covers FID through 2027', direction: 'falling' },
    },
    extracted_geographic_scope: ['US'],
    extracted_temporal_scope_start: TODAY, extracted_temporal_scope_end: '2027-12-31',
    confidence: 0.92,
  },
  {
    signal_text: 'TTF gas spot trades at $11.40/MMBtu mid-week, holding above $10 floor for fourth consecutive week as European storage builds ahead of winter — supports 2026-2027 LNG netback economics.',
    signal_type: 'data_release',
    extracted_entities: ['GAS_PRICE_FLOOR_TTF', 'European TTF', 'GLOBAL_LNG_DEMAND_TRAJECTORY'],
    extracted_attribute_types: ['market_size', 'demand_certainty'],
    extracted_values: {
      market_size: { value_numeric: 11.40, value_unit: 'USD_per_MMBtu', context: 'TTF spot mid-week', direction: 'stable' },
    },
    extracted_geographic_scope: ['EU'],
    extracted_temporal_scope_start: TODAY,
    confidence: 0.88,
  },
  {
    signal_text: 'Shell Q1 2026: Northern Lights phase 2 FID announced, 5 Mtpa CO2 capacity with binding service agreements with three industrial customers; brings cumulative North Sea CCUS to 8 Mtpa operational by 2028.',
    signal_type: 'announcement',
    extracted_entities: ['Shell', 'Northern Lights', 'NORTH_SEA_CO2_STORAGE_CAPACITY', 'Industrial CCUS services leadership (Quest + Northern Lights)'],
    extracted_attribute_types: ['infrastructure_readiness', 'capital_intensity', 'demand_certainty'],
    extracted_values: {
      infrastructure_readiness: { value_text: 'Northern Lights phase 2 FID + 8 Mtpa cumulative by 2028', direction: 'rising' },
      capital_intensity: { value_text: 'multi-€bn phase 2 commitment from Equinor + Shell + Total', direction: 'rising' },
    },
    extracted_geographic_scope: ['NO', 'EU'],
    extracted_temporal_scope_start: TODAY, extracted_temporal_scope_end: '2028-12-31',
    confidence: 0.95,
  },
];

console.log(`Seeding ${SYNTHETIC.length} synthetic mini_signals_v3 rows`);

let posted = 0, failed = 0;
for (const s of SYNTHETIC) {
  const body = {
    ...s,
    extracted_at: NOW_ISO,
    extraction_confidence: s.confidence,
    extraction_model: '_phase4_seed',
    pub_date: TODAY,
  };
  if (!COMMIT) {
    console.log(`  [dry-run] would POST: ${s.signal_text.slice(0, 80)}`);
    continue;
  }
  try {
    const r = await fetch(`${API_BASE}/mini_signals_v3`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      failed++;
      console.log(`  POST failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    } else {
      posted++;
      const j = await r.json();
      console.log(`  posted id=${j.row?.id}: ${s.signal_text.slice(0, 80)}`);
    }
  } catch (e) {
    failed++;
    console.log(`  POST error: ${e.message.slice(0, 200)}`);
  }
}

console.log(`\nposted=${posted}, failed=${failed}`);
