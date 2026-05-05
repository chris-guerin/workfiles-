#!/usr/bin/env node
// 014_runner.js — applies db/migrations/014_cross_client_edge.sql.
// Schema effect: v10.1 -> v10.2.

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

const sql = await readFile(join(__dirname, '014_cross_client_edge.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Migration 014 — cross_client_edge (v10.1 -> v10.2) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

try {
  await client.query('BEGIN');
  await client.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // 1. column exists, NOT NULL, default FALSE
  const col = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name='pair_adjacencies' AND column_name='is_cross_client_edge'
  `);
  if (col.rows.length === 0) throw new Error('is_cross_client_edge column missing');
  if (col.rows[0].is_nullable !== 'NO') throw new Error('column must be NOT NULL');
  console.log(`  (${n}) column is_cross_client_edge present (NOT NULL, default ${col.rows[0].column_default}) ✓`); n++;

  // 2. helper + 2 trigger functions exist
  const fns = await client.query(`SELECT proname FROM pg_proc WHERE proname IN
    ('compute_adjacency_cross_client','recompute_adjacency_cross_client_self','recompute_adjacency_cross_client_on_link_change')`);
  if (fns.rows.length !== 3) throw new Error(`expected 3 functions, got ${fns.rows.length}`);
  console.log(`  (${n}) 3 functions present (compute helper + 2 trigger functions) ✓`); n++;

  // 3. 2 triggers registered
  const trgs = await client.query(`SELECT tgname FROM pg_trigger WHERE tgname IN
    ('trg_pair_adjacency_before_ins_upd','trg_cpl_after_ins_upd_del_recompute_adj')`);
  if (trgs.rows.length !== 2) throw new Error(`expected 2 triggers, got ${trgs.rows.length}`);
  console.log(`  (${n}) 2 triggers registered ✓`); n++;

  // 4. partial index on TRUE
  const idx = await client.query(`SELECT indexname FROM pg_indexes WHERE indexname='idx_adjacency_cross_client'`);
  if (idx.rows.length === 0) throw new Error('idx_adjacency_cross_client missing');
  console.log(`  (${n}) idx_adjacency_cross_client partial index registered ✓`); n++;

  // 5. Back-fill produced sensible values + report counts
  const stats = await client.query(`
    SELECT
      COUNT(*) AS total_adj,
      COUNT(*) FILTER (WHERE is_cross_client_edge = TRUE) AS cross_client_count,
      COUNT(*) FILTER (WHERE is_cross_client_edge = FALSE) AS non_cross_client_count
    FROM pair_adjacencies
  `);
  const s = stats.rows[0];
  console.log(`  (${n}) back-fill: ${s.total_adj} adjacency rows total | TRUE=${s.cross_client_count} | FALSE=${s.non_cross_client_count} ✓`); n++;

  // 6. Verify back-fill against direct compute (sanity check sample)
  const direct = await client.query(`
    SELECT COUNT(*) AS n FROM pair_adjacencies pa
    WHERE pa.is_cross_client_edge != compute_adjacency_cross_client(pa.source_pair_id, pa.target_pair_id)
  `);
  if (parseInt(direct.rows[0].n) !== 0) {
    throw new Error(`back-fill mismatch: ${direct.rows[0].n} rows where stored != computed`);
  }
  console.log(`  (${n}) back-fill matches compute_adjacency_cross_client for all rows ✓`); n++;

  // 7. Trigger functional tests
  await client.query('SAVEPOINT trg_test');

  // Set up: pick a pair touched by Shell only and a pair touched by Vattenfall only.
  // Then add an adjacency between them — should set is_cross_client_edge=TRUE.
  // Find Shell-only pair: SAF EU mandate compliance pair
  const shellPair = await client.query(`
    SELECT tap.id FROM technology_application_pairs tap
    WHERE tap.pair_label = 'HEFA hydroprocessing × EU SAF mandate compliance'
  `);
  const vatPair = await client.query(`
    SELECT tap.id FROM technology_application_pairs tap
    WHERE tap.pair_label = 'Fixed-bottom offshore wind × utility-scale power generation'
  `);
  // Verify these two are touched by different companies
  const shellCo = await client.query(`
    SELECT array_agg(DISTINCT co.name ORDER BY co.name) AS companies
    FROM component_pair_links cpl
    JOIN components c ON c.id = cpl.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN companies co ON co.id = i.company_id
    WHERE cpl.pair_id = $1
  `, [shellPair.rows[0].id]);
  const vatCo = await client.query(`
    SELECT array_agg(DISTINCT co.name ORDER BY co.name) AS companies
    FROM component_pair_links cpl
    JOIN components c ON c.id = cpl.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN companies co ON co.id = i.company_id
    WHERE cpl.pair_id = $1
  `, [vatPair.rows[0].id]);
  console.log(`     test pair A: HEFA × EU SAF mandate -> ${JSON.stringify(shellCo.rows[0].companies)}`);
  console.log(`     test pair B: Fixed-bottom × utility-scale -> ${JSON.stringify(vatCo.rows[0].companies)}`);

  // Insert adjacency — BEFORE trigger should set is_cross_client_edge=TRUE
  const ins = await client.query(`
    INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type, adjacency_strength, reasoning_text)
    VALUES ($1, $2, 'substitute', 'weak', '_trigger_test')
    RETURNING is_cross_client_edge
  `, [shellPair.rows[0].id, vatPair.rows[0].id]);
  if (ins.rows[0].is_cross_client_edge !== true) {
    throw new Error(`trigger didn't set TRUE for cross-client adjacency; got ${ins.rows[0].is_cross_client_edge}`);
  }
  console.log(`  (${n}) BEFORE INSERT trigger sets is_cross_client_edge=TRUE for cross-client adjacency ✓`); n++;

  // Test: same-client adjacency should be FALSE
  // Find two pairs touched by Shell only (e.g. SAF pairs)
  const shell2Pair = await client.query(`
    SELECT tap.id FROM technology_application_pairs tap
    WHERE tap.pair_label = 'HEFA hydroprocessing × voluntary SAF offtake'
  `);
  const ins2 = await client.query(`
    INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type, adjacency_strength, reasoning_text)
    VALUES ($1, $2, 'subscale_to_scale', 'weak', '_trigger_test_same_client')
    RETURNING is_cross_client_edge
  `, [shellPair.rows[0].id, shell2Pair.rows[0].id]);
  if (ins2.rows[0].is_cross_client_edge !== false) {
    throw new Error(`trigger set TRUE for same-client adjacency; expected FALSE, got ${ins2.rows[0].is_cross_client_edge}`);
  }
  console.log(`  (${n}) BEFORE INSERT trigger sets is_cross_client_edge=FALSE for same-client adjacency ✓`); n++;

  // Test: component_pair_links INSERT trigger retroactively flips a same-client edge to cross-client
  // Take the HEFA × voluntary edge (Shell only). Link a non-Shell company's component to one of those
  // pairs; the existing adjacency should flip to TRUE.
  // We need a non-Shell component to link. Take a Vattenfall component.
  const vatComp = await client.query(`
    SELECT c.id FROM components c
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN companies co ON co.id = i.company_id
    WHERE co.name = 'Vattenfall AB' LIMIT 1
  `);
  // Insert a (Vattenfall component → HEFA × voluntary SAF) link
  await client.query(`
    INSERT INTO component_pair_links (component_id, pair_id, link_role, reasoning_text, source_citation)
    VALUES ($1, $2, 'exposure_only', '_trigger_test_link', '_trigger_test_link')
  `, [vatComp.rows[0].id, shell2Pair.rows[0].id]);
  // Now the (HEFA × EU SAF) ↔ (HEFA × voluntary SAF) adjacency should have flipped to TRUE
  // because the second pair is now touched by Vattenfall as well as Shell.
  const flip = await client.query(`
    SELECT is_cross_client_edge FROM pair_adjacencies
    WHERE source_pair_id = $1 AND target_pair_id = $2 AND adjacency_type = 'subscale_to_scale'
  `, [shellPair.rows[0].id, shell2Pair.rows[0].id]);
  if (flip.rows[0].is_cross_client_edge !== true) {
    throw new Error(`AFTER INSERT trigger on component_pair_links did not flip same-client adjacency to cross-client; got ${flip.rows[0].is_cross_client_edge}`);
  }
  console.log(`  (${n}) AFTER INSERT trigger on component_pair_links retroactively flips same-client adjacency to cross-client ✓`); n++;

  await client.query('ROLLBACK TO SAVEPOINT trg_test');
  // Verify rollback restored
  const restoreCheck = await client.query(`
    SELECT COUNT(*) AS n FROM pair_adjacencies
    WHERE reasoning_text IN ('_trigger_test','_trigger_test_same_client')
  `);
  if (parseInt(restoreCheck.rows[0].n) !== 0) {
    throw new Error(`savepoint rollback didn't clean test rows`);
  }
  console.log(`  (${n}) savepoint rollback restored state ✓`); n++;

  // 8. schema_migrations row 14
  const sm = await client.query(`SELECT version, name FROM schema_migrations WHERE version=14`);
  if (sm.rows.length === 0) throw new Error('schema_migrations row 14 missing');
  console.log(`  (${n}) schema_migrations v14 = ${sm.rows[0].name} ✓`); n++;

  // 9. Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);
  console.log(`\nBack-fill outcome: ${stats.rows[0].cross_client_count} of ${stats.rows[0].total_adj} adjacency rows flagged is_cross_client_edge=TRUE`);

  // Show the cross-client edges
  const ce = await client.query(`
    SELECT src.pair_label AS source_pair, tgt.pair_label AS target_pair,
           pa.adjacency_type, pa.adjacency_strength
    FROM pair_adjacencies pa
    JOIN technology_application_pairs src ON src.id = pa.source_pair_id
    JOIN technology_application_pairs tgt ON tgt.id = pa.target_pair_id
    WHERE pa.is_cross_client_edge = TRUE
    ORDER BY src.pair_label, tgt.pair_label, pa.adjacency_type
  `);
  console.log(`\nCross-client edges (${ce.rows.length}):`);
  for (const r of ce.rows) console.log(`  [${r.adjacency_type}/${r.adjacency_strength}] ${r.source_pair} -> ${r.target_pair}`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — schema 014 persisted');
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
