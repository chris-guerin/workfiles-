#!/usr/bin/env node
// 007_runner.js
//
// Applies db/migrations/007_state_and_trajectory.sql.
// Schema effect: v7.0 → v7.1. Additive.
//
// Usage:
//   node 007_runner.js                       (dry-run, rolled back)
//   node 007_runner.js --commit --confirm-yes (persists)

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

const SQL_PATH = join(__dirname, '007_state_and_trajectory.sql');

console.log('=== Migration 007 — state + trajectory (v7.0 → v7.1) ===');
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

  const expected = [
    { table: 'initiatives_v2', column: 'state' },
    { table: 'initiatives_v2', column: 'trajectory' },
    { table: 'initiatives_v2', column: 'last_state_change_date' },
    { table: 'components',     column: 'state' },
    { table: 'components',     column: 'trajectory' },
  ];
  let n = 1;
  for (const e of expected) {
    const { rows } = await client.query(`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2
    `, [e.table, e.column]);
    if (rows.length === 0) throw new Error(`Missing column ${e.table}.${e.column}`);
    console.log(`  (${n}) ${e.table}.${e.column.padEnd(24)} type=${rows[0].data_type} nullable=${rows[0].is_nullable} ✓`);
    n++;
  }

  // CHECK constraints
  const constraints = ['initiatives_v2_state_enum','initiatives_v2_trajectory_enum','components_state_enum','components_trajectory_enum'];
  const { rows: cs } = await client.query(`SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])`, [constraints]);
  const missing = constraints.filter((c) => !cs.find((r) => r.conname === c));
  if (missing.length) throw new Error(`Missing CHECK constraint(s): ${missing.join(', ')}`);
  console.log(`  (${n}) CHECK constraints: ${cs.length}/${constraints.length} present ✓`);
  n++;

  // CHECK rejects bad values
  await client.query('SAVEPOINT chk');
  let rejected = false;
  try {
    await client.query(`UPDATE initiatives_v2 SET state='nonsense_value' WHERE id = (SELECT id FROM initiatives_v2 LIMIT 1)`);
  } catch { rejected = true; }
  await client.query('ROLLBACK TO SAVEPOINT chk');
  if (!rejected) throw new Error('CHECK did not reject invalid state value');
  console.log(`  (${n}) CHECK rejects invalid state value ✓`);
  n++;

  // schema_migrations row v7
  const { rows: sm } = await client.query(`SELECT version, name FROM schema_migrations WHERE version = 7`);
  if (sm.length === 0) throw new Error('schema_migrations row v7 missing');
  console.log(`  (${n}) schema_migrations v7 = ${sm[0].name} ✓`);
  n++;

  // Idempotency: re-run inside same transaction
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction without error ✓`);
  n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg]    COMMIT — schema 007 persisted (v7.0 → v7.1)');
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
