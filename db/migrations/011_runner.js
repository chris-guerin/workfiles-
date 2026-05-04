#!/usr/bin/env node
// 011_runner.js — applies db/migrations/011_soft_data_layer.sql.
// Schema effect: v8.1 -> v9.0. Additive.

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

const sql = await readFile(join(__dirname, '011_soft_data_layer.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Migration 011 — soft data layer (v8.1 -> v9.0) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

try {
  await client.query('BEGIN');
  await client.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // 1. 8 new tables exist
  const expectedTables = [
    'initiative_assumptions','strategic_tensions','tension_affected_initiatives',
    'tension_affected_components','tension_evidence','reframings',
    'reframing_evidence','signal_soft_impacts',
  ];
  const { rows: tabs } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY($1::text[])
  `, [expectedTables]);
  const got = new Set(tabs.map((r) => r.table_name));
  const missing = expectedTables.filter((t) => !got.has(t));
  if (missing.length) throw new Error(`missing tables: ${missing.join(', ')}`);
  console.log(`  (${n}) all 8 new tables present ✓`); n++;

  // 2. mini_signals_v3 +4 columns
  const expectedCols = ['soft_signal_type','soft_signal_subject','soft_signal_direction','soft_signal_reasoning'];
  const { rows: cols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mini_signals_v3' AND column_name = ANY($1::text[])
  `, [expectedCols]);
  if (cols.length !== expectedCols.length) throw new Error(`mini_signals_v3 missing soft columns; got ${cols.length}/${expectedCols.length}`);
  console.log(`  (${n}) mini_signals_v3 +4 soft columns ✓`); n++;

  // 3. CHECK constraints
  const expectedChecks = [
    'mini_signals_v3_soft_signal_type_check',
    'mini_signals_v3_soft_signal_direction_check',
    'signal_soft_impacts_xor',
  ];
  const { rows: chks } = await client.query(`
    SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])
  `, [expectedChecks]);
  const gotChks = new Set(chks.map((r) => r.conname));
  const missingChks = expectedChecks.filter((c) => !gotChks.has(c));
  if (missingChks.length) throw new Error(`missing check constraints: ${missingChks.join(', ')}`);
  console.log(`  (${n}) CHECK constraints registered: ${expectedChecks.length} ✓`); n++;

  // 4. Indexes (sample of named indexes from spec)
  const expectedIdx = [
    'idx_minisignal_soft_type','idx_assumption_initiative','idx_assumption_status',
    'idx_assumption_horizon','idx_assumption_role','idx_tension_status',
    'idx_tension_type','idx_tension_horizon','idx_tension_company',
    'idx_tension_evidence_signal','idx_reframing_subject','idx_reframing_status',
    'idx_reframing_evidence_signal','idx_soft_impact_signal','idx_soft_impact_assumption',
    'idx_soft_impact_tension','idx_soft_impact_reframing','idx_soft_impact_material',
  ];
  const { rows: idxs } = await client.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1::text[])
  `, [expectedIdx]);
  if (idxs.length !== expectedIdx.length) {
    const got = new Set(idxs.map(r => r.indexname));
    const miss = expectedIdx.filter((i) => !got.has(i));
    throw new Error(`missing indexes: ${miss.join(', ')}`);
  }
  console.log(`  (${n}) indexes registered: ${expectedIdx.length} ✓`); n++;

  // 5. XOR test on signal_soft_impacts
  // Need a mini_signal to FK to. Insert a temp signal, then test XOR variants.
  console.log('\n  XOR check on signal_soft_impacts:');
  await client.query('SAVEPOINT xor_test');

  const { rows: msIns } = await client.query(`
    INSERT INTO mini_signals_v3 (signal_text, signal_type, extracted_at, extraction_model)
    VALUES ('_xor_test', 'other', NOW(), '_xor_test')
    RETURNING id`);
  const msId = msIns[0].id;

  // Need a real assumption to have a valid id (temp)
  const { rows: initRow } = await client.query(`SELECT id FROM initiatives_v2 LIMIT 1`);
  const initId = initRow[0]?.id;
  let assId = null;
  if (initId) {
    const r = await client.query(`
      INSERT INTO initiative_assumptions (initiative_id, assumption_text, assumption_role, horizon, contradiction_mechanism)
      VALUES ($1, '_xor_test_assumption', 'supports', 'H1', '_test') RETURNING id`, [initId]);
    assId = r.rows[0].id;
  }

  // Sub-test A: assumption + tension both set -> reject
  await client.query('SAVEPOINT a');
  let aRejected = false;
  try {
    await client.query(`
      INSERT INTO signal_soft_impacts (mini_signal_id, impact_type, assumption_id, tension_id, impact_direction, reasoning_text)
      VALUES ($1, 'assumption', $2, 999999, 'reinforces', '_test')`, [msId, assId]);
  } catch (e) { aRejected = true; }
  await client.query('ROLLBACK TO SAVEPOINT a');
  if (!aRejected) throw new Error('XOR test A failed: insert with both assumption_id AND tension_id should reject');
  console.log(`    A. both assumption_id AND tension_id set       -> rejected ✓`);

  // Sub-test B: exactly one (assumption) -> succeed
  await client.query('SAVEPOINT b');
  let bSuccess = false;
  try {
    await client.query(`
      INSERT INTO signal_soft_impacts (mini_signal_id, impact_type, assumption_id, impact_direction, reasoning_text)
      VALUES ($1, 'assumption', $2, 'reinforces', '_test')`, [msId, assId]);
    bSuccess = true;
  } catch (e) { console.error('   B exception:', e.message); }
  await client.query('ROLLBACK TO SAVEPOINT b');
  if (!bSuccess) throw new Error('XOR test B failed: insert with exactly one (assumption_id) should succeed');
  console.log(`    B. exactly one (assumption_id) set             -> accepted ✓`);

  // Sub-test C: none set -> reject
  await client.query('SAVEPOINT c');
  let cRejected = false;
  try {
    await client.query(`
      INSERT INTO signal_soft_impacts (mini_signal_id, impact_type, impact_direction, reasoning_text)
      VALUES ($1, 'assumption', 'reinforces', '_test')`, [msId]);
  } catch (e) { cRejected = true; }
  await client.query('ROLLBACK TO SAVEPOINT c');
  if (!cRejected) throw new Error('XOR test C failed: insert with none of (assumption_id, tension_id, reframing_id) should reject');
  console.log(`    C. all three NULL                              -> rejected ✓`);

  // Cleanup the _xor_test rows (rollback to savepoint)
  await client.query('ROLLBACK TO SAVEPOINT xor_test');
  console.log(`  (${n}) XOR check enforces correctly (3/3 sub-tests) ✓`); n++;

  // 6. schema_migrations row 11
  const { rows: sm } = await client.query(`SELECT version, name FROM schema_migrations WHERE version=11`);
  if (sm.length === 0) throw new Error('schema_migrations row 11 missing');
  console.log(`  (${n}) schema_migrations v11 = ${sm[0].name} ✓`); n++;

  // 7. Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — schema 011 persisted');
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
