// Gate 5 funnel analysis — for the prompt-tightened re-run.
// Filters mini_signals to "new only" via id > BASELINE_MAX_ID so the older
// (loose-prompt) rows don't contaminate the comparison.
// Disposable.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
async function loadEnv(path) {
  if (!existsSync(path)) return;
  const raw = await readFile(path, 'utf8');
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
await loadEnv(join(__dirname, '.env'));
await loadEnv(join(__dirname, '..', 'n8n', '.env'));

const BASELINE_MAX_ID = 86;            // pre-rerun max(id) — anything above is from the tightened-prompt run
const BASELINE_INPUT_BEFORE_RUN = 1004; // news count before the rerun

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log('=== Tightened-prompt rerun — funnel snapshot (id > ' + BASELINE_MAX_ID + ') ===');
console.log('');

const totals = await client.query(`SELECT count(*)::int AS n FROM mini_signals`);
console.log('  mini_signals total (incl. old)  ', totals.rows[0].n);

const newOnly = await client.query(`SELECT count(*)::int AS n FROM mini_signals WHERE id > $1`, [BASELINE_MAX_ID]);
console.log('  mini_signals NEW (rerun output) ', newOnly.rows[0].n);

const newsNow = await client.query(`SELECT count(*)::int AS n FROM news`);
console.log('  news rows now                   ', newsNow.rows[0].n);
console.log('  news rows before rerun          ', BASELINE_INPUT_BEFORE_RUN);

const inputProcessed = BASELINE_INPUT_BEFORE_RUN;
const passed = newOnly.rows[0].n;
const dropPct = inputProcessed > 0 ? Math.round((1 - passed / inputProcessed) * 1000) / 10 : 0;

console.log('');
console.log('=== Drop rate ===');
console.log('  Input processed (news rows seen) :', inputProcessed);
console.log('  Passed (new mini_signals)        :', passed);
console.log('  Drop rate                        :', dropPct + '%');
console.log('  Spec target                      : 80-95%');
console.log('  Stricter than baseline (92.3%)?  ', dropPct >= 92.3 ? 'YES' : 'NO');

console.log('');
console.log('=== Confidence distribution (NEW only) ===');
const conf = await client.query(`
  SELECT
    CASE
      WHEN confidence::float >= 0.8 THEN 'high (≥0.80)'
      WHEN confidence::float >= 0.6 THEN 'med  (0.60–0.79)'
      WHEN confidence::float >= 0.5 THEN 'low  (0.50–0.59)'
      ELSE 'below 0.50'
    END AS bucket,
    count(*)::int AS n
  FROM mini_signals
  WHERE id > $1 AND confidence IS NOT NULL AND confidence != ''
  GROUP BY 1 ORDER BY 1 DESC
`, [BASELINE_MAX_ID]);
for (const r of conf.rows) console.log('  ' + r.bucket.padEnd(50), r.n);

console.log('');
console.log('=== Event-type distribution (NEW only) ===');
const et = await client.query(`
  SELECT COALESCE(event_type, '<NULL>') AS v, count(*)::int AS n
  FROM mini_signals WHERE id > $1
  GROUP BY 1 ORDER BY n DESC LIMIT 20
`, [BASELINE_MAX_ID]);
for (const r of et.rows) console.log('  ' + r.v.padEnd(30), r.n);

console.log('');
console.log('=== Sample (up to 20 NEW mini_signals) ===');
const sample = await client.query(`
  SELECT id, signal_id, confidence, event_type, companies, technologies, geography,
         left(headline, 130) AS headline,
         left(short_summary, 200) AS short_summary
  FROM mini_signals WHERE id > $1
  ORDER BY random() LIMIT 20
`, [BASELINE_MAX_ID]);
for (let i = 0; i < sample.rows.length; i++) {
  const r = sample.rows[i];
  console.log('');
  console.log(`  [${i+1}] id=${r.id} conf=${r.confidence} type=${r.event_type}`);
  console.log(`      headline: ${r.headline}`);
  if (r.companies)    console.log(`      companies:    ${r.companies}`);
  if (r.technologies) console.log(`      technologies: ${r.technologies}`);
  if (r.geography)    console.log(`      geography:    ${r.geography}`);
  if (r.short_summary) console.log(`      summary: ${r.short_summary}`);
}

await client.end();
