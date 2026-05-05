#!/usr/bin/env node
// 015_runner.js — applies db/migrations/015_signal_horizon_log.sql.
// Schema effect: v10.2 -> v10.3.

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

const sql = await readFile(join(__dirname, '015_signal_horizon_log.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Migration 015 — signal_horizon_log (v10.2 -> v10.3) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

try {
  await client.query('BEGIN');
  await client.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // 1. Table exists with expected columns
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='signal_horizon_log'
    ORDER BY ordinal_position
  `);
  if (cols.rows.length === 0) throw new Error('signal_horizon_log table missing');
  const expectedCols = [
    'id','signal_id','signal_title','signal_summary','signal_date','source_url',
    'matched_hypothesis_ids','matched_hypothesis_labels','horizon_classifications',
    'overall_classification','probability_delta','ontology_gap','processed_by_15b','created_at'
  ];
  const got = new Set(cols.rows.map(r => r.column_name));
  const missing = expectedCols.filter(c => !got.has(c));
  if (missing.length) throw new Error(`missing columns: ${missing.join(', ')}`);
  console.log(`  (${n}) table signal_horizon_log present with ${cols.rows.length} columns ✓`); n++;

  // 2. signal_id NOT NULL
  const sigRow = cols.rows.find(r => r.column_name === 'signal_id');
  if (sigRow.is_nullable !== 'NO') throw new Error('signal_id must be NOT NULL');
  console.log(`  (${n}) signal_id NOT NULL ✓`); n++;

  // 3. ontology_gap and processed_by_15b NOT NULL DEFAULT FALSE
  for (const c of ['ontology_gap','processed_by_15b']) {
    const r = cols.rows.find(x => x.column_name === c);
    if (r.is_nullable !== 'NO') throw new Error(`${c} must be NOT NULL`);
    if (!r.column_default || !r.column_default.toLowerCase().startsWith('false')) {
      throw new Error(`${c} default must be FALSE; got ${r.column_default}`);
    }
  }
  console.log(`  (${n}) ontology_gap + processed_by_15b NOT NULL DEFAULT FALSE ✓`); n++;

  // 4. Array columns are TEXT[]
  for (const c of ['matched_hypothesis_ids','matched_hypothesis_labels']) {
    const r = cols.rows.find(x => x.column_name === c);
    if (r.data_type !== 'ARRAY') throw new Error(`${c} should be ARRAY; got ${r.data_type}`);
  }
  console.log(`  (${n}) matched_hypothesis_ids + matched_hypothesis_labels are ARRAY ✓`); n++;

  // 5. horizon_classifications JSONB
  const hcRow = cols.rows.find(r => r.column_name === 'horizon_classifications');
  if (hcRow.data_type !== 'jsonb') throw new Error(`horizon_classifications should be jsonb; got ${hcRow.data_type}`);
  console.log(`  (${n}) horizon_classifications is jsonb ✓`); n++;

  // 6. All 4 indexes registered
  const expectedIdx = [
    'idx_shl_unprocessed','idx_shl_classification','idx_shl_date','idx_shl_horizon'
  ];
  const idxRows = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND indexname = ANY($1::text[])
  `, [expectedIdx]);
  const gotIdx = new Set(idxRows.rows.map(r => r.indexname));
  const missIdx = expectedIdx.filter(i => !gotIdx.has(i));
  if (missIdx.length) throw new Error(`missing indexes: ${missIdx.join(', ')}`);
  console.log(`  (${n}) all 4 indexes registered ✓`); n++;

  // 7. Insert/select sanity test (savepoint rollback)
  await client.query('SAVEPOINT ins_test');
  await client.query(`
    INSERT INTO signal_horizon_log
      (signal_id, signal_title, signal_summary, signal_date, source_url,
       matched_hypothesis_ids, matched_hypothesis_labels, horizon_classifications,
       overall_classification, probability_delta, ontology_gap)
    VALUES
      ('_test_signal_001', 'Test signal', 'Summary', '2026-05-05', 'https://example.com/x',
       ARRAY['SHELL_006','SHELL_010']::text[],
       ARRAY['CCUS leadership','Blue H2 retention']::text[],
       '[{"hypothesis_id":"SHELL_006","horizon":"H2"}]'::jsonb,
       'ACT', 0.05, FALSE)
  `);
  const sel = await client.query(`
    SELECT signal_id, matched_hypothesis_ids, horizon_classifications, processed_by_15b
    FROM signal_horizon_log WHERE signal_id = '_test_signal_001'
  `);
  if (sel.rows.length !== 1) throw new Error('insert sanity test: row not found');
  const row = sel.rows[0];
  if (!Array.isArray(row.matched_hypothesis_ids) || row.matched_hypothesis_ids.length !== 2) {
    throw new Error('matched_hypothesis_ids did not round-trip as array');
  }
  if (typeof row.horizon_classifications !== 'object') {
    throw new Error('horizon_classifications did not round-trip as JSON');
  }
  if (row.processed_by_15b !== false) {
    throw new Error('processed_by_15b default did not apply');
  }
  console.log(`  (${n}) insert/select round-trips arrays + jsonb correctly; default processed_by_15b=FALSE ✓`); n++;
  await client.query('ROLLBACK TO SAVEPOINT ins_test');

  // 8. Partial-index targeting (idx_shl_unprocessed) — exists with WHERE clause
  const idxDef = await client.query(`
    SELECT indexdef FROM pg_indexes WHERE indexname='idx_shl_unprocessed'
  `);
  if (!idxDef.rows[0].indexdef.toLowerCase().includes('where')) {
    throw new Error('idx_shl_unprocessed missing WHERE clause');
  }
  console.log(`  (${n}) idx_shl_unprocessed is partial (WHERE processed_by_15b = FALSE) ✓`); n++;

  // 9. GIN index on horizon_classifications
  const ginDef = await client.query(`
    SELECT indexdef FROM pg_indexes WHERE indexname='idx_shl_horizon'
  `);
  if (!ginDef.rows[0].indexdef.toLowerCase().includes('gin')) {
    throw new Error('idx_shl_horizon should be GIN');
  }
  console.log(`  (${n}) idx_shl_horizon is GIN ✓`); n++;

  // 10. schema_migrations row 15
  const sm = await client.query(`SELECT version, name FROM schema_migrations WHERE version=15`);
  if (sm.rows.length === 0) throw new Error('schema_migrations row 15 missing');
  console.log(`  (${n}) schema_migrations v15 = ${sm.rows[0].name} ✓`); n++;

  // 11. Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — schema 015 persisted');
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
