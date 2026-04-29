#!/usr/bin/env node
// 002_hypothesis_unified_v5_load.js
//
// Merge migration combining 25 March CSV (decision-layer-only cols) + 28 April
// Apps Script doGet (bucket-layer + shared cols) into the unified v5 target table.
//
// ROLLBACK by default. Requires both --commit and --confirm-yes to persist.
//
// Usage:
//   node 002_hypothesis_unified_v5_load.js                       # dry-run
//   node 002_hypothesis_unified_v5_load.js --commit --confirm-yes
//
// Env (from /db/.env then /n8n/.env):
//   APPS_SCRIPT_URL — doGet endpoint for the live register
//   DATABASE_URL    — Postgres connection string (Railway public URL for local runs)
//   CSV_PATH        — defaults to C:/Users/Admin/Downloads/FutureBridge_Hypothesis_Repository_v4_FINAL.csv
//
// Behaviour:
//   1. Load CSV (49 cols, 118 rows expected). Load Apps Script doGet (45 cols, 118 rows expected).
//   2. Validate row counts and hyp_id intersection (both = 118 expected per pre-flight 29 April 08:40 BST).
//   3. Merge each row per /db/schema/v5_design.md Section 2: live wins for shared cols; CSV
//      contributes the 25 decision-layer-only cols; renames applied; 6 NEW v5 cols populated
//      with sensible defaults.
//   4. BEGIN. Upsert all 76 cols × 118 rows by hyp_id. Verify count. Surface R15 violations
//      and last_updated parse-fail count from the live transaction.
//   5. ROLLBACK by default. COMMIT only on --commit --confirm-yes.
//
// R14 honoured: target schema is hypothesis_register_v5.sql exactly.
// R22 honoured: no n8n workflow changes; this script does not touch n8n.
// R25: if commit succeeds, ARCHITECTURE.md System State table needs an update (separate step).

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- env loader ----------
async function loadEnv(path) {
  if (!existsSync(path)) return;
  const raw = await readFile(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

await loadEnv(join(__dirname, '..', '.env'));
await loadEnv(join(__dirname, '..', '..', 'n8n', '.env'));

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL
  || 'https://script.google.com/macros/s/AKfycbxmpsUIgouSfPp38yVSC-y2aZ3utsOU3je3xGICc0fe6vKGaVinc7_sWVF88cbkgsSY-w/exec';
const DATABASE_URL = process.env.DATABASE_URL;
const CSV_PATH = process.env.CSV_PATH
  || 'C:/Users/Admin/Downloads/FutureBridge_Hypothesis_Repository_v4_FINAL.csv';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in db/.env. Get the value from the Railway Postgres service Connect panel.');
  process.exit(1);
}

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const CONFIRM = args.includes('--confirm-yes');
const WILL_COMMIT = COMMIT && CONFIRM;
if (COMMIT && !CONFIRM) {
  console.error('--commit was passed without --confirm-yes. Aborting for safety.');
  process.exit(1);
}

// ---------- minimal RFC 4180 CSV parser ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

// ---------- helpers ----------
const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v);
  if (s === '') return null;
  return s;
};
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

let lastUpdatedParseFails = 0;
function promoteLastUpdated(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    lastUpdatedParseFails++;
    return null;
  }
  return d.toISOString();
}

function deriveRegister(hypId) {
  if (hypId.startsWith('BET_C')) return 'PERSONAL';
  if (hypId.startsWith('BET_I')) return 'INDUSTRY';
  if (/^BET_(E|M|SC|X)/.test(hypId)) return 'SECTOR';
  return 'CLIENT_ACCOUNT';
}

// ---------- target column order (mirrors hypothesis_register_v5.sql) ----------
const COLUMNS = [
  // Section A — core identity
  'hyp_id', 'register', 'sector', 'system_layer', 'hypothesis_theme',
  'owner', 'status', 'phase', 'schema_version',
  'created_at', 'created_by', 'last_updated', 'last_updated_by',
  'resolved_outcome', 'resolved_date', 'notes',
  // Section B — decision layer
  'probability', 'confidence_score', 'urgency_score',
  'probability_last_changed', 'probability_last_changed_note',
  'current_step', 'total_steps', 'step_conditions',
  'window_status', 'window_closes_at', 'horizon_months',
  'decision_window_reason', 'decision_type', 'decision', 'decision_threshold',
  'decision_owner_role', 'decision_owner_function', 'decision_owner_name',
  'decision_if_true', 'decision_if_false',
  'risk_if_wrong', 'upside_if_right',
  'wntbt_next', 'target_accounts',
  'company_tags', 'topic_tags', 'initiative_tags', 'persona_tags',
  'routing_geography', 'industry_tags',
  // Section C — bucket layer
  'tech_critical_pathways', 'tech_bottlenecks', 'tech_credible_actors',
  'tech_trajectory_changers', 'tech_displacement_risks',
  'reg_load_bearing', 'reg_gaps_blockers', 'reg_decision_makers', 'reg_unlock_delay_kill',
  'cost_critical_conditions', 'cost_economic_gap', 'cost_who_commits', 'cost_deal_structure',
  'eco_missing_dependencies', 'eco_required_partnerships', 'eco_who_moves_first',
  'eco_derisking_commitment',
  'geo_leading', 'geo_excluded', 'geo_shift_matters',
  'trigger',
  'signal_types', 'signal_priority', 'signal_weighting_rule', 'last_signal_id',
  'falsifiers', 'primary_sources', 'shared_dependency', 'related_hyp_ids',
  'rate_limiting_bucket',
];
if (COLUMNS.length !== 76) throw new Error(`Column array length is ${COLUMNS.length}, expected 76`);

// ---------- merge per row ----------
// Live wins for shared cols. CSV contributes decision-layer-only cols.
function mergeRow(hypId, live, csv) {
  const L = live || {};
  const C = csv || {};
  // Normalise system_layer trailing-space variant
  const systemLayer = clean((L['system_layer '] ?? L['system_layer'] ?? C['system_layer'] ?? '').toString().trim());

  return {
    // Section A
    hyp_id: hypId,
    register: deriveRegister(hypId),
    sector: clean(L.sector ?? C.sector),
    system_layer: systemLayer,
    hypothesis_theme: clean(L.hypothesis_theme ?? C.hypothesis_theme ?? C.title),
    owner: clean(L.owner ?? C.owner),
    status: clean(C.status) ?? 'ACTIVE',
    phase: clean(L.phase) ?? 'DIVERGENT',
    schema_version: 'v5',
    created_at: new Date().toISOString(),
    created_by: 'migration_002',
    last_updated: promoteLastUpdated(L.last_updated) ?? promoteLastUpdated(C.last_updated),
    last_updated_by: null,
    resolved_outcome: clean(C.resolved_outcome),
    resolved_date: clean(C.resolved_date),
    notes: clean(L.notes ?? C.notes),

    // Section B
    probability: num(L.probability ?? C.probability),
    confidence_score: num(L.confidence_score ?? C.confidence_score),
    urgency_score: num(L.urgency_score ?? C.urgency_score),
    probability_last_changed: clean(C.probability_last_changed),
    probability_last_changed_note: clean(C.probability_last_changed_note),
    current_step: intOrNull(L.current_step ?? C.current_step),
    total_steps: intOrNull(C.total_steps),
    step_conditions: clean(L.step_conditions ?? C.step_conditions),
    window_status: clean(L.window_status ?? C.window),
    // window_closes_at: free-form text in both sources ("Q4 2026"); store as DATE only if parseable.
    window_closes_at: parseDateOrNull(L.window_date ?? C.window_closes),
    horizon_months: intOrNull(L.horizon_months ?? C.horizon_months),
    decision_window_reason: clean(C.decision_window_reason),
    decision_type: clean(C.decision_type),
    decision: clean(C.decision),
    decision_threshold: clean(C.decision_threshold),
    decision_owner_role: clean(C.decision_owner_role),
    decision_owner_function: clean(C.decision_owner_function),
    decision_owner_name: clean(C.decision_owner_name),
    decision_if_true: clean(L.if_true ?? C.decision_if_true),
    decision_if_false: clean(L.if_false ?? C.decision_if_false),
    risk_if_wrong: clean(C.risk_if_wrong),
    upside_if_right: clean(C.upside_if_right),
    wntbt_next: clean(C.wntbt_next),
    target_accounts: clean(C.target_accounts),
    company_tags: clean(L.companies ?? C.company_tags),
    topic_tags: clean(C.topic_tags),
    initiative_tags: clean(C.initiative_tags),
    persona_tags: clean(C.persona_tags),
    routing_geography: clean(C.geography_tags),
    industry_tags: clean(C.industry_tags),

    // Section C
    tech_critical_pathways: clean(L.tech_critical_pathways),
    tech_bottlenecks: clean(L.tech_bottlenecks),
    tech_credible_actors: clean(L.tech_credible_actors),
    tech_trajectory_changers: clean(L.tech_trajectory_changers),
    tech_displacement_risks: clean(L.tech_displacement_risks),
    reg_load_bearing: clean(L.reg_load_bearing),
    reg_gaps_blockers: clean(L.reg_gaps_blockers),
    reg_decision_makers: clean(L.reg_decision_makers),
    reg_unlock_delay_kill: clean(L.reg_unlock_delay_kill),
    cost_critical_conditions: clean(L.mkt_critical_conditions),
    cost_economic_gap: clean(L.mkt_economic_gap),
    cost_who_commits: clean(L.mkt_who_commits),
    cost_deal_structure: clean(L.mkt_deal_structure),
    eco_missing_dependencies: clean(L.eco_missing_dependencies),
    eco_required_partnerships: clean(L.eco_required_partnerships),
    eco_who_moves_first: clean(L.eco_who_moves_first),
    eco_derisking_commitment: clean(L.eco_derisking_commitment),
    geo_leading: clean(L.geo_leading),
    geo_excluded: clean(L.geo_excluded),
    geo_shift_matters: clean(L.geo_shift_matters),
    trigger: clean(L.trigger),
    signal_types: clean(L.signal_types ?? C.signal_types),
    signal_priority: clean(C.signal_priority),
    signal_weighting_rule: clean(C.signal_weighting_rule),
    last_signal_id: clean(C.last_signal_id),
    falsifiers: clean(L.falsifiers ?? C.falsifiers),
    primary_sources: clean(L.primary_sources ?? C.primary_sources_expected),
    shared_dependency: clean(C.shared_dependency),
    related_hyp_ids: clean(L.related_hyp_ids ?? C.related_hyp_ids),
    rate_limiting_bucket: clean(L.rate_limiting_bucket),
  };
}

let windowDateParseFails = 0;
function parseDateOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  // Skip obviously free-form values like "Q4 2026"
  if (/^Q[1-4]\s/i.test(s) || /^H[12]\s/i.test(s)) {
    windowDateParseFails++;
    return null;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    windowDateParseFails++;
    return null;
  }
  return d.toISOString().slice(0, 10); // DATE
}

// ---------- 1. Load sources ----------
console.log('=== Build E phase 2 — v5 unified merge migration ===\n');

console.log(`[csv]   reading ${CSV_PATH}`);
const csvText = await readFile(CSV_PATH, 'utf8');
const csvRows = parseCsv(csvText);
const csvHeader = csvRows[0];
const csvData = csvRows.slice(1).map((row) => {
  const obj = {};
  csvHeader.forEach((h, i) => { obj[h.trim()] = row[i] ?? ''; });
  return obj;
});
console.log(`[csv]   ${csvData.length} rows, ${csvHeader.length} cols`);

console.log(`[live]  GET ${APPS_SCRIPT_URL}`);
const liveRes = await fetch(APPS_SCRIPT_URL);
if (!liveRes.ok) {
  console.error(`Apps Script returned ${liveRes.status} ${liveRes.statusText}`);
  process.exit(1);
}
const livePayload = await liveRes.json();
const liveData = livePayload.hypotheses ?? livePayload.data ?? livePayload.rows ?? [];
const liveCols = new Set();
for (const r of liveData) for (const k of Object.keys(r)) liveCols.add(k);
console.log(`[live]  ${liveData.length} rows, ${liveCols.size} distinct cols`);

// ---------- 2. Validate ----------
const csvIds = new Set(csvData.map((r) => r.hyp_id));
const liveIds = new Set(liveData.map((r) => r.hyp_id));
const intersection = [...liveIds].filter((id) => csvIds.has(id));
const liveOnly = [...liveIds].filter((id) => !csvIds.has(id));
const csvOnly = [...csvIds].filter((id) => !liveIds.has(id));

console.log('');
console.log('=== Row-set check ===');
console.log(`  intersection: ${intersection.length}`);
console.log(`  live-only:    ${liveOnly.length}${liveOnly.length ? ' — ' + liveOnly.join(', ') : ''}`);
console.log(`  CSV-only:     ${csvOnly.length}${csvOnly.length ? ' — ' + csvOnly.join(', ') : ''}`);

const formatRe = /^[A-Z0-9_-]{3,32}$/;
const formatFails = [...csvIds, ...liveIds].filter((id) => !formatRe.test(id));
if (formatFails.length) {
  console.error(`hyp_id format CHECK fails: ${formatFails.join(', ')}`);
  process.exit(1);
}

// Build merge dictionary keyed by hyp_id (live-as-canonical superset; CSV-only IDs included too if any)
const allIds = new Set([...liveIds, ...csvIds]);
const liveBy = new Map(liveData.map((r) => [r.hyp_id, r]));
const csvBy = new Map(csvData.map((r) => [r.hyp_id, r]));
const merged = [...allIds].map((id) => mergeRow(id, liveBy.get(id), csvBy.get(id)));

// Register distribution
const regDist = {};
for (const r of merged) regDist[r.register] = (regDist[r.register] || 0) + 1;
console.log('');
console.log('=== Register distribution (derived from hyp_id prefix) ===');
for (const [k, v] of Object.entries(regDist)) console.log(`  ${k.padEnd(16)} ${v}`);

// ---------- 3. Connect, transaction, upsert ----------
let pg;
try {
  pg = await import('pg');
} catch {
  console.error("Missing dependency 'pg'. Run 'cd db && npm install pg' before executing this script.");
  process.exit(1);
}

const client = new pg.default.Client({ connectionString: DATABASE_URL });
await client.connect();
console.log('');
console.log('[pg]    connected');

let upserted = 0;

try {
  await client.query('BEGIN');
  console.log('[pg]    BEGIN');

  const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
  const insertCols = COLUMNS.map((c) => (c === 'trigger' ? '"trigger"' : c)).join(', ');
  const updateSet = COLUMNS
    .filter((c) => c !== 'hyp_id')
    .map((c) => (c === 'trigger' ? `"trigger" = EXCLUDED."trigger"` : `${c} = EXCLUDED.${c}`))
    .join(', ');
  const sql = `
    INSERT INTO hypothesis_register (${insertCols})
    VALUES (${placeholders})
    ON CONFLICT (hyp_id) DO UPDATE SET ${updateSet}
  `;

  for (const row of merged) {
    const values = COLUMNS.map((c) => row[c] === undefined ? null : row[c]);
    await client.query(sql, values);
    upserted++;
  }
  console.log(`[pg]    upserted ${upserted} rows`);

  // Verify count
  const { rows: countRows } = await client.query('SELECT count(*)::int AS n FROM hypothesis_register');
  const dbCount = countRows[0].n;
  console.log(`[pg]    post-insert row count: ${dbCount}`);
  if (dbCount < merged.length) {
    throw new Error(`Post-insert count ${dbCount} less than merged.length ${merged.length}`);
  }

  // R15 violations
  const { rows: r15 } = await client.query(`
    SELECT hyp_id,
           missing_falsifiable, missing_business_linked, missing_time_bound
    FROM hypothesis_register_r15_violations
    ORDER BY hyp_id
  `);
  console.log('');
  console.log('=== R15 four-tests violations ===');
  if (r15.length === 0) {
    console.log('  none — all 118 rows pass falsifiable, business_linked, time_bound');
  } else {
    console.log(`  ${r15.length} row(s) fail at least one test:`);
    for (const v of r15.slice(0, 30)) {
      const fails = [v.missing_falsifiable, v.missing_business_linked, v.missing_time_bound].filter(Boolean).join(', ');
      console.log(`    ${v.hyp_id.padEnd(16)} fails: ${fails}`);
    }
    if (r15.length > 30) console.log(`    ... ${r15.length - 30} more`);
  }

  console.log('');
  console.log('=== Parse fail counts ===');
  console.log(`  last_updated TIMESTAMPTZ promotion fails: ${lastUpdatedParseFails} (NULL stored)`);
  console.log(`  window_closes_at DATE parse fails:        ${windowDateParseFails} (NULL stored — values like "Q4 2026" expected)`);

  // Commit or rollback
  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('');
    console.log(`[pg]    COMMIT — ${upserted} rows persisted`);
  } else {
    await client.query('ROLLBACK');
    console.log('');
    console.log(`[pg]    ROLLBACK (dry-run; pass --commit --confirm-yes to persist)`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('');
  console.error(`[pg]    ROLLBACK due to error: ${err.message}`);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
  await client.end();
  process.exit(1);
}

await client.end();
console.log('');
console.log(`Done. Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN (rolled back)'}`);
