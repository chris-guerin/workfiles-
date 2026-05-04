#!/usr/bin/env node
// 013_runner.js — applies db/migrations/013_hard_evidence_count.sql.
// Schema effect: v10.0 -> v10.1. Additive (column + trigger + back-fill).

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

const sql = await readFile(join(__dirname, '013_hard_evidence_count.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Migration 013 — hard_evidence_count (v10.0 -> v10.1) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

try {
  await client.query('BEGIN');
  await client.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // 1. column exists
  const col = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name='technology_application_pairs' AND column_name='hard_evidence_count'
  `);
  if (col.rows.length === 0) throw new Error('hard_evidence_count column missing');
  if (col.rows[0].is_nullable !== 'NO') throw new Error('hard_evidence_count must be NOT NULL');
  console.log(`  (${n}) column hard_evidence_count present (NOT NULL, default ${col.rows[0].column_default}) ✓`); n++;

  // 2. trigger exists
  const trg = await client.query(`SELECT tgname FROM pg_trigger WHERE tgname='trg_pair_evidence_after_ins_upd_del'`);
  if (trg.rows.length === 0) throw new Error('trigger missing');
  console.log(`  (${n}) trigger trg_pair_evidence_after_ins_upd_del registered ✓`); n++;

  // 3. function exists
  const fn = await client.query(`SELECT proname FROM pg_proc WHERE proname='recompute_pair_hard_evidence_count'`);
  if (fn.rows.length === 0) throw new Error('function missing');
  console.log(`  (${n}) function recompute_pair_hard_evidence_count present ✓`); n++;

  // 4. index exists
  const idx = await client.query(`SELECT indexname FROM pg_indexes WHERE indexname='idx_pair_hard_evidence_count'`);
  if (idx.rows.length === 0) throw new Error('index missing');
  console.log(`  (${n}) index idx_pair_hard_evidence_count registered ✓`); n++;

  // 5. back-fill produced sensible values
  const stats = await client.query(`
    SELECT
      COUNT(*) AS total_pairs,
      SUM(hard_evidence_count) AS total_hard_count,
      AVG(hard_evidence_count)::numeric(10,2) AS avg_hard_count,
      MAX(hard_evidence_count) AS max_hard_count
    FROM technology_application_pairs
  `);
  const s = stats.rows[0];
  console.log(`  (${n}) back-fill: ${s.total_pairs} pairs, total ${s.total_hard_count} hard rows (avg ${s.avg_hard_count}, max ${s.max_hard_count}) ✓`); n++;

  // Verify back-fill against direct count (sanity)
  const cross = await client.query(`
    SELECT tap.id, tap.hard_evidence_count,
           (SELECT COUNT(*) FROM pair_evidence pe
            WHERE pe.pair_id = tap.id
              AND (pe.evidence_type IN ('peer_reviewed','company_filing','government_data')
                   OR (pe.evidence_type='operator_disclosure' AND pe.evidence_strength='high'))) AS direct_count
    FROM technology_application_pairs tap
  `);
  for (const r of cross.rows) {
    if (parseInt(r.hard_evidence_count) !== parseInt(r.direct_count)) {
      throw new Error(`back-fill mismatch on pair ${r.id}: stored=${r.hard_evidence_count}, direct=${r.direct_count}`);
    }
  }
  console.log(`  (${n}) back-fill matches direct count for all ${cross.rows.length} pairs ✓`); n++;

  // 6. Trigger functional test: insert a pair_evidence row, observe count change
  await client.query('SAVEPOINT trg_test');
  // Pick first pair
  const pickPair = await client.query(`SELECT id, hard_evidence_count FROM technology_application_pairs LIMIT 1`);
  const targetPid = pickPair.rows[0].id;
  const before = parseInt(pickPair.rows[0].hard_evidence_count);

  // Add a hard-evidence row
  await client.query(`
    INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text, source_citation, source_url)
    VALUES ($1, 'government_data', 'high', '_trg_test', '_trg_test', 'https://example.com')
  `, [targetPid]);
  const afterIns = await client.query(`SELECT hard_evidence_count FROM technology_application_pairs WHERE id=$1`, [targetPid]);
  const insVal = parseInt(afterIns.rows[0].hard_evidence_count);
  if (insVal !== before + 1) throw new Error(`trigger INSERT didn't increment: before=${before}, after=${insVal}`);

  // Add a soft-evidence row (industry_body — should NOT increment hard count)
  await client.query(`
    INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text, source_citation, source_url)
    VALUES ($1, 'industry_body', 'high', '_trg_test_soft', '_trg_test_soft', 'https://example.com')
  `, [targetPid]);
  const afterSoft = await client.query(`SELECT hard_evidence_count FROM technology_application_pairs WHERE id=$1`, [targetPid]);
  const softVal = parseInt(afterSoft.rows[0].hard_evidence_count);
  if (softVal !== insVal) throw new Error(`trigger added industry_body to hard count: ${insVal} -> ${softVal}`);

  // Add an operator_disclosure at evidence_strength='medium' — should NOT increment
  await client.query(`
    INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text, source_citation, source_url)
    VALUES ($1, 'operator_disclosure', 'medium', '_trg_test_op_med', '_trg_test_op_med', 'https://example.com')
  `, [targetPid]);
  const afterOpMed = await client.query(`SELECT hard_evidence_count FROM technology_application_pairs WHERE id=$1`, [targetPid]);
  const opMedVal = parseInt(afterOpMed.rows[0].hard_evidence_count);
  if (opMedVal !== softVal) throw new Error(`trigger counted operator_disclosure/medium as hard: ${softVal} -> ${opMedVal}`);

  // Add an operator_disclosure at evidence_strength='high' — SHOULD increment
  await client.query(`
    INSERT INTO pair_evidence (pair_id, evidence_type, evidence_strength, evidence_text, source_citation, source_url)
    VALUES ($1, 'operator_disclosure', 'high', '_trg_test_op_high', '_trg_test_op_high', 'https://example.com')
  `, [targetPid]);
  const afterOpHi = await client.query(`SELECT hard_evidence_count FROM technology_application_pairs WHERE id=$1`, [targetPid]);
  const opHiVal = parseInt(afterOpHi.rows[0].hard_evidence_count);
  if (opHiVal !== opMedVal + 1) throw new Error(`trigger missed operator_disclosure/high: ${opMedVal} -> ${opHiVal}`);

  // Roll back the test rows
  await client.query('ROLLBACK TO SAVEPOINT trg_test');
  // Verify count restored
  const afterRb = await client.query(`SELECT hard_evidence_count FROM technology_application_pairs WHERE id=$1`, [targetPid]);
  if (parseInt(afterRb.rows[0].hard_evidence_count) !== before) {
    throw new Error(`savepoint rollback didn't restore count: before=${before}, after=${afterRb.rows[0].hard_evidence_count}`);
  }
  console.log(`  (${n}) trigger functional test: government_data adds hard, industry_body does not, operator_disclosure/medium does not, operator_disclosure/high adds hard, savepoint rollback restores ✓`); n++;

  // 7. schema_migrations row 13
  const sm = await client.query(`SELECT version, name FROM schema_migrations WHERE version=13`);
  if (sm.rows.length === 0) throw new Error('schema_migrations row 13 missing');
  console.log(`  (${n}) schema_migrations v13 = ${sm.rows[0].name} ✓`); n++;

  // 8. Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — schema 013 persisted');
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
