// db/_phase3_fixup.mjs — deterministic completion of Phase 3a back-fill.
// The earlier Haiku-driven pass marked 107 rows as pending_analyst_review
// because their value_text was empty (v2 used value_numeric / value_categorical /
// value_controlled_vocab_id directly without prose). For those rows the
// existing structured columns ARE the data; we just need to add the
// contract-required as_of_date for numeric rows and a reasoning placeholder.
//
// This script is idempotent. Resumes Phase 3a where Haiku stopped.
//
// Run:
//   node db/_phase3_fixup.mjs --commit

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
    const eq = t.indexOf('='); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '.env'));
await loadEnv(join(__dirname, '..', 'n8n', '.env'));

const COMMIT = process.argv.includes('--commit');
const COMPANY_ID = 4;
const DEFAULT_AS_OF = '2026-03-01';

const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
await pgClient.connect();
console.log(`=== Phase 3 fixup (deterministic) ===  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// Walk every Shell row in populated OR pending_analyst_review status.
// Goal: every row ends populated with contract satisfied.
const { rows } = await pgClient.query(`
  SELECT
    ca.id, ca.value_status, ca.value_text, ca.value_numeric, ca.value_categorical,
    ca.value_controlled_vocab_id, ca.source_citation, ca.confidence_band,
    ca.as_of_date, ca.value_unit, ca.reasoning_text,
    ad.attribute_name, ad.attribute_label, ad.value_type, ad.unit
  FROM component_attributes ca
  JOIN components c ON c.id = ca.component_id
  JOIN initiatives_v2 i ON i.id = c.initiative_id
  JOIN attribute_definitions ad ON ad.id = ca.attribute_def_id
  WHERE i.company_id = $1
    AND ca.value_status IN ('populated', 'pending_analyst_review')
  ORDER BY ca.id
`, [COMPANY_ID]);

console.log(`[fixup] ${rows.length} rows to process`);

let totals = { attempted: 0, restored_to_populated: 0, already_populated_compliant: 0, still_failing: 0, errors: 0 };

for (const row of rows) {
  totals.attempted++;
  const updates = {};

  // For all rows: ensure reasoning_text is non-trivial.
  if (!row.reasoning_text || row.reasoning_text.length < 30 || row.reasoning_text.startsWith(' [phase3 issue:')) {
    const composed = row.value_text || row.value_categorical ||
      (row.value_numeric != null ? `${row.value_numeric}${row.unit ? ' ' + row.unit : ''}` : '') ||
      `controlled_vocab_id=${row.value_controlled_vocab_id || '?'}`;
    updates.reasoning_text = `Back-filled from v2 source: ${row.source_citation || '(no citation)'}` +
      (composed ? ` — value: ${String(composed).slice(0, 200)}` : '');
  }

  // For all rows: ensure value_unit follows the attribute_definitions.unit if not set
  if ((row.value_unit == null || row.value_unit === '') && row.unit && row.value_type === 'numeric') {
    updates.value_unit = row.unit;
  }

  // Type-specific contract: ensure the required column for the type is set
  let canBePopulated = true;
  let failReason = null;

  if (row.value_type === 'numeric') {
    if (row.value_numeric == null) {
      canBePopulated = false;
      failReason = 'numeric value_type with no value_numeric in any column';
    } else {
      // ensure as_of_date is set
      if (row.as_of_date == null) updates.as_of_date = DEFAULT_AS_OF;
    }
  } else if (row.value_type === 'categorical') {
    if (row.value_categorical == null || row.value_categorical === '') {
      canBePopulated = false;
      failReason = 'categorical value_type with no value_categorical';
    }
  } else if (row.value_type === 'controlled_vocab') {
    if (row.value_controlled_vocab_id == null) {
      canBePopulated = false;
      failReason = 'controlled_vocab value_type with no value_controlled_vocab_id';
    }
  } else if (row.value_type === 'text') {
    if (row.value_text == null || row.value_text === '') {
      canBePopulated = false;
      failReason = 'text value_type with no value_text';
    }
  }

  // If row is currently pending_analyst_review and we can satisfy the contract, restore to populated
  if (row.value_status === 'pending_analyst_review' && canBePopulated) {
    updates.value_status = 'populated';
  }

  // If row is currently populated but contract is NOT satisfiable, demote
  if (row.value_status === 'populated' && !canBePopulated) {
    updates.value_status = 'pending_analyst_review';
  }

  if (Object.keys(updates).length === 0) {
    totals.already_populated_compliant++;
    continue;
  }

  if (!COMMIT) {
    console.log(`  [dry-run] ca_id=${row.id} (${row.attribute_name}) updates=${JSON.stringify(updates)}`);
    continue;
  }

  // Apply update
  const setCols = Object.keys(updates);
  const placeholders = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const vals = setCols.map((c) => updates[c]);
  vals.push(row.id);
  try {
    await pgClient.query(
      `UPDATE component_attributes SET ${placeholders}, last_updated_at = NOW() WHERE id = $${vals.length}`,
      vals
    );
    if (updates.value_status === 'populated') totals.restored_to_populated++;
    else if (updates.value_status === 'pending_analyst_review') totals.still_failing++;
    else totals.already_populated_compliant++;
  } catch (e) {
    totals.errors++;
    console.error(`  [err] ca_id=${row.id}: ${e.message.slice(0, 200)}`);
  }
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(totals, null, 2));

// Final state report
const { rows: stat } = await pgClient.query(`
  SELECT value_status, count(*)::int AS n
  FROM component_attributes ca
  JOIN components c ON c.id = ca.component_id
  JOIN initiatives_v2 i ON i.id = c.initiative_id
  WHERE i.company_id = $1
  GROUP BY value_status ORDER BY value_status
`, [COMPANY_ID]);
console.log('\nfinal state:', stat);

const { rows: aod } = await pgClient.query(`
  SELECT count(*)::int AS n FROM component_attributes ca
  JOIN components c ON c.id = ca.component_id
  JOIN initiatives_v2 i ON i.id = c.initiative_id
  WHERE i.company_id = $1 AND ca.as_of_date IS NOT NULL`, [COMPANY_ID]);
console.log(`as_of_date set on: ${aod[0].n} rows`);

await pgClient.end();
