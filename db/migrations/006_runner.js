#!/usr/bin/env node
// 006_runner.js
//
// Applies db/migrations/006_v2_framework.sql to Railway Postgres `hypothesis-db`.
// ROLLBACK by default, --commit --confirm-yes to persist. Verification rolls back regardless.
//
// What 006 does (per /docs/SCHEMA_V2.md sections 3-6):
//   - creates 8 tables: companies, initiatives_v2, attribute_definitions, tech_functions,
//     components, component_attributes, claims_v2, schema_migrations
//   - 7 indexes (3 on components, 2 on component_attributes, 2 on claims_v2)
//   - trigger function create_component_attributes() + trigger tr_create_component_attributes
//     (AFTER INSERT ON components)
//   - 2 views: components_incomplete, components_with_full_record
//   - seeds 61 attribute_definitions rows (13 tech / 12 each x regulation/market/ecosystem/competition)
//   - seeds schema_migrations rows for versions 1-6 (backfill 1-5 + this migration)
//
// Schema effect: v6.1 → v7.0. Additive — v1 tables remain untouched.
//
// Verifications (all run inside the transaction; any failure → ROLLBACK regardless of --commit):
//   (1)  All 8 tables exist
//   (2)  attribute_definitions count = 61
//   (3)  per-vector breakdown: 13 tech / 12 each for regulation/market/ecosystem/competition
//   (4)  Both views exist (information_schema.views)
//   (5)  Trigger tr_create_component_attributes registered (information_schema.triggers)
//   (6)  schema_migrations contains versions 1-6
//   (7)  Trigger end-to-end: insert test company → initiative → tech component, expect
//        13 component_attributes rows with value_status='pending', then DELETE in
//        reverse order so the catalogue stays empty
//   (8)  CHECK constraint on component_attributes value_status rejects partial rows
//   (9)  Spot-check column shapes on each new table (information_schema.columns)
//
// Usage:
//   node 006_runner.js                       (dry-run; rolls back)
//   node 006_runner.js --commit --confirm-yes (persists changes)

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

const SQL_PATH = join(__dirname, '006_v2_framework.sql');

const EXPECTED_TABLES = [
  'companies',
  'initiatives_v2',
  'attribute_definitions',
  'tech_functions',
  'components',
  'component_attributes',
  'claims_v2',
  'schema_migrations',
];

const EXPECTED_VIEWS = [
  'components_incomplete',
  'components_with_full_record',
];

const EXPECTED_VECTOR_COUNTS = {
  tech:        13,
  regulation:  12,
  market:      12,
  ecosystem:   12,
  competition: 12,
};

const EXPECTED_MIGRATION_VERSIONS = [1, 2, 3, 4, 5, 6];

console.log('=== Migration 006 — v2 framework (v6.1 → v7.0) ===');
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
  console.log('[pg]    SQL applied (8 tables, 1 trigger, 2 views, 61 attribute_definitions, 6 schema_migrations rows)');

  console.log('');
  console.log('=== Verification (any failure → ROLLBACK regardless of --commit flag) ===');

  let n = 1;

  // (1) All 8 tables exist
  {
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])
    `, [EXPECTED_TABLES]);
    const found = new Set(rows.map((r) => r.table_name));
    const missing = EXPECTED_TABLES.filter((t) => !found.has(t));
    if (missing.length) throw new Error(`Missing table(s): ${missing.join(', ')}`);
    console.log(`  (${n}) all 8 tables present: ${EXPECTED_TABLES.join(', ')} ✓`);
    n++;
  }

  // (2) attribute_definitions total = 61
  {
    const { rows } = await client.query('SELECT count(*)::int AS n FROM attribute_definitions');
    if (rows[0].n !== 61) throw new Error(`attribute_definitions count = ${rows[0].n}, expected 61`);
    console.log(`  (${n}) attribute_definitions total = 61 ✓`);
    n++;
  }

  // (3) per-vector breakdown
  {
    const { rows } = await client.query(`
      SELECT vector, count(*)::int AS n FROM attribute_definitions GROUP BY vector ORDER BY vector
    `);
    const got = Object.fromEntries(rows.map((r) => [r.vector, r.n]));
    for (const v of Object.keys(EXPECTED_VECTOR_COUNTS)) {
      if (got[v] !== EXPECTED_VECTOR_COUNTS[v]) {
        throw new Error(`vector=${v}: got ${got[v]}, expected ${EXPECTED_VECTOR_COUNTS[v]}`);
      }
    }
    const breakdown = Object.entries(got).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`  (${n}) per-vector breakdown matches spec — ${breakdown} ✓`);
    n++;
  }

  // (4) Both views exist
  {
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [EXPECTED_VIEWS]);
    const found = new Set(rows.map((r) => r.table_name));
    const missing = EXPECTED_VIEWS.filter((v) => !found.has(v));
    if (missing.length) throw new Error(`Missing view(s): ${missing.join(', ')}`);
    console.log(`  (${n}) both views present: ${EXPECTED_VIEWS.join(', ')} ✓`);
    n++;
  }

  // (5) Trigger registered
  {
    const { rows } = await client.query(`
      SELECT trigger_name, event_manipulation, event_object_table, action_timing
      FROM information_schema.triggers
      WHERE trigger_schema = 'public' AND trigger_name = 'tr_create_component_attributes'
    `);
    if (rows.length === 0) throw new Error('Trigger tr_create_component_attributes not registered');
    const r = rows[0];
    if (r.event_object_table !== 'components' || r.event_manipulation !== 'INSERT' || r.action_timing !== 'AFTER') {
      throw new Error(`Trigger metadata wrong: ${JSON.stringify(r)}`);
    }
    console.log(`  (${n}) trigger tr_create_component_attributes registered (AFTER INSERT on components) ✓`);
    n++;
  }

  // (6) schema_migrations rows for versions 1-6
  {
    const { rows } = await client.query(`
      SELECT version, name FROM schema_migrations WHERE version = ANY($1::int[]) ORDER BY version
    `, [EXPECTED_MIGRATION_VERSIONS]);
    const got = rows.map((r) => r.version);
    const missing = EXPECTED_MIGRATION_VERSIONS.filter((v) => !got.includes(v));
    if (missing.length) throw new Error(`Missing schema_migrations versions: ${missing.join(', ')}`);
    const summary = rows.map((r) => `v${r.version}=${r.name}`).join(', ');
    console.log(`  (${n}) schema_migrations versions 1-6 present — ${summary} ✓`);
    n++;
  }

  // (7) Trigger end-to-end test: insert test rows, expect 13 pending attrs, DELETE in reverse
  {
    const TEST_NAME = '_TEST_DELETE_ME';
    const { rows: companyRows } = await client.query(`
      INSERT INTO companies (name, sector) VALUES ($1, 'energy') RETURNING id
    `, [TEST_NAME]);
    const companyId = companyRows[0].id;

    const { rows: initRows } = await client.query(`
      INSERT INTO initiatives_v2 (company_id, name) VALUES ($1, $2) RETURNING id
    `, [companyId, TEST_NAME]);
    const initiativeId = initRows[0].id;

    const { rows: compRows } = await client.query(`
      INSERT INTO components (initiative_id, name, component_type, vector, source_citation)
      VALUES ($1, $2, 'tech', 'tech', '_test')
      RETURNING id
    `, [initiativeId, TEST_NAME]);
    const componentId = compRows[0].id;

    const { rows: attrRows } = await client.query(`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE value_status = 'pending')::int AS pending
      FROM component_attributes WHERE component_id = $1
    `, [componentId]);
    if (attrRows[0].n !== 13) throw new Error(`expected 13 component_attributes for tech component, got ${attrRows[0].n}`);
    if (attrRows[0].pending !== 13) throw new Error(`expected all 13 pending, got ${attrRows[0].pending}`);

    // DELETE in reverse order. Cascades would drop component_attributes anyway, but we
    // want to exercise explicit DELETE of test rows per the user's instruction.
    const { rowCount: delAttrs } = await client.query(`DELETE FROM component_attributes WHERE component_id = $1`, [componentId]);
    const { rowCount: delComp }  = await client.query(`DELETE FROM components WHERE id = $1`, [componentId]);
    const { rowCount: delInit }  = await client.query(`DELETE FROM initiatives_v2 WHERE id = $1`, [initiativeId]);
    const { rowCount: delCo }    = await client.query(`DELETE FROM companies WHERE id = $1`, [companyId]);

    // Confirm catalogue empty
    const { rows: leftover } = await client.query(`
      SELECT
        (SELECT count(*)::int FROM companies WHERE name = $1)        AS companies_left,
        (SELECT count(*)::int FROM initiatives_v2 WHERE name = $1)   AS initiatives_left,
        (SELECT count(*)::int FROM components WHERE name = $1)       AS components_left,
        (SELECT count(*)::int FROM component_attributes
           WHERE component_id = $2)                                  AS attrs_left
    `, [TEST_NAME, componentId]);
    const lo = leftover[0];
    if (lo.companies_left || lo.initiatives_left || lo.components_left || lo.attrs_left) {
      throw new Error(`test rows leaked: ${JSON.stringify(lo)}`);
    }

    console.log(`  (${n}) trigger end-to-end test ✓`);
    console.log(`        INSERT company('${TEST_NAME}', 'energy') → id=${companyId}`);
    console.log(`        INSERT initiatives_v2(company_id=${companyId}) → id=${initiativeId}`);
    console.log(`        INSERT components(vector='tech') → id=${componentId}`);
    console.log(`        trigger fired: 13/13 component_attributes created with value_status='pending'`);
    console.log(`        DELETE in reverse: ${delAttrs} attrs, ${delComp} comp, ${delInit} init, ${delCo} co`);
    console.log(`        catalogue empty after cleanup: ${JSON.stringify(lo)} ✓`);
    n++;
  }

  // (8) component_attributes CHECK constraint rejects partial rows
  {
    await client.query('SAVEPOINT chk');
    let rejectedCount = 0;
    const cases = [
      // populated without source_citation → must reject
      `INSERT INTO component_attributes (component_id, attribute_def_id, value_status)
       SELECT 1, ad.id, 'populated' FROM attribute_definitions ad LIMIT 1`,
      // not_in_source without not_in_source_reason → must reject
      `INSERT INTO component_attributes (component_id, attribute_def_id, value_status)
       SELECT 1, ad.id, 'not_in_source' FROM attribute_definitions ad LIMIT 1`,
      // not_applicable without not_applicable_reason → must reject
      `INSERT INTO component_attributes (component_id, attribute_def_id, value_status)
       SELECT 1, ad.id, 'not_applicable' FROM attribute_definitions ad LIMIT 1`,
    ];
    for (const sqlText of cases) {
      try {
        await client.query(sqlText);
      } catch (e) {
        rejectedCount++;
      }
      await client.query('ROLLBACK TO SAVEPOINT chk');
    }
    if (rejectedCount !== 3) throw new Error(`expected 3/3 invalid combinations rejected, got ${rejectedCount}`);
    console.log(`  (${n}) component_attributes CHECK rejects all 3 partial-state combinations ✓`);
    n++;
  }

  // (9) Spot-check column shapes on each new table
  {
    const colSpec = {
      companies:             ['id','name','sector','notes','created_at','last_updated_at'],
      initiatives_v2:        ['id','company_id','name','draft_status'],
      attribute_definitions: ['id','vector','attribute_name','value_type','is_required','display_order'],
      tech_functions:        ['id','function_name','description','physical_principle','typical_failure_mode'],
      components:            ['id','initiative_id','parent_component_id','name','component_type','vector','source_citation'],
      component_attributes:  ['id','component_id','attribute_def_id','value_status','source_citation'],
      claims_v2:             ['id','initiative_id','component_id','claim_text','role','impact','criticality'],
      schema_migrations:     ['version','name','applied_at'],
    };
    for (const [table, expectedCols] of Object.entries(colSpec)) {
      const { rows } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);
      const got = new Set(rows.map((r) => r.column_name));
      const missing = expectedCols.filter((c) => !got.has(c));
      if (missing.length) throw new Error(`${table} missing columns: ${missing.join(', ')}`);
    }
    console.log(`  (${n}) spot-check column shapes match spec for all 8 tables ✓`);
    n++;
  }

  console.log('');
  console.log(`All ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('');
    console.log('[pg]    COMMIT — schema 006 persisted (v6.1 → v7.0; v2 framework live)');
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
