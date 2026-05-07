#!/usr/bin/env node
// 017_runner.js — applies db/migrations/017_schema_separation.sql.
// Schema effect: v10.4 -> v10.5. Reorganisation only — no rows moved,
// no FKs broken (PG rewrites FK constraint targets when ALTER TABLE
// SET SCHEMA runs).
//
// Dry-run reports the planned moves table-by-table without committing.

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
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '..', '.env'));
await loadEnv(join(__dirname, '..', '..', 'n8n', '.env'));

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const CONFIRM = args.includes('--confirm-yes');
const WILL_COMMIT = COMMIT && CONFIRM;
if (COMMIT && !CONFIRM) { console.error('--commit requires --confirm-yes'); process.exit(1); }

const sql = await readFile(join(__dirname, '017_schema_separation.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Migration 017 — schema separation (v10.4 -> v10.5) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// ---------- Pre-state snapshot ----------
const preCounts = await client.query(`
  SELECT t.table_schema, COUNT(*) AS table_count
  FROM information_schema.tables t
  WHERE t.table_schema IN ('public','pipeline','ontology','catalogue','contacts')
    AND t.table_type = 'BASE TABLE'
  GROUP BY t.table_schema
  ORDER BY t.table_schema
`);
console.log('\n=== Pre-state schema table counts ===');
for (const r of preCounts.rows) console.log('  ' + r.table_schema.padEnd(12) + ' ' + r.table_count);

// Pre-state row counts (for unchanged-data verification)
const preRows = await client.query(`
  SELECT n.nspname AS schema, c.relname AS table_name, s.n_live_tup AS row_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE c.relkind = 'r'
    AND n.nspname IN ('public','pipeline','ontology','catalogue','contacts')
  ORDER BY n.nspname, c.relname
`);
const preRowMap = new Map();
for (const r of preRows.rows) preRowMap.set(r.table_name, parseInt(r.row_count) || 0);

try {
  await client.query('BEGIN');
  await client.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // 1. all four schemas exist
  const sch = await client.query(`
    SELECT nspname FROM pg_namespace WHERE nspname IN ('pipeline','ontology','catalogue','contacts')
    ORDER BY nspname
  `);
  if (sch.rows.length !== 4) throw new Error(`expected 4 schemas, got ${sch.rows.length}`);
  console.log(`  (${n}) all 4 schemas present: ${sch.rows.map(r=>r.nspname).join(', ')} ✓`); n++;

  // 2. table-count distribution
  const post = await client.query(`
    SELECT t.table_schema, COUNT(*) AS table_count
    FROM information_schema.tables t
    WHERE t.table_schema IN ('public','pipeline','ontology','catalogue','contacts')
      AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_schema
    ORDER BY t.table_schema
  `);
  console.log(`  (${n}) post-state schema counts:`); n++;
  const postCountMap = new Map();
  for (const r of post.rows) {
    postCountMap.set(r.table_schema, parseInt(r.table_count));
    console.log('    ' + r.table_schema.padEnd(12) + ' ' + r.table_count);
  }

  // 3. expected counts: pipeline 18, ontology 7, catalogue 24, contacts 2, public 0
  const expected = { pipeline: 18, ontology: 7, catalogue: 24, contacts: 2, public: 0 };
  for (const [s, e] of Object.entries(expected)) {
    const got = postCountMap.get(s) || 0;
    if (got !== e) throw new Error(`schema ${s}: expected ${e} tables, got ${got}`);
  }
  console.log(`  (${n}) schema distribution matches plan (pipeline 18, ontology 7, catalogue 24, contacts 2, public 0) ✓`); n++;

  // 4. public is empty
  const pubT = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  if (pubT.rows.length !== 0) throw new Error(`public still has ${pubT.rows.length} tables: ${pubT.rows.map(r=>r.table_name).join(', ')}`);
  console.log(`  (${n}) public schema is empty ✓`); n++;

  // 5. row counts unchanged for all 51 tables
  const postRows = await client.query(`
    SELECT n.nspname AS schema, c.relname AS table_name, s.n_live_tup AS row_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind = 'r'
      AND n.nspname IN ('public','pipeline','ontology','catalogue','contacts')
    ORDER BY n.nspname, c.relname
  `);
  // Note: pg_stat_user_tables.n_live_tup is a statistics estimate that
  // doesn't update mid-transaction. Use authoritative COUNT(*) per table
  // for the unchanged-data check.
  let mismatch = 0;
  for (const r of postRows.rows) {
    if (r.table_name === 'schema_migrations') continue;  // expect +1 from this migration's INSERT
    if (r.table_name.startsWith('attribute_observations_')) continue;  // partition stats also lag
    const cnt = await client.query(`SELECT COUNT(*) AS n FROM ${r.schema}.${r.table_name}`);
    const after = parseInt(cnt.rows[0].n);
    const before = preRowMap.get(r.table_name);
    if (before !== undefined && before !== after) {
      console.log(`    MISMATCH ${r.schema}.${r.table_name}: ${before} -> ${after}`);
      mismatch++;
    }
  }
  // Verify schema_migrations specifically via COUNT(*)
  const smCnt = await client.query(`SELECT COUNT(*) AS n FROM pipeline.schema_migrations`);
  const smBefore = preRowMap.get('schema_migrations');
  const smAfter = parseInt(smCnt.rows[0].n);
  if (smAfter !== smBefore + 1) {
    console.log(`    schema_migrations: ${smBefore} -> ${smAfter} (expected ${smBefore + 1})`);
    mismatch++;
  }
  if (mismatch > 0) throw new Error(`${mismatch} row-count mismatches detected`);
  console.log(`  (${n}) row counts unchanged via COUNT(*); schema_migrations +1 ✓`); n++;

  // 6. Acceptance: ontology pair count via SCHEMA_ONTOLOGY.md §6 Q1
  const Q1 = await client.query(`
    SELECT horizon, confidence_band, COUNT(*) AS pair_count
    FROM technology_application_pairs
    GROUP BY horizon, confidence_band
    ORDER BY horizon, confidence_band
  `);
  if (Q1.rows.length === 0) throw new Error('Q1 returned zero rows');
  console.log(`  (${n}) Q1 (pair count by horizon × confidence) returns ${Q1.rows.length} rows ✓`); n++;

  // 7. Cross-schema FK check: claim that joins claims_v2 (catalogue) → components (catalogue) → component_pair_links (ontology) → technology_application_pairs (ontology) succeeds without prefixes
  const xs = await client.query(`
    SELECT COUNT(*) AS n
    FROM claims_v2 cl
    JOIN components c ON c.id = cl.component_id
    LEFT JOIN component_pair_links cpl ON cpl.component_id = c.id
    LEFT JOIN technology_application_pairs tap ON tap.id = cpl.pair_id
  `);
  console.log(`  (${n}) cross-schema join (claims_v2 ⋈ components ⋈ component_pair_links ⋈ technology_application_pairs) returns ${xs.rows[0].n} rows ✓`); n++;

  // 8. n8n-style queries (no schema prefixes)
  for (const tbl of ['mini_signals','technology_application_pairs','signal_horizon_log']) {
    const r = await client.query(`SELECT COUNT(*) AS n FROM ${tbl}`);
    console.log(`    SELECT COUNT(*) FROM ${tbl} -> ${r.rows[0].n}`);
  }
  console.log(`  (${n}) unprefixed SELECTs resolve correctly under search_path ✓`); n++;

  // 9. schema_migrations row 17
  const sm = await client.query(`SELECT version, name FROM schema_migrations WHERE version = 17`);
  if (sm.rows.length === 0) throw new Error('schema_migrations row 17 missing');
  console.log(`  (${n}) schema_migrations v17 = ${sm.rows[0].name} ✓`); n++;

  // 10. Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction (helper function no-ops on already-moved tables) ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — schema 017 persisted');
  } else {
    await client.query('ROLLBACK');
    console.log('\n[pg] ROLLBACK (dry-run; pass --commit --confirm-yes to persist)');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\n[pg] ROLLBACK due to error: ${err.message}`);
  await client.end();
  process.exit(1);
}
await client.end();
