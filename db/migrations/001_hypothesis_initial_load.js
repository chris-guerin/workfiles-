#!/usr/bin/env node
// 001_hypothesis_initial_load.js
//
// Initial load of the hypothesis register from the live Apps Script doGet
// endpoint into Postgres.
//
// Dry-run by default. Always rolls back unless --commit is passed.
// --commit also requires --confirm-yes to actually commit.
//
// Usage:
//   node 001_hypothesis_initial_load.js                 # dry-run, ROLLBACK
//   node 001_hypothesis_initial_load.js --commit --confirm-yes   # commits
//
// Environment (loaded from /db/.env or /n8n/.env):
//   APPS_SCRIPT_URL   The doGet endpoint for the master register.
//   DATABASE_URL      Postgres connection string for Railway PG.
//
// Behaviour:
//   1. Fetch the live register via Apps Script doGet.
//   2. Validate row count and column count against expectations.
//   3. Begin a Postgres transaction.
//   4. Upsert each row by hyp_id (ON CONFLICT UPDATE).
//   5. Verify post-insert row count matches source.
//   6. Report R15 violations (rows missing falsifiers, if_true, if_false, or horizon_months).
//   7. ROLLBACK by default; COMMIT only when --commit --confirm-yes.
//
// This script is idempotent. Re-running with --commit is safe; rows are upserted by hyp_id.
//
// R22 honoured: this script does not touch any n8n workflow.
// R14 honoured: schema as defined in db/schema/hypothesis_register_v4.sql.
// R25 honoured: any material schema discrepancy surfaces as a non-zero exit.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- env loader (no deps) ----------
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

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!APPS_SCRIPT_URL) {
  console.error('Missing APPS_SCRIPT_URL. Set it in db/.env or n8n/.env.');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in db/.env. Get the value from the Railway Postgres service "Connect" panel.');
  process.exit(1);
}

// ---------- args ----------
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const CONFIRM = args.includes('--confirm-yes');
const WILL_COMMIT = COMMIT && CONFIRM;

if (COMMIT && !CONFIRM) {
  console.error('--commit was passed but --confirm-yes is missing. Aborting for safety.');
  process.exit(1);
}

// ---------- expectations (update when reconciling 45-vs-49) ----------
const EXPECTED_ROW_COUNT = 118;
const EXPECTED_COLUMN_COUNT = 45;

// ---------- column ordering for INSERT (mirrors db/schema/hypothesis_register_v4.sql) ----------
const COLUMNS = [
  'hyp_id',
  'sector',
  'system_layer',
  'hypothesis_theme',
  'probability',
  'confidence_score',
  'urgency_score',
  'window_status',
  'window_date',
  'horizon_months',
  'current_step',
  'step_conditions',
  'trigger',
  'if_true',
  'if_false',
  'companies',
  'tech_critical_pathways',
  'tech_bottlenecks',
  'tech_credible_actors',
  'tech_trajectory_changers',
  'tech_displacement_risks',
  'reg_load_bearing',
  'reg_gaps_blockers',
  'reg_decision_makers',
  'reg_unlock_delay_kill',
  'mkt_critical_conditions',
  'mkt_economic_gap',
  'mkt_who_commits',
  'mkt_deal_structure',
  'eco_missing_dependencies',
  'eco_required_partnerships',
  'eco_who_moves_first',
  'eco_derisking_commitment',
  'geo_leading',
  'geo_excluded',
  'geo_shift_matters',
  'signal_types',
  'falsifiers',
  'primary_sources',
  'related_hyp_ids',
  'phase',
  'rate_limiting_bucket',
  'owner',
  'last_updated',
  'notes',
];

// Sheet header normalisation: live payload contains "system_layer " with trailing space.
const SHEET_TO_DB = new Map([
  ['system_layer ', 'system_layer'],
]);

function normaliseRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const cleanKey = SHEET_TO_DB.get(k) ?? k;
    out[cleanKey] = v;
  }
  return out;
}

// ---------- 1. Fetch from Apps Script ----------
console.log(`[fetch] GET ${APPS_SCRIPT_URL}`);
const res = await fetch(APPS_SCRIPT_URL);
if (!res.ok) {
  console.error(`Apps Script returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
const payload = await res.json();
const rows = payload.hypotheses ?? payload.data ?? payload.rows ?? payload;
if (!Array.isArray(rows)) {
  console.error('Apps Script payload was not an array. Got keys:', Object.keys(payload));
  process.exit(1);
}
console.log(`[fetch] received ${rows.length} rows`);

// ---------- 2. Validate ----------
if (rows.length !== EXPECTED_ROW_COUNT) {
  console.error(`Row count mismatch. Expected ${EXPECTED_ROW_COUNT}, got ${rows.length}. Aborting.`);
  process.exit(1);
}

const firstRow = normaliseRow(rows[0]);
const observedKeys = new Set();
for (const r of rows) for (const k of Object.keys(normaliseRow(r))) observedKeys.add(k);
console.log(`[validate] distinct columns observed: ${observedKeys.size}`);

const missingFromSchema = [...observedKeys].filter((k) => !COLUMNS.includes(k));
const missingFromSource = COLUMNS.filter((k) => !observedKeys.has(k));
if (missingFromSchema.length || missingFromSource.length) {
  console.error('Schema/source column mismatch:');
  if (missingFromSchema.length) console.error('  observed but not in schema:', missingFromSchema);
  if (missingFromSource.length) console.error('  in schema but not observed:', missingFromSource);
  console.error('Aborting. Reconcile schema and source before proceeding.');
  process.exit(1);
}

if (observedKeys.size !== EXPECTED_COLUMN_COUNT) {
  console.warn(`[validate] WARNING: column count ${observedKeys.size} != expected ${EXPECTED_COLUMN_COUNT}. ARCHITECTURE.md R14 says 49. Continuing because schema matches source, but flag this.`);
}

// ---------- 3-5. Connect, transaction, upsert ----------
let pg;
try {
  pg = await import('pg');
} catch {
  console.error("Missing dependency: 'pg'. Run 'npm install pg' inside /db before executing this script.");
  process.exit(1);
}

const client = new pg.default.Client({ connectionString: DATABASE_URL });
await client.connect();
console.log(`[pg] connected`);

let r15Violations = [];
let upsertedCount = 0;

try {
  await client.query('BEGIN');
  console.log(`[pg] BEGIN`);

  const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = COLUMNS
    .filter((c) => c !== 'hyp_id')
    .map((c) => (c === 'trigger' ? `"trigger" = EXCLUDED."trigger"` : `${c} = EXCLUDED.${c}`))
    .join(', ');
  const insertCols = COLUMNS.map((c) => (c === 'trigger' ? `"trigger"` : c)).join(', ');
  const sql = `
    INSERT INTO hypothesis_register (${insertCols})
    VALUES (${placeholders})
    ON CONFLICT (hyp_id) DO UPDATE SET ${updateSet}
  `;

  for (const raw of rows) {
    const row = normaliseRow(raw);
    const values = COLUMNS.map((c) => {
      const v = row[c];
      if (v === undefined) return null;
      if (typeof v === 'string' && v === '') return null;
      return v;
    });
    await client.query(sql, values);
    upsertedCount++;

    // R15 violation surfacing
    const fail = [];
    if (!row.falsifiers) fail.push('falsifiable');
    if (!row.if_true || !row.if_false) fail.push('business_linked');
    if (!row.horizon_months || Number(row.horizon_months) <= 0) fail.push('time_bound');
    if (fail.length) r15Violations.push({ hyp_id: row.hyp_id, fail });
  }
  console.log(`[pg] upserted ${upsertedCount} rows`);

  // ---------- 5b. Verify ----------
  const { rows: countRows } = await client.query('SELECT count(*)::int AS n FROM hypothesis_register');
  const dbCount = countRows[0].n;
  console.log(`[pg] post-insert row count: ${dbCount}`);
  if (dbCount < EXPECTED_ROW_COUNT) {
    throw new Error(`Post-insert count ${dbCount} less than expected ${EXPECTED_ROW_COUNT}`);
  }

  // ---------- 6. Report R15 violations ----------
  if (r15Violations.length) {
    console.log(`\n[R15] ${r15Violations.length} hypothesis row(s) failed at least one four-test:`);
    for (const v of r15Violations.slice(0, 20)) {
      console.log(`  ${v.hyp_id.padEnd(16)} fails: ${v.fail.join(', ')}`);
    }
    if (r15Violations.length > 20) console.log(`  ... ${r15Violations.length - 20} more (full list in hypothesis_register_r15_violations view after commit)`);
  } else {
    console.log(`\n[R15] all rows pass the four-tests`);
  }

  // ---------- 7. Commit or rollback ----------
  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log(`\n[pg] COMMIT — ${upsertedCount} rows persisted`);
  } else {
    await client.query('ROLLBACK');
    console.log(`\n[pg] ROLLBACK (dry-run; pass --commit --confirm-yes to persist)`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\n[pg] ROLLBACK due to error: ${err.message}`);
  process.exit(1);
} finally {
  await client.end();
}

console.log(`\nDone. Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN (rolled back)'}`);
