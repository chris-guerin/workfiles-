#!/usr/bin/env node
// 012_runner.js — applies db/migrations/012_ontology_layer.sql.
// Schema effect: v9.0 -> v10.0. Additive — no existing v3 tables modified.

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

const sql = await readFile(join(__dirname, '012_ontology_layer.sql'), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log(`=== Migration 012 — ontology layer (v9.0 -> v10.0) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

try {
  await client.query('BEGIN');
  await client.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // 1. all 6 new tables exist
  const expectedTables = [
    'technologies','applications','technology_application_pairs',
    'pair_evidence','pair_adjacencies','component_pair_links',
  ];
  const { rows: tabs } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY($1::text[])
  `, [expectedTables]);
  const got = new Set(tabs.map((r) => r.table_name));
  const missing = expectedTables.filter((t) => !got.has(t));
  if (missing.length) throw new Error(`missing tables: ${missing.join(', ')}`);
  console.log(`  (${n}) all 6 new tables present ✓`); n++;

  // 2. CHECK constraints registered
  const expectedChecks = [
    'technologies_substitution_risk_check',
    'applications_application_domain_check',
    'applications_market_maturity_check',
    'technology_application_pairs_horizon_check',
    'technology_application_pairs_confidence_band_check',
    'technology_application_pairs_trajectory_check',
    'pair_evidence_evidence_type_check',
    'pair_evidence_evidence_strength_check',
    'pair_adjacencies_adjacency_type_check',
    'pair_adjacencies_adjacency_strength_check',
    'component_pair_links_link_role_check',
  ];
  const { rows: chks } = await client.query(`
    SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])
  `, [expectedChecks]);
  const gotChks = new Set(chks.map((r) => r.conname));
  const missingChks = expectedChecks.filter((c) => !gotChks.has(c));
  if (missingChks.length) throw new Error(`missing check constraints: ${missingChks.join(', ')}`);
  console.log(`  (${n}) CHECK constraints registered: ${expectedChecks.length} ✓`); n++;

  // 3. Indexes (sample of named indexes)
  const expectedIdx = [
    'idx_technology_function','idx_technology_trl',
    'idx_application_domain','idx_application_maturity',
    'idx_pair_horizon','idx_pair_confidence','idx_pair_trajectory',
    'idx_pair_flagged','idx_pair_technology','idx_pair_application',
    'idx_pair_evidence_pair','idx_pair_evidence_type','idx_pair_evidence_strength',
    'idx_adjacency_source','idx_adjacency_target','idx_adjacency_type',
    'idx_cpl_component','idx_cpl_pair','idx_cpl_role',
  ];
  const { rows: idxs } = await client.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1::text[])
  `, [expectedIdx]);
  if (idxs.length !== expectedIdx.length) {
    const igot = new Set(idxs.map(r => r.indexname));
    const miss = expectedIdx.filter((i) => !igot.has(i));
    throw new Error(`missing indexes: ${miss.join(', ')}`);
  }
  console.log(`  (${n}) indexes registered: ${expectedIdx.length} ✓`); n++;

  // 4. low-confidence flag enforcement on technology_application_pairs
  console.log('\n  low-confidence flag enforcement:');
  await client.query('SAVEPOINT lc_test');

  // need a tech and an application to FK
  const { rows: techIns } = await client.query(`
    INSERT INTO technologies (technology_name, technology_label, description, source_citation)
    VALUES ('_lc_tech','_lc_tech','test','_test') RETURNING id`);
  const techId = techIns[0].id;
  const { rows: appIns } = await client.query(`
    INSERT INTO applications (application_name, application_label, application_domain, description, source_citation)
    VALUES ('_lc_app','_lc_app','industrial','test','_test') RETURNING id`);
  const appId = appIns[0].id;

  // Sub-test A: confidence_band='low' WITHOUT flag -> reject
  await client.query('SAVEPOINT lc_a');
  let aRejected = false;
  try {
    await client.query(`
      INSERT INTO technology_application_pairs
        (technology_id, application_id, pair_label, horizon, horizon_reasoning,
         confidence_band, confidence_reasoning, trajectory)
      VALUES ($1, $2, '_lc', 'H3', '_test', 'low', '_test', 'unknown')`, [techId, appId]);
  } catch (e) { aRejected = true; }
  await client.query('ROLLBACK TO SAVEPOINT lc_a');
  if (!aRejected) throw new Error('low-confidence test A failed: insert with low confidence WITHOUT flag should reject');
  console.log(`    A. confidence='low' AND is_flagged=FALSE       -> rejected ✓`);

  // Sub-test B: confidence_band='low' WITH flag -> succeed
  await client.query('SAVEPOINT lc_b');
  let bSuccess = false;
  try {
    await client.query(`
      INSERT INTO technology_application_pairs
        (technology_id, application_id, pair_label, horizon, horizon_reasoning,
         confidence_band, confidence_reasoning, trajectory,
         is_flagged_for_review, flag_reason)
      VALUES ($1, $2, '_lc', 'H3', '_test', 'low', '_test', 'unknown', TRUE, '_test')`, [techId, appId]);
    bSuccess = true;
  } catch (e) { console.error('   B exception:', e.message); }
  await client.query('ROLLBACK TO SAVEPOINT lc_b');
  if (!bSuccess) throw new Error('low-confidence test B failed: insert with low conf + flag should succeed');
  console.log(`    B. confidence='low' AND is_flagged=TRUE        -> accepted ✓`);

  // Sub-test C: confidence_band='medium' WITHOUT flag -> succeed
  await client.query('SAVEPOINT lc_c');
  let cSuccess = false;
  try {
    await client.query(`
      INSERT INTO technology_application_pairs
        (technology_id, application_id, pair_label, horizon, horizon_reasoning,
         confidence_band, confidence_reasoning, trajectory)
      VALUES ($1, $2, '_lc', 'H2', '_test', 'medium', '_test', 'holding')`, [techId, appId]);
    cSuccess = true;
  } catch (e) { console.error('   C exception:', e.message); }
  await client.query('ROLLBACK TO SAVEPOINT lc_c');
  if (!cSuccess) throw new Error('low-confidence test C failed: insert with medium conf no flag should succeed');
  console.log(`    C. confidence='medium' AND is_flagged=FALSE    -> accepted ✓`);

  await client.query('ROLLBACK TO SAVEPOINT lc_test');
  console.log(`  (${n}) low-confidence flag enforces correctly (3/3) ✓`); n++;

  // 5. self-adjacency guard
  await client.query('SAVEPOINT sa_test');
  // need two pairs to test, use scratch tech/app
  const { rows: t2 } = await client.query(`
    INSERT INTO technologies (technology_name, technology_label, description, source_citation)
    VALUES ('_sa_tech','_sa_tech','test','_test') RETURNING id`);
  const { rows: a2 } = await client.query(`
    INSERT INTO applications (application_name, application_label, application_domain, description, source_citation)
    VALUES ('_sa_app','_sa_app','industrial','test','_test') RETURNING id`);
  const { rows: p2 } = await client.query(`
    INSERT INTO technology_application_pairs
      (technology_id, application_id, pair_label, horizon, horizon_reasoning,
       confidence_band, confidence_reasoning, trajectory)
    VALUES ($1, $2, '_sa_pair', 'H2', '_test', 'medium', '_test', 'holding')
    RETURNING id`, [t2[0].id, a2[0].id]);
  const pid = p2[0].id;

  let saRejected = false;
  try {
    await client.query(`
      INSERT INTO pair_adjacencies (source_pair_id, target_pair_id, adjacency_type, adjacency_strength, reasoning_text)
      VALUES ($1, $1, 'substitute', 'weak', '_test')`, [pid]);
  } catch (e) { saRejected = true; }
  await client.query('ROLLBACK TO SAVEPOINT sa_test');
  if (!saRejected) throw new Error('self-adjacency guard failed: source=target should reject');
  console.log(`  (${n}) self-adjacency guard rejects source=target ✓`); n++;

  // 6. schema_migrations row 12
  const { rows: sm } = await client.query(`SELECT version, name FROM schema_migrations WHERE version=12`);
  if (sm.length === 0) throw new Error('schema_migrations row 12 missing');
  console.log(`  (${n}) schema_migrations v12 = ${sm[0].name} ✓`); n++;

  // 7. Idempotency
  await client.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg] COMMIT — schema 012 persisted');
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
