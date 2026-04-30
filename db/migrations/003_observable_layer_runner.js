#!/usr/bin/env node
// 003_observable_layer_runner.js
//
// Applies db/migrations/003_observable_layer.sql to Railway Postgres `hypothesis-db`.
// Pattern matches 002: ROLLBACK by default, --commit --confirm-yes to persist.
// ROLLBACK on any verification failure REGARDLESS of --commit flag.
//
// What 003 does:
//   - adds 3 cols to hypothesis_register: appraisal_cadence, last_appraisal_at, current_confidence_band
//   - creates 3 tables: hypothesis_observable (20 cols), hypothesis_observable_event (10 cols),
//                       confidence_band_history (17 cols)
//   - creates 1 view: hypothesis_matrix_summary
//   - adds 21 named CHECK constraints
//
// 17 verification queries before commit decision. Any failure → ROLLBACK and exit 1.
//
// Idempotent SQL. Safe to re-run.
//
// Usage:
//   node 003_observable_layer_runner.js                       # dry-run
//   node 003_observable_layer_runner.js --commit --confirm-yes
//
// Env (from /db/.env then /n8n/.env):
//   DATABASE_URL — Postgres connection string

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in db/.env.');
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

const SQL_PATH = join(__dirname, '003_observable_layer.sql');

// ---------- expectations ----------
const EXPECTED_NEW_COLUMNS = ['appraisal_cadence', 'last_appraisal_at', 'current_confidence_band'];

const EXPECTED_NEW_TABLES = [
  'hypothesis_observable',
  'hypothesis_observable_event',
  'confidence_band_history',
];

const EXPECTED_TABLE_COL_COUNTS = {
  hypothesis_observable:        20,
  hypothesis_observable_event:  10,
  confidence_band_history:      17,
};

// PK creates an implicit index in pg_indexes; named indexes added explicitly.
// hypothesis_observable: PK + (hyp_id, line, role) = 4
// hypothesis_observable_event: PK + (hyp_id, event_date, actor) = 4
// confidence_band_history: PK + (hyp_id, recorded_at, hyp_id+recorded_at) = 4
const EXPECTED_INDEX_COUNTS = {
  hypothesis_observable:        4,
  hypothesis_observable_event:  4,
  confidence_band_history:      4,
};

const EXPECTED_NEW_VIEW = 'hypothesis_matrix_summary';

const EXPECTED_NEW_CONSTRAINTS = [
  // hypothesis_register
  'appraisal_cadence_enum',
  'current_confidence_band_range',
  // hypothesis_observable (5 enums)
  'observable_line_enum',
  'observable_role_enum',
  'observable_scale_type_enum',
  'observable_threshold_direction_enum',
  'observable_velocity_status_enum',
  // hypothesis_observable_event (2 enums)
  'event_type_enum',
  'event_implication_severity_enum',
  // confidence_band_history (12: 6 range + 6 zone)
  'cbh_overall_position_range',
  'cbh_overall_zone_enum',
  'cbh_tech_position_range',
  'cbh_tech_zone_enum',
  'cbh_market_position_range',
  'cbh_market_zone_enum',
  'cbh_reg_position_range',
  'cbh_reg_zone_enum',
  'cbh_eco_position_range',
  'cbh_eco_zone_enum',
  'cbh_comp_position_range',
  'cbh_comp_zone_enum',
];
// 21 expected

const EXPECTED_REGISTER_ROW_COUNT = 118;

// ---------- run ----------
console.log('=== Migration 003 — observable layer (v5.0 → v5.6) ===');
console.log(`Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN (rolled back)'}`);
console.log('');

const sql = await readFile(SQL_PATH, 'utf8');
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
console.log('[pg]    connected');

try {
  await client.query('BEGIN');
  console.log('[pg]    BEGIN');

  // Apply the migration
  await client.query(sql);
  console.log('[pg]    SQL applied');

  // ---------- verification ----------
  console.log('');
  console.log('=== Verification (any failure → ROLLBACK regardless of --commit flag) ===');

  // (1-3) Column additions to hypothesis_register
  const { rows: colRows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hypothesis_register'
      AND column_name = ANY($1::text[])
    ORDER BY column_name
  `, [EXPECTED_NEW_COLUMNS]);
  const foundCols = colRows.map((r) => r.column_name);
  for (const c of EXPECTED_NEW_COLUMNS) {
    if (!foundCols.includes(c)) throw new Error(`Missing column on hypothesis_register: ${c}`);
  }
  console.log(`  (1-3) hypothesis_register cols: ${foundCols.join(', ')} ✓`);

  // (4-6) New tables exist with expected column counts
  let checkN = 4;
  for (const table of EXPECTED_NEW_TABLES) {
    const { rows: t } = await client.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    const colCount = t[0].n;
    const expectedCount = EXPECTED_TABLE_COL_COUNTS[table];
    if (colCount === 0) throw new Error(`Table ${table} not found`);
    if (colCount !== expectedCount) throw new Error(`Table ${table} has ${colCount} cols; expected ${expectedCount}`);
    console.log(`  (${checkN}) ${table.padEnd(32)} cols=${colCount} (expected ${expectedCount}) ✓`);
    checkN++;
  }

  // (7) View exists and is selectable
  const { rows: viewRows } = await client.query(`
    SELECT to_regclass('public.${EXPECTED_NEW_VIEW}') AS reg
  `);
  if (!viewRows[0].reg) throw new Error(`View ${EXPECTED_NEW_VIEW} not found`);
  console.log(`  (${checkN}) view ${EXPECTED_NEW_VIEW} exists ✓`);
  checkN++;

  // (8-10) Index counts on the three new tables
  for (const table of EXPECTED_NEW_TABLES) {
    const { rows: idx } = await client.query(`
      SELECT count(*)::int AS n FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
    `, [table]);
    const idxCount = idx[0].n;
    const expectedIdx = EXPECTED_INDEX_COUNTS[table];
    if (idxCount !== expectedIdx) {
      throw new Error(`Table ${table} has ${idxCount} indexes; expected ${expectedIdx}`);
    }
    console.log(`  (${checkN}) ${table.padEnd(32)} indexes=${idxCount} (expected ${expectedIdx}) ✓`);
    checkN++;
  }

  // (11) All 118 existing hypotheses got default appraisal_cadence='weekly'
  const { rows: cad } = await client.query(`
    SELECT count(*)::int AS n FROM hypothesis_register WHERE appraisal_cadence = 'weekly'
  `);
  if (cad[0].n !== EXPECTED_REGISTER_ROW_COUNT) {
    throw new Error(`appraisal_cadence='weekly' default applied to ${cad[0].n} rows; expected ${EXPECTED_REGISTER_ROW_COUNT}`);
  }
  console.log(`  (${checkN}) appraisal_cadence='weekly' applied to all ${cad[0].n} rows ✓`);
  checkN++;

  // (12) All 118 got default current_confidence_band=0.500
  const { rows: ccb } = await client.query(`
    SELECT count(*)::int AS n FROM hypothesis_register WHERE current_confidence_band = 0.500
  `);
  if (ccb[0].n !== EXPECTED_REGISTER_ROW_COUNT) {
    throw new Error(`current_confidence_band=0.500 applied to ${ccb[0].n} rows; expected ${EXPECTED_REGISTER_ROW_COUNT}`);
  }
  console.log(`  (${checkN}) current_confidence_band=0.500 applied to all ${ccb[0].n} rows ✓`);
  checkN++;

  // (13) Matrix summary view returns 118 rows
  const { rows: mvCount } = await client.query(`SELECT count(*)::int AS n FROM ${EXPECTED_NEW_VIEW}`);
  if (mvCount[0].n !== EXPECTED_REGISTER_ROW_COUNT) {
    throw new Error(`${EXPECTED_NEW_VIEW} returned ${mvCount[0].n} rows; expected ${EXPECTED_REGISTER_ROW_COUNT}`);
  }
  console.log(`  (${checkN}) ${EXPECTED_NEW_VIEW} row count=${mvCount[0].n} (expected ${EXPECTED_REGISTER_ROW_COUNT}) ✓`);
  checkN++;

  // (14) All matrix counts = 0 on a fresh deploy (no observables loaded)
  const { rows: mvNonZero } = await client.query(`
    SELECT count(*)::int AS n FROM ${EXPECTED_NEW_VIEW}
    WHERE total_matrix_size > 0
       OR tech_observable_count > 0
       OR market_observable_count > 0
       OR reg_observable_count > 0
       OR eco_observable_count > 0
       OR competitive_event_count > 0
       OR unlock_count > 0
       OR iteration_count > 0
       OR supporting_count > 0
  `);
  if (mvNonZero[0].n !== 0) {
    throw new Error(`${EXPECTED_NEW_VIEW} has ${mvNonZero[0].n} rows with non-zero counts; expected 0 on fresh deploy`);
  }
  console.log(`  (${checkN}) ${EXPECTED_NEW_VIEW} all observable/event/role counts = 0 ✓`);
  checkN++;

  // (15) All 21 expected CHECK constraints exist
  const { rows: conRows } = await client.query(`
    SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[]) ORDER BY conname
  `, [EXPECTED_NEW_CONSTRAINTS]);
  const foundCons = conRows.map((r) => r.conname);
  const missingCons = EXPECTED_NEW_CONSTRAINTS.filter((c) => !foundCons.includes(c));
  if (missingCons.length) {
    throw new Error(`Missing constraint(s): ${missingCons.join(', ')}`);
  }
  console.log(`  (${checkN}) named constraints: ${foundCons.length} of ${EXPECTED_NEW_CONSTRAINTS.length} expected ✓`);
  checkN++;

  // (16) Idempotency check
  await client.query(sql);
  console.log(`  (${checkN}) idempotency: re-applied SQL inside transaction without error ✓`);
  checkN++;

  // (17) Existing register row count preserved
  const { rows: regRows } = await client.query('SELECT count(*)::int AS n FROM hypothesis_register');
  if (regRows[0].n !== EXPECTED_REGISTER_ROW_COUNT) {
    throw new Error(`hypothesis_register row count is ${regRows[0].n}; expected ${EXPECTED_REGISTER_ROW_COUNT}`);
  }
  console.log(`  (${checkN}) hypothesis_register row count preserved: ${regRows[0].n} ✓`);
  checkN++;

  console.log('');
  console.log(`All ${checkN - 1} verification checks passed.`);

  // ---------- commit / rollback ----------
  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('');
    console.log('[pg]    COMMIT — schema 003 persisted (v5.0 → v5.6 register; observable layer live)');
  } else {
    await client.query('ROLLBACK');
    console.log('');
    console.log('[pg]    ROLLBACK (dry-run; pass --commit --confirm-yes to persist)');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('');
  console.error(`[pg]    ROLLBACK due to error: ${err.message}`);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  await client.end();
  process.exit(1);
}

await client.end();
console.log('');
console.log(`Done. Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN (rolled back)'}`);
