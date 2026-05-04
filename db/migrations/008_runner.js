#!/usr/bin/env node
// 008_runner.js
//
// Applies db/migrations/008_v3_framework.sql.
// Schema effect: v7.1 → v8.0. Additive.
//
// Usage:
//   node 008_runner.js                       (dry-run, rolled back)
//   node 008_runner.js --commit --confirm-yes (persists)

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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Missing DATABASE_URL.'); process.exit(1); }

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const CONFIRM = args.includes('--confirm-yes');
const WILL_COMMIT = COMMIT && CONFIRM;
if (COMMIT && !CONFIRM) {
  console.error('--commit was passed without --confirm-yes. Aborting for safety.');
  process.exit(1);
}

const SQL_PATH = join(__dirname, '008_v3_framework.sql');

console.log('=== Migration 008 — v3 framework (v7.1 → v8.0) ===');
console.log(`Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN (rolled back)'}`);
console.log('');

const sql = await readFile(SQL_PATH, 'utf8');
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
console.log('[pg]    connected');

try {
  await client.query('BEGIN');
  console.log('[pg]    BEGIN');
  await client.query(sql);
  console.log('[pg]    SQL applied');

  console.log('');
  console.log('=== Verification ===');

  let n = 1;

  // (1) New columns on existing tables
  const newCols = [
    ['component_attributes', ['value_unit','velocity_pct_yoy','velocity_direction','as_of_date','reasoning_text']],
    ['claims_v2',            ['threshold_direction','criticality_reasoning','impact_reasoning']],
    ['initiatives_v2',       ['state_reasoning','trajectory_reasoning']],
    ['components',           ['state_reasoning','trajectory_reasoning']],
    ['tech_functions',       ['current_trl','cost_trajectory_pct_yoy','cost_trajectory_unit','as_of_date','substitution_risk']],
  ];
  for (const [table, cols] of newCols) {
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2::text[])
    `, [table, cols]);
    const got = new Set(rows.map((r) => r.column_name));
    const missing = cols.filter((c) => !got.has(c));
    if (missing.length) throw new Error(`${table} missing columns: ${missing.join(', ')}`);
    console.log(`  (${n}) ${table}: +${cols.length} columns ✓`);
    n++;
  }

  // (2) New tables
  const newTables = [
    'component_dependencies', 'mini_signals_v3', 'catalogue_names',
    'signal_candidate_matches', 'signal_claim_impacts', 'attribute_observations',
    'contacts', 'contact_initiative_interests', 'generated_signals', 'generated_emails',
  ];
  for (const t of newTables) {
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1
    `, [t]);
    if (rows.length === 0) throw new Error(`Table missing: ${t}`);
  }
  console.log(`  (${n}) all 10 new tables present ✓`);
  n++;

  // (3) attribute_observations is partitioned (5 partitions)
  const { rows: parts } = await client.query(`
    SELECT child.relname AS partition_name
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
    WHERE parent.relname = 'attribute_observations'
    ORDER BY child.relname
  `);
  if (parts.length !== 5) throw new Error(`expected 5 partitions, got ${parts.length}`);
  console.log(`  (${n}) attribute_observations partitions: ${parts.map((r) => r.partition_name).join(', ')} ✓`);
  n++;

  // (4) GIN indexes on mini_signals_v3
  const { rows: idx } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND indexname IN ('idx_signal_entities_gin','idx_signal_attr_types_gin','idx_signal_geo_gin')
  `);
  if (idx.length !== 3) throw new Error(`expected 3 GIN indexes, got ${idx.length}`);
  console.log(`  (${n}) GIN indexes present: ${idx.map((r) => r.indexname).join(', ')} ✓`);
  n++;

  // (5) value_status enum extended
  const { rows: cs } = await client.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname = 'component_attributes_value_status_check'
  `);
  if (cs.length === 0 || !cs[0].def.includes('pending_analyst_review')) {
    throw new Error('value_status check did not include pending_analyst_review');
  }
  console.log(`  (${n}) component_attributes value_status enum extended (+pending_analyst_review) ✓`);
  n++;

  // (6) schema_migrations row v8
  const { rows: sm } = await client.query(`SELECT version, name FROM schema_migrations WHERE version = 8`);
  if (sm.length === 0) throw new Error('schema_migrations row v8 missing');
  console.log(`  (${n}) schema_migrations v8 = ${sm[0].name} ✓`);
  n++;

  // (7) Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction without error ✓`);
  n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg]    COMMIT — schema 008 persisted (v7.1 → v8.0)');
  } else {
    await client.query('ROLLBACK');
    console.log('\n[pg]    ROLLBACK (dry-run; pass --commit --confirm-yes to persist)');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\n[pg]    ROLLBACK due to error: ${err.message}`);
  await client.end();
  process.exit(1);
}

await client.end();
console.log(`\nDone. Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
