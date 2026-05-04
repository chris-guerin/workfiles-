#!/usr/bin/env node
// 008_phase2_runner.js — applies the value-type-contract trigger and
// runs an end-to-end test (creates _TRIGGER_TEST rows, exercises both
// the violation and conformant paths, deletes test rows).
//
// Usage:
//   node 008_phase2_runner.js --commit --confirm-yes

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
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
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
if (COMMIT && !CONFIRM) {
  console.error('--commit was passed without --confirm-yes. Aborting.');
  process.exit(1);
}

const SQL_PATH = join(__dirname, '008_phase2_contract.sql');
const sql = await readFile(SQL_PATH, 'utf8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log('=== Migration 008 Phase 2 — value-type contract trigger ===');
console.log(`Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
console.log('[pg]    connected, BEGIN');

await client.query('BEGIN');

try {
  await client.query(sql);
  console.log('[pg]    trigger SQL applied');

  // Verification
  const { rows: tg } = await client.query(`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE trigger_schema='public' AND trigger_name='tr_enforce_value_type_contract'
  `);
  if (tg.length < 1) throw new Error('trigger not registered');
  console.log(`  trigger registered: ${tg.length} event(s) (BEFORE INSERT + BEFORE UPDATE)`);

  // ===== End-to-end test =====
  console.log('\n=== End-to-end trigger test ===');

  // Create test fixtures (use SAVEPOINT so we can clean up if anything fails mid-test)
  await client.query('SAVEPOINT trigger_test');

  let companyId, initId, compId, trlAttrId;
  try {
    const r1 = await client.query(`INSERT INTO companies (name, sector) VALUES ('_TRIGGER_TEST','energy') RETURNING id`);
    companyId = r1.rows[0].id;

    const r2 = await client.query(`INSERT INTO initiatives_v2 (company_id, name) VALUES ($1, '_trigger_test_init') RETURNING id`, [companyId]);
    initId = r2.rows[0].id;

    const r3 = await client.query(`
      INSERT INTO components (initiative_id, name, component_type, vector, source_citation)
      VALUES ($1, '_trigger_test_comp', 'tech', 'tech', '_trigger_test') RETURNING id
    `, [initId]);
    compId = r3.rows[0].id;

    const { rows: ar } = await client.query(`SELECT count(*)::int AS n FROM component_attributes WHERE component_id = $1`, [compId]);
    if (ar[0].n !== 13) throw new Error(`expected 13 pending attrs, got ${ar[0].n}`);
    console.log(`  created _TRIGGER_TEST company/init/comp; 13 pending attrs auto-created by 006 trigger`);

    // Find the trl attribute (numeric value_type)
    const { rows: trl } = await client.query(`
      SELECT ad.id, ad.value_type, ca.id AS ca_id
      FROM attribute_definitions ad
      JOIN component_attributes ca ON ca.attribute_def_id = ad.id AND ca.component_id = $1
      WHERE ad.attribute_name = 'trl'
    `, [compId]);
    if (trl.length === 0) throw new Error('trl attribute_def not found on test component');
    trlAttrId = trl[0].id;
    const trlCaId = trl[0].ca_id;
    const trlValueType = trl[0].value_type;
    console.log(`  trl attribute_def value_type=${trlValueType}, target row ca_id=${trlCaId}`);

    // VIOLATION TEST: try to set value_status='populated' WITHOUT value_numeric
    console.log('\n  [violation] UPDATE trl row to populated WITHOUT value_numeric — expect EXCEPTION');
    let violationCaught = false, violationMessage = null;
    await client.query('SAVEPOINT v1');
    try {
      await client.query(`
        UPDATE component_attributes
        SET value_status='populated', source_citation='_test', confidence_band='medium'
        WHERE id = $1
      `, [trlCaId]);
    } catch (e) {
      violationCaught = true;
      violationMessage = e.message;
    }
    await client.query('ROLLBACK TO SAVEPOINT v1');
    if (!violationCaught) throw new Error('VIOLATION TEST FAILED: expected trigger to raise EXCEPTION but it did not');
    if (!violationMessage.includes('value_type_contract')) {
      throw new Error(`VIOLATION TEST FAILED: exception message does not name contract: ${violationMessage}`);
    }
    console.log(`    ✓ trigger raised: ${violationMessage.slice(0, 200)}`);

    // CONFORMANT TEST: update with value_numeric + as_of_date — expect success.
    // Note: value_type for trl is 'categorical' per the seed in 006, so the
    // contract requires value_categorical. Adjust the test to match the
    // actual value_type and run two cases for completeness.
    if (trlValueType === 'categorical') {
      console.log('\n  [conformant] UPDATE trl row to populated WITH value_categorical — expect success');
      await client.query(`
        UPDATE component_attributes
        SET value_status='populated', value_categorical='8', source_citation='_test', confidence_band='medium'
        WHERE id = $1
      `, [trlCaId]);
      console.log('    ✓ UPDATE succeeded');
    }

    // Find a NUMERIC attribute (e.g. ttm_months) and run the value_numeric/as_of_date test
    const { rows: numAttr } = await client.query(`
      SELECT ad.id, ca.id AS ca_id
      FROM attribute_definitions ad
      JOIN component_attributes ca ON ca.attribute_def_id = ad.id AND ca.component_id = $1
      WHERE ad.attribute_name = 'ttm_months'
    `, [compId]);
    const numCaId = numAttr[0].ca_id;

    console.log('\n  [violation] UPDATE numeric attr (ttm_months) to populated WITHOUT value_numeric — expect EXCEPTION');
    let v2Caught = false, v2Msg = null;
    await client.query('SAVEPOINT v2');
    try {
      await client.query(`UPDATE component_attributes SET value_status='populated', source_citation='_test' WHERE id = $1`, [numCaId]);
    } catch (e) {
      v2Caught = true; v2Msg = e.message;
    }
    await client.query('ROLLBACK TO SAVEPOINT v2');
    if (!v2Caught) throw new Error('NUMERIC VIOLATION TEST FAILED: expected EXCEPTION');
    console.log(`    ✓ trigger raised: ${v2Msg.slice(0, 200)}`);

    console.log('\n  [violation] UPDATE numeric attr to populated WITH value_numeric but WITHOUT as_of_date — expect EXCEPTION');
    let v3Caught = false, v3Msg = null;
    await client.query('SAVEPOINT v3');
    try {
      await client.query(`UPDATE component_attributes SET value_status='populated', value_numeric=24, source_citation='_test' WHERE id = $1`, [numCaId]);
    } catch (e) {
      v3Caught = true; v3Msg = e.message;
    }
    await client.query('ROLLBACK TO SAVEPOINT v3');
    if (!v3Caught) throw new Error('NUMERIC AS_OF_DATE VIOLATION TEST FAILED: expected EXCEPTION');
    console.log(`    ✓ trigger raised: ${v3Msg.slice(0, 200)}`);

    console.log('\n  [conformant] UPDATE numeric attr WITH value_numeric AND as_of_date — expect success');
    await client.query(`
      UPDATE component_attributes
      SET value_status='populated', value_numeric=24, as_of_date='2026-05-04', source_citation='_test', confidence_band='medium'
      WHERE id = $1
    `, [numCaId]);
    console.log('    ✓ UPDATE succeeded');

    // Cleanup
    await client.query(`DELETE FROM component_attributes WHERE component_id = $1`, [compId]);
    await client.query(`DELETE FROM components WHERE id = $1`, [compId]);
    await client.query(`DELETE FROM initiatives_v2 WHERE id = $1`, [initId]);
    await client.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    console.log('\n  test rows deleted in reverse order');

    // Confirm catalogue clean
    const { rows: leftover } = await client.query(`SELECT count(*)::int AS n FROM companies WHERE name='_TRIGGER_TEST'`);
    if (leftover[0].n !== 0) throw new Error('_TRIGGER_TEST company still present');
    console.log('  catalogue clean ✓');

    await client.query('RELEASE SAVEPOINT trigger_test');
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT trigger_test');
    throw e;
  }

  if (WILL_COMMIT) {
    await client.query('COMMIT');
    console.log('\n[pg]    COMMIT — Phase 2 trigger persisted');
  } else {
    await client.query('ROLLBACK');
    console.log('\n[pg]    ROLLBACK (dry-run; pass --commit --confirm-yes to persist)');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\n[pg]    ROLLBACK due to error: ${err.message}`);
  await client.end();
  process.exit(1);
}

await client.end();
console.log(`\nDone. Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
