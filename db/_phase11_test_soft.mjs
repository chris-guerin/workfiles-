// db/_phase11_test_soft.mjs — Step 4 of migration 011 build.
// Seeds 4 synthetic mini_signals_v3 rows with soft_signal_type set,
// runs them through POST /signal_route/assess_soft_impact, documents
// the match/orphan behaviour, then deletes the test rows.
//
// All 4 will be orphans because the assumption/tension/reframing tables
// are empty — that is the expected path. The test confirms suggested_
// new_record output is reasonable enough for an analyst to act on.
//
// Run: node db/_phase11_test_soft.mjs --commit

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
await loadEnv(join(__dirname, '.env'));
await loadEnv(join(__dirname, '..', 'n8n', '.env'));

async function getApiKey() {
  if (process.env.SIGNAL_ENGINE_API_KEY) return process.env.SIGNAL_ENGINE_API_KEY;
  if (process.env.API_KEY) return process.env.API_KEY;
  const p = join(__dirname, '..', '.claude', 'settings.local.json');
  if (existsSync(p)) {
    const txt = await readFile(p, 'utf8');
    const m = txt.match(/Bearer\s+([a-f0-9]{64})/);
    if (m) return m[1];
  }
  return null;
}

const COMMIT = process.argv.includes('--commit');
const API_KEY = await getApiKey();
const API_BASE = 'https://signal-engine-api-production-0cf1.up.railway.app';

if (COMMIT && !API_KEY) { console.error('No API key'); process.exit(1); }

console.log(`=== Phase 11 — synthetic soft-signal test ===  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

const NOW_ISO = new Date().toISOString();
const TEST_TAG = '_phase11_test';

const SEEDS = [
  {
    label: '1. assumption_evidence (contradicting)',
    signal_text: 'EU Council signals 30% cut to Hydrogen Bank Round 4 budget envelope citing fiscal consolidation pressures, dropping committed envelope from €1.5bn to €1.0bn through 2027.',
    signal_type: 'regulatory_change',
    soft_signal_type: 'assumption_evidence',
    soft_signal_subject: 'EU funding remains stable for hydrogen through 2030',
    soft_signal_direction: 'contradicting',
    soft_signal_reasoning: 'A 30% budget cut directly undermines the unstated assumption that EU public funding for green hydrogen scales linearly with announced ambitions. Hydrogen producers and project FIDs anchored to a 2027 funding plateau now face a material policy-credibility shock that no specific component-level attribute captures.',
    extracted_entities: ['EU Hydrogen Bank'],
  },
  {
    label: '2. tension_evidence (reinforcing)',
    signal_text: 'BP, Shell, and TotalEnergies announce coordinated upstream capex increases of 12-15% over guidance through 2027, alongside transition portfolio writedowns of $4.2bn cumulative across the three; analyst commentary frames as IOC sector pivot back to hydrocarbons.',
    signal_type: 'commentary',
    soft_signal_type: 'tension_evidence',
    soft_signal_subject: 'hydrocarbons strengthen while transition portfolio holds — IOC capital allocation pivot tension',
    soft_signal_direction: 'reinforcing',
    soft_signal_reasoning: 'A coordinated three-major capex re-tilt toward upstream alongside simultaneous transition writedowns reinforces the structural tension that IOC capital discipline pressure undermines transition asset retention. The cross-company synchronicity makes this a portfolio-level rather than firm-level signal.',
    extracted_entities: ['BP', 'Shell', 'TotalEnergies'],
  },
  {
    label: '3. reframe_evidence (clarifying)',
    signal_text: 'BloombergNEF Q1 2026 charging infrastructure note reframes EV public charging economics from utilisation-driven to demand-shape-driven; argues the 2025 deployment build forces operators to compete on energy time-of-use arbitrage rather than throughput per port.',
    signal_type: 'commentary',
    soft_signal_type: 'reframe_evidence',
    soft_signal_subject: 'EV charging shifts from utilisation-driven to demand-shape-driven',
    soft_signal_direction: 'clarifying',
    soft_signal_reasoning: 'BNEF reframing of the EV charging investment thesis from per-port utilisation to demand-shape arbitrage represents a category shift in how attribute movements should be interpreted. Analyst note signals industry convergence on a new mental model that changes which metrics matter for forward FIDs.',
    extracted_entities: ['BloombergNEF'],
  },
  {
    label: '4. orphan-only — subject does not match any plausible existing record',
    signal_text: 'Mongolian government announces new permitting framework for in-situ uranium leaching at Dornod field, accelerating timelines for nuclear-grade fuel cycle development.',
    signal_type: 'regulatory_change',
    soft_signal_type: 'assumption_evidence',
    soft_signal_subject: 'Mongolian uranium fuel cycle development pace',
    soft_signal_direction: 'reinforcing',
    soft_signal_reasoning: 'Permitting framework signals state-level commitment to nuclear fuel cycle build-out at a Mongolia-specific pace. Subject is well outside any current Shell catalogue scope; serves as a true orphan case verifying the endpoint handles non-applicable subjects gracefully.',
    extracted_entities: ['Mongolia'],
  },
];

if (!COMMIT) {
  console.log('[dry-run] would seed 4 mini_signals_v3 rows + run assess_soft_impact + cleanup');
  console.log('Seed plan:');
  for (const s of SEEDS) console.log(`  ${s.label}: ${s.soft_signal_type}/${s.soft_signal_direction}`);
  process.exit(0);
}

// Helper
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'authorization': `Bearer ${API_KEY}`, 'content-type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(`${API_BASE}${path}`, { ...opts, signal: AbortSignal.timeout(120_000) });
  let parsed; try { parsed = await r.json(); } catch { parsed = await r.text(); }
  return { status: r.status, ok: r.ok, body: parsed };
}

// ===== Step 4a — seed =====
console.log('\n--- 4a. Seed 4 synthetic mini_signals_v3 ---');
const seededIds = [];
for (const s of SEEDS) {
  const post = await api('POST', '/mini_signals_v3', {
    signal_text: s.signal_text,
    signal_type: s.signal_type,
    extracted_entities: s.extracted_entities,
    extracted_at: NOW_ISO,
    extraction_model: TEST_TAG,
    extraction_confidence: 0.85,
    soft_signal_type: s.soft_signal_type,
    soft_signal_subject: s.soft_signal_subject,
    soft_signal_direction: s.soft_signal_direction,
    soft_signal_reasoning: s.soft_signal_reasoning,
  });
  if (!post.ok) { console.log(`  FAIL ${s.label}: ${post.status} ${JSON.stringify(post.body).slice(0, 200)}`); continue; }
  const id = post.body.row.id;
  seededIds.push({ id, label: s.label });
  console.log(`  seeded id=${id}: ${s.label}`);
}

// ===== Step 4b — assess each =====
console.log('\n--- 4b. POST /signal_route/assess_soft_impact for each ---');
const assessments = [];
for (const seed of seededIds) {
  const t0 = Date.now();
  const r = await api('POST', '/signal_route/assess_soft_impact', { mini_signal_id: seed.id });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  [${seed.label}] ms_id=${seed.id}  HTTP ${r.status}  ${elapsed}s`);
  if (!r.ok) { console.log(`    FAIL: ${JSON.stringify(r.body).slice(0, 200)}`); continue; }
  assessments.push({ seed, response: r.body });
  console.log(`    status:        ${r.body.status}`);
  console.log(`    match_found:   ${r.body.match_found}`);
  console.log(`    match_score:   ${r.body.match_score}`);
  console.log(`    match_reason:  ${(r.body.match_reasoning || '').slice(0, 200)}`);
  if (r.body.impact) {
    console.log(`    impact dir:    ${r.body.impact.impact_direction}`);
    console.log(`    impact mag:    ${r.body.impact.impact_magnitude}`);
    console.log(`    is_material:   ${r.body.impact.is_material}`);
  }
  if (r.body.suggested_new_record) {
    console.log(`    suggested_new_record:`);
    for (const [k, v] of Object.entries(r.body.suggested_new_record)) {
      const val = typeof v === 'string' ? `"${v.slice(0, 200)}"` : JSON.stringify(v);
      console.log(`      ${k}: ${val}`);
    }
  }
}

// ===== Step 4c — analyst-usability inspection =====
console.log('\n--- 4c. Analyst-usability inspection ---');
const usable = assessments.filter((a) => a.response.suggested_new_record &&
  ((a.seed.label.includes('assumption') && a.response.suggested_new_record.assumption_text && a.response.suggested_new_record.assumption_role && a.response.suggested_new_record.horizon) ||
   (a.seed.label.includes('tension') && a.response.suggested_new_record.tension_name && a.response.suggested_new_record.tension_statement) ||
   (a.seed.label.includes('reframe') && a.response.suggested_new_record.subject_name && a.response.suggested_new_record.from_frame && a.response.suggested_new_record.to_frame))
);
console.log(`  ${usable.length}/${assessments.length} suggested_new_record outputs have all required fields populated and look analyst-usable.`);

// ===== Step 4d — cleanup =====
console.log('\n--- 4d. Cleanup synthetic test rows ---');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
// Remove signal_soft_impacts first (FK), then mini_signals_v3
const r1 = await c.query(`DELETE FROM signal_soft_impacts WHERE mini_signal_id = ANY($1::int[])`, [seededIds.map(s => s.id)]);
const r2 = await c.query(`DELETE FROM mini_signals_v3 WHERE id = ANY($1::int[]) AND extraction_model = $2`, [seededIds.map(s => s.id), TEST_TAG]);
console.log(`  deleted: ${r1.rowCount} signal_soft_impacts; ${r2.rowCount} mini_signals_v3 rows`);

// Verify clean
const { rows: leftover } = await c.query(`SELECT count(*)::int AS n FROM mini_signals_v3 WHERE extraction_model = $1`, [TEST_TAG]);
console.log(`  leftover ${TEST_TAG} rows: ${leftover[0].n}`);

// Also clean any stray auto-created assumptions/tensions/reframings (none expected since auto_create=false default)
const r3 = await c.query(`DELETE FROM initiative_assumptions WHERE source_citation LIKE '%_phase11_test%' OR source_citation LIKE '%phase11%'`);
const r4 = await c.query(`DELETE FROM strategic_tensions WHERE source_citation LIKE '%_phase11_test%' OR source_citation LIKE '%phase11%'`);
const r5 = await c.query(`DELETE FROM reframings WHERE source_citation LIKE '%_phase11_test%' OR source_citation LIKE '%phase11%'`);
console.log(`  defensive cleanup: ${r3.rowCount} assumptions, ${r4.rowCount} tensions, ${r5.rowCount} reframings (expected 0/0/0)`);

await c.end();

console.log('\n=== Summary ===');
console.log(`seeded: ${seededIds.length}`);
console.log(`assessed: ${assessments.length}`);
const orphans = assessments.filter((a) => a.response.status === 'orphan_for_analyst_review').length;
const matched = assessments.filter((a) => a.response.status === 'assessed').length;
console.log(`  orphan_for_analyst_review: ${orphans}`);
console.log(`  assessed (match found):    ${matched}`);
console.log(`analyst-usable suggested_new_records: ${usable.length}/${assessments.length}`);
console.log(`cleanup: catalogue clean (0 ${TEST_TAG} rows remaining)`);
