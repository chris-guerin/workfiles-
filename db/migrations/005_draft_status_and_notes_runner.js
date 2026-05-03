#!/usr/bin/env node
// 005_draft_status_and_notes_runner.js
//
// Applies db/migrations/005_draft_status_and_notes.sql to Railway Postgres `hypothesis-db`.
// ROLLBACK by default, --commit --confirm-yes to persist. Verification rolls back regardless.
//
// What 005 does:
//   - adds initiatives.notes (TEXT, nullable)
//   - adds {initiatives, entities, links}.draft_status (TEXT, NOT NULL, DEFAULT 'live')
//   - 3 named CHECK constraints on draft_status enum
//
// Schema effect: v6.0 → v6.1. Additive.
//
// 7 verification checks before commit decision.
//
// Idempotent SQL. Safe to re-run.
//
// Usage:
//   node 005_draft_status_and_notes_runner.js
//   node 005_draft_status_and_notes_runner.js --commit --confirm-yes

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  console.error('Missing DATABASE_URL.');
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

const SQL_PATH = join(__dirname, '005_draft_status_and_notes.sql');

const EXPECTED_NEW_COLUMNS = [
  { table: 'initiatives', column: 'notes' },
  { table: 'initiatives', column: 'draft_status' },
  { table: 'entities',    column: 'draft_status' },
  { table: 'links',       column: 'draft_status' },
];

const EXPECTED_CHECK_CONSTRAINTS = [
  'initiatives_draft_status_enum',
  'entities_draft_status_enum',
  'links_draft_status_enum',
];

console.log('=== Migration 005 — draft_status + initiatives.notes (v6.0 → v6.1) ===');
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
  console.log('=== Verification (any failure → ROLLBACK regardless of --commit flag) ===');

  let n = 1;

  // (1-4) Each new column exists
  for (const col of EXPECTED_NEW_COLUMNS) {
    const { rows } = await client.query(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    `, [col.table, col.column]);
    if (rows.length === 0) throw new Error(`Missing column: ${col.table}.${col.column}`);
    console.log(`  (${n}) ${col.table}.${col.column.padEnd(14)} type=${rows[0].data_type} nullable=${rows[0].is_nullable} default=${rows[0].column_default || '—'} ✓`);
    n++;
  }

  // (5) All three CHECK constraints exist
  const { rows: cs } = await client.query(`
    SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])
  `, [EXPECTED_CHECK_CONSTRAINTS]);
  const missing = EXPECTED_CHECK_CONSTRAINTS.filter((c) => !cs.find((r) => r.conname === c));
  if (missing.length) throw new Error(`Missing CHECK constraint(s): ${missing.join(', ')}`);
  console.log(`  (${n}) draft_status CHECK constraints: ${cs.length}/${EXPECTED_CHECK_CONSTRAINTS.length} ✓`);
  n++;

  // (6) CHECK constraints reject invalid values
  await client.query('SAVEPOINT chk');
  let rejected = false;
  try {
    await client.query(`
      INSERT INTO initiatives (id, name, company, register, hypothesis_statement, time_horizon, decision_threshold, draft_status)
      VALUES ('TEST_INVALID_STATUS', 'test', 'test', 'PERSONAL', 'test', '2030', 'test', 'not_a_real_status')
    `);
  } catch (e) {
    rejected = true;
  }
  await client.query('ROLLBACK TO SAVEPOINT chk');
  if (!rejected) throw new Error('CHECK constraint did not reject invalid draft_status');
  console.log(`  (${n}) CHECK constraints reject invalid values ✓`);
  n++;

  // (7) Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction without error ✓`);
  n++;

  console.log('');
  console.log(`All ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('');
    console.log('[pg]    COMMIT — schema 005 persisted (v6.0 → v6.1; draft_status + notes live)');
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
