// db/_phase11_acceptance.mjs — runs Q6 and Q7 from spec section 13.8.
// Both should parse + execute; zero rows expected because no soft data
// has been populated yet (that is the next prompt).

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

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function timed(label, sql) {
  const t0 = process.hrtime.bigint();
  try {
    const r = await c.query(sql);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`\n=== ${label} ===  rows=${r.rows.length}  time=${ms.toFixed(1)}ms`);
    if (r.rows.length === 0) console.log('  (zero rows — soft tables empty; query parses + executes)');
    else for (const row of r.rows.slice(0, 5)) console.log(' ', JSON.stringify(row));
  } catch (e) {
    console.log(`\n=== ${label} ===  ERROR\n  ${e.message}`);
  }
}

const Q6 = `
SELECT i.name AS initiative, ia.assumption_text, ia.assumption_role, ia.horizon,
       ia.fragility_score, ia.status,
       count(ssi.id) AS evidence_count,
       count(ssi.id) FILTER (WHERE ssi.impact_direction = 'contradicts') AS contradicting_evidence
FROM initiative_assumptions ia
JOIN initiatives_v2 i ON i.id = ia.initiative_id
LEFT JOIN signal_soft_impacts ssi ON ssi.assumption_id = ia.id
WHERE ia.status = 'active'
GROUP BY ia.id, i.name, ia.assumption_text, ia.assumption_role, ia.horizon, ia.fragility_score, ia.status
ORDER BY contradicting_evidence DESC, ia.fragility_score DESC`;

const Q7 = `
SELECT st.tension_name, st.tension_type, st.scope, st.primary_horizon,
       count(DISTINCT tai.initiative_id) AS affected_initiatives,
       count(DISTINCT tac.component_id) AS affected_components,
       count(DISTINCT te.id) AS evidence_count,
       max(te.recorded_at) AS last_evidence_at
FROM strategic_tensions st
LEFT JOIN tension_affected_initiatives tai ON tai.tension_id = st.id
LEFT JOIN tension_affected_components tac ON tac.tension_id = st.id
LEFT JOIN tension_evidence te ON te.tension_id = st.id
WHERE st.status IN ('emerging','established')
GROUP BY st.id, st.tension_name, st.tension_type, st.scope, st.primary_horizon
ORDER BY evidence_count DESC, last_evidence_at DESC`;

await timed('Q6 — assumption status query (contradicting evidence ranked)', Q6);
await timed('Q7 — emerging tensions query', Q7);

await c.end();
