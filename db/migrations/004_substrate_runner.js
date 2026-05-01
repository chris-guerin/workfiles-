#!/usr/bin/env node
// 004_substrate_runner.js
//
// Applies db/migrations/004_substrate.sql to Railway Postgres `hypothesis-db`.
// Pattern matches 003: ROLLBACK by default, --commit --confirm-yes to persist.
// ROLLBACK on any verification failure REGARDLESS of --commit flag.
//
// What 004 does:
//   - creates 9 new tables in FK-dependency order:
//       initiatives, entities, links, competitive_events,
//       mini_signals, news, signals, heat_map_aggregates, recommendations
//   - 4 FKs: links→initiatives, links→entities, signals→entities, signals→mini_signals
//   - 14 named CHECK constraints, 3 named UNIQUE constraints, 12 named indexes
//
// Schema effect: v5.6 → v6.0 (legacy observable_layer tables remain in place,
// scheduled for drop in migration 005).
//
// 14 verification checks before commit decision. Any failure → ROLLBACK and exit 1.
//
// Idempotent SQL. Safe to re-run.
//
// Usage:
//   node 004_substrate_runner.js                       # dry-run
//   node 004_substrate_runner.js --commit --confirm-yes
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

const SQL_PATH = join(__dirname, '004_substrate.sql');

// ---------- expectations ----------
// Tables in FK-dependency order. Column counts match the SQL definitions
// (note: spec narrative says 16/24 for news/mini_signals; the actual column
// listings in the spec contain 17/26 fields — SQL follows the listings).
const EXPECTED_TABLES = [
  { name: 'initiatives',         cols: 13 },
  { name: 'entities',            cols: 10 },
  { name: 'links',               cols: 10 },
  { name: 'competitive_events',  cols: 11 },
  { name: 'mini_signals',        cols: 26 },
  { name: 'news',                cols: 17 },
  { name: 'signals',             cols: 19 },
  { name: 'heat_map_aggregates', cols: 6  },
  { name: 'recommendations',     cols: 8  },
];

// 4 foreign keys
const EXPECTED_FKS = [
  { table: 'links',   column: 'initiative_id',         references: 'initiatives' },
  { table: 'links',   column: 'entity_id',             references: 'entities' },
  { table: 'signals', column: 'target_entity',         references: 'entities' },
  { table: 'signals', column: 'source_mini_signal_id', references: 'mini_signals' },
];

// 14 named CHECK constraints
const EXPECTED_CHECKS = [
  'initiatives_register_enum',
  'initiatives_baseline_confidence_range',
  'initiatives_current_confidence_range',
  'entities_type_enum',
  'entities_state_enum',
  'entities_baseline_state_enum',
  'links_role_enum',
  'links_impact_enum',
  'links_criticality_enum',
  'competitive_events_severity_enum',
  'signals_direction_enum',
  'signals_magnitude_enum',
  'signals_assessment_confidence_enum',
  'signals_new_state_enum',
];

// 12 named indexes (excludes implicit indexes from PK and column-level UNIQUE)
const EXPECTED_INDEXES = [
  'idx_links_initiative',
  'idx_links_entity',
  'idx_mini_signals_content_hash',
  'idx_mini_signals_extracted_at',
  'idx_news_content_hash',
  'idx_news_pub_date',
  'idx_signals_target_entity',
  'idx_signals_applied_at',
  'idx_signals_content_hash',
  'idx_heat_map_date',
  'idx_recommendations_company',
  'idx_recommendations_active',
];

// ---------- run ----------
console.log('=== Migration 004 — initiative-model substrate (v5.6 → v6.0) ===');
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

  let checkN = 1;

  // (1-9) Each new table exists with expected column count
  for (const t of EXPECTED_TABLES) {
    const { rows } = await client.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [t.name]);
    const cols = rows[0].n;
    if (cols === 0) throw new Error(`Table ${t.name} not found`);
    if (cols !== t.cols) {
      throw new Error(`Table ${t.name} has ${cols} cols; expected ${t.cols}`);
    }
    console.log(`  (${checkN}) ${t.name.padEnd(22)} cols=${cols} (expected ${t.cols}) ✓`);
    checkN++;
  }

  // (10) All 4 FK constraints in place
  const { rows: fkRows } = await client.query(`
    SELECT
      tc.table_name AS table_name,
      kcu.column_name AS column_name,
      ccu.table_name AS references_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN ('links','signals')
    ORDER BY tc.table_name, kcu.column_name
  `);
  for (const expected of EXPECTED_FKS) {
    const found = fkRows.find((r) =>
      r.table_name === expected.table &&
      r.column_name === expected.column &&
      r.references_table === expected.references
    );
    if (!found) {
      throw new Error(`Missing FK: ${expected.table}.${expected.column} → ${expected.references}`);
    }
  }
  console.log(`  (${checkN}) FK constraints: ${EXPECTED_FKS.length} of ${EXPECTED_FKS.length} expected ✓`);
  checkN++;

  // (11) All named CHECK constraints exist
  const { rows: checkRows } = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conname = ANY($1::text[])
    ORDER BY conname
  `, [EXPECTED_CHECKS]);
  const foundChecks = checkRows.map((r) => r.conname);
  const missingChecks = EXPECTED_CHECKS.filter((c) => !foundChecks.includes(c));
  if (missingChecks.length) {
    throw new Error(`Missing CHECK constraint(s): ${missingChecks.join(', ')}`);
  }
  console.log(`  (${checkN}) CHECK constraints: ${foundChecks.length} of ${EXPECTED_CHECKS.length} expected ✓`);
  checkN++;

  // (12) All named indexes exist
  const { rows: idxRows } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY($1::text[])
    ORDER BY indexname
  `, [EXPECTED_INDEXES]);
  const foundIdx = idxRows.map((r) => r.indexname);
  const missingIdx = EXPECTED_INDEXES.filter((i) => !foundIdx.includes(i));
  if (missingIdx.length) {
    throw new Error(`Missing index(es): ${missingIdx.join(', ')}`);
  }
  console.log(`  (${checkN}) named indexes: ${foundIdx.length} of ${EXPECTED_INDEXES.length} expected ✓`);
  checkN++;

  // (13) All 9 tables empty on fresh deploy
  const tableRowCounts = [];
  for (const t of EXPECTED_TABLES) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t.name}`);
    tableRowCounts.push({ name: t.name, n: rows[0].n });
  }
  const nonEmpty = tableRowCounts.filter((t) => t.n !== 0);
  if (nonEmpty.length) {
    throw new Error(`Non-empty tables on fresh deploy: ${nonEmpty.map((t) => `${t.name}=${t.n}`).join(', ')}`);
  }
  console.log(`  (${checkN}) all ${EXPECTED_TABLES.length} new tables empty ✓`);
  checkN++;

  // (14) Idempotency
  await client.query(sql);
  console.log(`  (${checkN}) idempotency: re-applied SQL inside transaction without error ✓`);
  checkN++;

  console.log('');
  console.log(`All ${checkN - 1} verification checks passed.`);

  // ---------- commit / rollback ----------
  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('');
    console.log('[pg]    COMMIT — schema 004 persisted (v5.6 → v6.0; initiative-model substrate live)');
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
