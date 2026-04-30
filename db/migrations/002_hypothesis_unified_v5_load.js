#!/usr/bin/env node
// 002_hypothesis_unified_v5_load.js
//
// LIVE-ONLY MIGRATION (Option A, 29 April 09:58 BST). Loads the 28 April Apps Script doGet
// payload into the v5 unified target. The 25 March CSV is NOT used: pre-flight showed it has
// systematic column-shift (49-col header vs 51–53 fields per row, plus [object Object] in
// numeric fields) that makes the 25 decision-layer-only cols unreliable. Those cols ship as
// NULL across 118 rows pending a clean CSV re-export in a future session.
//
// ROLLBACK by default. Requires both --commit and --confirm-yes to persist.
//
// Usage:
//   node 002_hypothesis_unified_v5_load.js                       # dry-run
//   node 002_hypothesis_unified_v5_load.js --commit --confirm-yes
//
// Env (from /db/.env then /n8n/.env):
//   APPS_SCRIPT_URL — doGet endpoint for the live register
//   DATABASE_URL    — Postgres connection string
//
// Behaviour:
//   1. Load Apps Script doGet (45 cols, 118 rows expected).
//   2. Validate row count and hyp_id format.
//   3. Merge each row: live cols + 6 NEW v5 cols populated with sensible defaults; 25 CSV-only cols → NULL.
//   4. BEGIN. Upsert all 76 cols × 118 rows by hyp_id. Verify count. Surface R15 violations.
//   5. ROLLBACK by default. COMMIT only on --commit --confirm-yes.
//
// R14 honoured: target schema is hypothesis_register_v5.sql exactly (with window_closes_at as TEXT).
// R22 honoured: no n8n workflow changes; this script does not touch n8n.

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

// CSV-only columns (the 25 cols only sourceable from the CSV; ship as NULL in live-only mode)
const CSV_ONLY_COLS = new Set([
  // Section A
  'resolved_outcome', 'resolved_date',
  // Section B
  'probability_last_changed', 'probability_last_changed_note',
  'total_steps',
  'decision_window_reason', 'decision_type', 'decision', 'decision_threshold',
  'decision_owner_role', 'decision_owner_function', 'decision_owner_name',
  'risk_if_wrong', 'upside_if_right', 'wntbt_next', 'target_accounts',
  'topic_tags', 'initiative_tags', 'persona_tags', 'routing_geography', 'industry_tags',
  // Section C
  'signal_priority', 'signal_weighting_rule', 'last_signal_id', 'shared_dependency',
]);
if (CSV_ONLY_COLS.size !== 25) throw new Error(`CSV-only set size ${CSV_ONLY_COLS.size}, expected 25`);

// ---------- merge per row (live-only mode) ----------
function mergeRow(live) {
  const L = live;
  const systemLayer = clean((L['system_layer '] ?? L['system_layer'] ?? '').toString().trim());
  const hypId = L.hyp_id;

  return {
    // Section A
    hyp_id: hypId,
    register: deriveRegister(hypId),
    sector: clean(L.sector),
    system_layer: systemLayer,
    hypothesis_theme: clean(L.hypothesis_theme),
    owner: clean(L.owner),
    status: 'ACTIVE',                // SQL default; CSV would have provided per-row but unused in Option A
    phase: clean(L.phase) ?? 'DIVERGENT',
    schema_version: 'v5',
    created_at: new Date().toISOString(),
    created_by: 'migration_002',
    last_updated: promoteLastUpdated(L.last_updated),
    last_updated_by: null,
    resolved_outcome: null,
    resolved_date: null,
    notes: clean(L.notes),

    // Section B (live cols + CSV-only as NULL)
    probability: num(L.probability),
    confidence_score: num(L.confidence_score),
    urgency_score: num(L.urgency_score),
    probability_last_changed: null,
    probability_last_changed_note: null,
    current_step: intOrNull(L.current_step),
    total_steps: null,
    step_conditions: clean(L.step_conditions),
    window_status: clean(L.window_status),
    window_closes_at: clean(L.window_date),    // TEXT in v5, store verbatim
    horizon_months: intOrNull(L.horizon_months),
    decision_window_reason: null,
    decision_type: null,
    decision: null,
    decision_threshold: null,
    decision_owner_role: null,
    decision_owner_function: null,
    decision_owner_name: null,
    decision_if_true: clean(L.if_true),
    decision_if_false: clean(L.if_false),
    risk_if_wrong: null,
    upside_if_right: null,
    wntbt_next: null,
    target_accounts: null,
    company_tags: clean(L.companies),
    topic_tags: null,
    initiative_tags: null,
    persona_tags: null,
    routing_geography: null,
    industry_tags: null,

    // Section C (all live)
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
    signal_types: clean(L.signal_types),
    signal_priority: null,
    signal_weighting_rule: null,
    last_signal_id: null,
    falsifiers: clean(L.falsifiers),
    primary_sources: clean(L.primary_sources),
    shared_dependency: null,
    related_hyp_ids: clean(L.related_hyp_ids),
    rate_limiting_bucket: clean(L.rate_limiting_bucket),
  };
}

// ---------- 1. Load source ----------
console.log('=== Build E phase 2 — v5 LIVE-ONLY load (Option A) ===\n');

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
const formatRe = /^[A-Z0-9_-]{3,32}$/;
const formatFails = liveData.map((r) => r.hyp_id).filter((id) => !formatRe.test(id));
if (formatFails.length) {
  console.error(`hyp_id format CHECK fails: ${formatFails.join(', ')}`);
  process.exit(1);
}
console.log(`[live]  hyp_id format CHECK: 0 fails`);

const merged = liveData.map(mergeRow);

// Register distribution
const regDist = {};
for (const r of merged) regDist[r.register] = (regDist[r.register] || 0) + 1;
console.log('');
console.log('=== Register distribution (derived from hyp_id prefix) ===');
const expected = { PERSONAL: 12, INDUSTRY: 14, SECTOR: 44, CLIENT_ACCOUNT: 48 };
for (const k of ['PERSONAL', 'INDUSTRY', 'SECTOR', 'CLIENT_ACCOUNT']) {
  const got = regDist[k] || 0;
  const exp = expected[k];
  const dev = exp ? Math.abs(got - exp) / exp : 0;
  const flag = dev > 0.30 ? ' ** >30% deviation, surface for review **' : '';
  console.log(`  ${k.padEnd(16)} ${String(got).padStart(3)}  (expected ~${exp}, deviation ${(dev * 100).toFixed(0)}%)${flag}`);
}

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
    SELECT hyp_id, missing_falsifiable, missing_business_linked, missing_time_bound
    FROM hypothesis_register_r15_violations
    ORDER BY hyp_id
  `);
  console.log('');
  console.log('=== R15 four-tests violations ===');
  if (r15.length === 0) {
    console.log('  none — all rows pass falsifiable, business_linked, time_bound');
  } else {
    console.log(`  ${r15.length} row(s) fail at least one test:`);
    for (const v of r15.slice(0, 30)) {
      const fails = [v.missing_falsifiable, v.missing_business_linked, v.missing_time_bound].filter(Boolean).join(', ');
      console.log(`    ${v.hyp_id.padEnd(16)} fails: ${fails}`);
    }
    if (r15.length > 30) console.log(`    ... ${r15.length - 30} more`);
  }

  console.log('');
  console.log('=== Notes ===');
  console.log(`  Mode: LIVE-ONLY (Option A). 25 CSV-only cols ship as NULL pending clean re-export.`);
  console.log(`  CSV-only cols (25): ${[...CSV_ONLY_COLS].join(', ')}`);
  console.log(`  last_updated TIMESTAMPTZ promotion fails: ${lastUpdatedParseFails} (NULL stored)`);
  console.log(`  window_closes_at type: TEXT (changed pre-deploy from DATE; quarter strings stored verbatim)`);

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
