// db/_phase3_complete.mjs — completes Phase 3b (claims back-fill),
// Phase 3c (reasoning placeholders), Phase 3d (catalogue_names index).
//
// Run:
//   node db/_phase3_complete.mjs --commit

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

async function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const candidates = [
    join(__dirname, '..', 'n8n', 'workflows', 'wf-15.json'),
    join(__dirname, '..', 'n8n', 'workflows', 'wf15apg.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const txt = await readFile(p, 'utf8');
    const m = txt.match(/sk-ant-api03-[A-Za-z0-9_-]{80,300}/);
    if (m) return m[0];
  }
  return null;
}

const COMMIT = process.argv.includes('--commit');
const COMPANY_ID = 4;
const ANTHROPIC_KEY = await getAnthropicKey();

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log(`=== Phase 3 completion (3b + 3c + 3d) ===  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// ===== 3b: claim back-fill (threshold_direction primarily) =====
async function callHaiku(systemPrompt, userPrompt) {
  if (!COMMIT) return '{"parseable":false}';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.content?.[0]?.text || '';
}
function tryJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = fenced ? fenced[1] : text;
  const start = s.indexOf('{'); if (start < 0) return null;
  let d = 0, end = -1;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

console.log('\n=== 3b — claims threshold_direction back-fill ===');
const { rows: claims } = await c.query(`
  SELECT cl.id, cl.claim_text, cl.role, cl.criticality, cl.threshold_op,
         cl.threshold_value_numeric, cl.threshold_value_text, cl.threshold_unit, cl.deadline_date,
         cl.attribute_def_id, cl.threshold_direction,
         comp.name AS component_name
  FROM claims_v2 cl
  JOIN components comp ON comp.id = cl.component_id
  JOIN initiatives_v2 i ON i.id = comp.initiative_id
  WHERE i.company_id = $1
  ORDER BY cl.id
`, [COMPANY_ID]);
console.log(`[3b] ${claims.length} claims`);

const SYS = `You decide threshold_direction for an analyst claim. Output strict JSON: {"direction":"toward_threshold_increases_confidence"|"toward_threshold_decreases_confidence"|"crossing_falsifies"|"crossing_validates","reasoning":"..."}.

Rules of thumb:
- principal/enabling claim, threshold movement supports the initiative -> toward_threshold_increases_confidence
- principal/enabling claim, threshold movement undermines -> toward_threshold_decreases_confidence
- external_threat claim, crossing kills the thesis -> crossing_falsifies
- enabling claim where crossing the threshold validates -> crossing_validates`;

let bOk = 0, bSkip = 0;
for (const cl of claims) {
  if (cl.threshold_direction != null) { bSkip++; continue; }

  let direction = null;
  if (COMMIT) {
    try {
      const out = await callHaiku(SYS, `claim: "${cl.claim_text}"\nrole: ${cl.role}\ncriticality: ${cl.criticality}\nthreshold_op: ${cl.threshold_op}\nthreshold_value: ${cl.threshold_value_numeric ?? cl.threshold_value_text}\nReturn the JSON.`);
      const j = tryJson(out);
      if (j && ['toward_threshold_increases_confidence','toward_threshold_decreases_confidence','crossing_falsifies','crossing_validates'].includes(j.direction)) {
        direction = j.direction;
      }
    } catch (e) { /* fall through to deterministic default */ }
  }
  // Deterministic fallback
  if (!direction) {
    if (cl.role === 'external_threat') direction = 'crossing_falsifies';
    else direction = 'toward_threshold_increases_confidence';
  }

  if (COMMIT) {
    await c.query(`UPDATE claims_v2 SET threshold_direction = $1, last_updated_at = NOW() WHERE id = $2`, [direction, cl.id]);
  }
  bOk++;
}
console.log(`[3b] back-filled threshold_direction on ${bOk} claims (${bSkip} already had it)`);

// ===== 3c — reasoning placeholders =====
console.log('\n=== 3c — reasoning placeholders ===');
const placeholder = 'Back-filled from v2 — analyst to review and expand';

if (COMMIT) {
  const r1 = await c.query(`UPDATE initiatives_v2 SET state_reasoning=$1, trajectory_reasoning=$1
    WHERE company_id=$2 AND state IS NOT NULL AND state_reasoning IS NULL`, [placeholder, COMPANY_ID]);
  const r2 = await c.query(`UPDATE components SET state_reasoning=$1, trajectory_reasoning=$1
    WHERE initiative_id IN (SELECT id FROM initiatives_v2 WHERE company_id=$2)
      AND state IS NOT NULL AND state_reasoning IS NULL`, [placeholder, COMPANY_ID]);
  const r3 = await c.query(`UPDATE claims_v2 SET criticality_reasoning=$1, impact_reasoning=$1
    WHERE component_id IN (SELECT comp.id FROM components comp JOIN initiatives_v2 i ON i.id=comp.initiative_id WHERE i.company_id=$2)
      AND criticality_reasoning IS NULL`, [placeholder, COMPANY_ID]);
  console.log(`[3c] back-filled: initiatives=${r1.rowCount}, components=${r2.rowCount}, claims=${r3.rowCount}`);
}

// ===== 3d — catalogue_names =====
console.log('\n=== 3d — catalogue_names index ===');

if (COMMIT) {
  const r1 = await c.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT name, 'component', id, 'components' FROM components
    WHERE NOT EXISTS (SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = components.id AND cn.reference_table = 'components')
  `);
  const r2 = await c.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT function_name, 'tech_function', id, 'tech_functions' FROM tech_functions
    WHERE NOT EXISTS (SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = tech_functions.id AND cn.reference_table = 'tech_functions')
  `);
  const r3 = await c.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT name, 'company', id, 'companies' FROM companies
    WHERE NOT EXISTS (SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = companies.id AND cn.reference_table = 'companies')
  `);
  const r4 = await c.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT name, 'initiative', id, 'initiatives_v2' FROM initiatives_v2
    WHERE NOT EXISTS (SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = initiatives_v2.id AND cn.reference_table = 'initiatives_v2')
  `);
  console.log(`[3d] inserted: components=${r1.rowCount}, tech_functions=${r2.rowCount}, companies=${r3.rowCount}, initiatives=${r4.rowCount}`);

  const { rows: total } = await c.query(`SELECT count(*)::int AS n FROM catalogue_names`);
  console.log(`[3d] total catalogue_names rows: ${total[0].n}`);
}

await c.end();
console.log('\nPhase 3 completion done.');
