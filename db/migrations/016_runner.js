#!/usr/bin/env node
// 016_runner.js — applies db/migrations/016_mini_signals.sql.
// Schema effect: v10.3 -> v10.4.

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

const sql = await readFile(join(__dirname, '016_mini_signals.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Migration 016 — mini_signals (v10.3 -> v10.4) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

try {
  await client.query('BEGIN');
  await client.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // 1. Table exists with all expected columns
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mini_signals'
    ORDER BY ordinal_position
  `);
  if (cols.rows.length === 0) throw new Error('mini_signals table missing');
  const expectedCols = [
    'id','signal_id','extracted_at','published_date','source','source_type','url',
    'headline','companies','technologies','geography','event_type',
    'value_chain_position','short_summary','evidence_snippet','extraction_model','created_at'
  ];
  const got = new Set(cols.rows.map(r => r.column_name));
  const missing = expectedCols.filter(c => !got.has(c));
  if (missing.length) throw new Error(`missing columns: ${missing.join(', ')}`);
  console.log(`  (${n}) table mini_signals present with ${cols.rows.length} columns ✓`); n++;

  // 2. signal_id NOT NULL
  const sigRow = cols.rows.find(r => r.column_name === 'signal_id');
  if (sigRow.is_nullable !== 'NO') throw new Error('signal_id must be NOT NULL');
  console.log(`  (${n}) signal_id NOT NULL ✓`); n++;

  // 3. extracted_at NOT NULL DEFAULT CURRENT_DATE
  const eaRow = cols.rows.find(r => r.column_name === 'extracted_at');
  if (eaRow.is_nullable !== 'NO') throw new Error('extracted_at must be NOT NULL');
  if (!eaRow.column_default || !eaRow.column_default.toUpperCase().includes('CURRENT_DATE')) {
    throw new Error(`extracted_at default must be CURRENT_DATE; got ${eaRow.column_default}`);
  }
  console.log(`  (${n}) extracted_at NOT NULL DEFAULT CURRENT_DATE ✓`); n++;

  // 4. Indexes registered
  const expectedIdx = ['idx_ms_extracted','idx_ms_signal_id'];
  const idxRows = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND indexname = ANY($1::text[])
  `, [expectedIdx]);
  if (idxRows.rows.length !== expectedIdx.length) {
    const gotIdx = new Set(idxRows.rows.map(r => r.indexname));
    const miss = expectedIdx.filter(i => !gotIdx.has(i));
    throw new Error(`missing indexes: ${miss.join(', ')}`);
  }
  console.log(`  (${n}) indexes registered: ${expectedIdx.length} ✓`); n++;

  // 5. Insert/select sanity (savepoint rollback)
  await client.query('SAVEPOINT ins_test');
  await client.query(`
    INSERT INTO mini_signals
      (signal_id, extracted_at, published_date, source, source_type, url,
       headline, companies, technologies, geography, event_type,
       value_chain_position, short_summary, evidence_snippet, extraction_model)
    VALUES
      ('_test_ms_001', '2026-05-05', '2026-05-04', 'reuters', 'news', 'https://example.com/x',
       'Test headline','Shell, BP','SMR, ATR','UK','REGULATORY','UPSTREAM',
       'Test summary.','Key phrase.','claude-haiku-4-5-20251001')
  `);
  const sel = await client.query(`SELECT * FROM mini_signals WHERE signal_id = '_test_ms_001'`);
  if (sel.rows.length !== 1) throw new Error('insert sanity test: row not found');
  if (sel.rows[0].headline !== 'Test headline') throw new Error('headline did not round-trip');
  if (sel.rows[0].extraction_model !== 'claude-haiku-4-5-20251001') throw new Error('extraction_model did not round-trip');
  console.log(`  (${n}) insert/select round-trips correctly ✓`); n++;
  await client.query('ROLLBACK TO SAVEPOINT ins_test');

  // 6. extracted_at default fires as PG's CURRENT_DATE
  await client.query('SAVEPOINT def_test');
  await client.query(`
    INSERT INTO mini_signals (signal_id, headline)
    VALUES ('_test_default_001', 'default test')
  `);
  const def = await client.query(`
    SELECT extracted_at = CURRENT_DATE AS matches, extracted_at, CURRENT_DATE AS server_today
    FROM mini_signals WHERE signal_id = '_test_default_001'
  `);
  if (!def.rows[0].matches) {
    throw new Error(`extracted_at default mismatch vs PG CURRENT_DATE: row=${def.rows[0].extracted_at}, server_today=${def.rows[0].server_today}`);
  }
  console.log(`  (${n}) extracted_at default = PG CURRENT_DATE (${def.rows[0].server_today.toISOString().slice(0,10)}) ✓`); n++;
  await client.query('ROLLBACK TO SAVEPOINT def_test');

  // 7. schema_migrations row 16
  const sm = await client.query(`SELECT version, name FROM schema_migrations WHERE version=16`);
  if (sm.rows.length === 0) throw new Error('schema_migrations row 16 missing');
  console.log(`  (${n}) schema_migrations v16 = ${sm.rows[0].name} ✓`); n++;

  // 8. signals.source_mini_signal_id FK is gone (dropped by CASCADE)
  const fkCheck = await client.query(`
    SELECT tc.constraint_name FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'mini_signals'
  `);
  if (fkCheck.rows.length !== 0) {
    throw new Error(`unexpected FKs pointing at mini_signals after CREATE: ${fkCheck.rows.map(r => r.constraint_name).join(', ')}`);
  }
  console.log(`  (${n}) no FKs point at mini_signals (legacy signals.source_mini_signal_id FK dropped by CASCADE) ✓`); n++;

  // 9. Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — schema 016 persisted');
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
