// Gate 5 funnel analysis — run after WF-15A-PG finishes.
// Reports drop rate, confidence distribution, sample headlines.
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

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const counts = {};
for (const t of ['news', 'mini_signals', 'heat_map_aggregates']) {
  const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
  counts[t] = r.rows[0].n;
}

console.log('=== Funnel snapshot ===');
console.log('');
console.log('  news rows currently     ', counts.news);
console.log('  mini_signals total      ', counts.mini_signals);
console.log('  heat_map_aggregates rows', counts.heat_map_aggregates);

// Drop rate: input = mini_signals + news_remaining_after_run
// Items that REACHED extraction = mini_signals.count (passed) + news.count (failed/skipped)
// (Items deleted from news = mini_signals written; remaining news = those that failed extraction or were skip:true)
const reachedHaiku = counts.mini_signals + counts.news;
const passed = counts.mini_signals;
const dropPct = reachedHaiku > 0 ? Math.round((1 - passed / reachedHaiku) * 100 * 10) / 10 : 0;
console.log('');
console.log('=== Drop rate ===');
console.log('  Items that reached pipeline:', reachedHaiku, '(passed=' + passed + ', skipped/in news still=' + counts.news + ')');
console.log('  Drop rate                  :', dropPct + '%');
console.log('  Spec target                : 80-95%');
console.log('  In target band?            ', dropPct >= 80 && dropPct <= 95 ? 'YES' : 'NO');

console.log('');
console.log('=== Confidence distribution (mini_signals.confidence as numeric string) ===');
const conf = await client.query(`
  SELECT
    CASE
      WHEN confidence::float >= 0.8 THEN 'high (≥0.80)'
      WHEN confidence::float >= 0.6 THEN 'med  (0.60–0.79)'
      WHEN confidence::float >= 0.5 THEN 'low  (0.50–0.59)'
      ELSE 'below threshold (would have been filtered)'
    END AS bucket,
    count(*)::int AS n
  FROM mini_signals
  WHERE confidence IS NOT NULL AND confidence != ''
  GROUP BY 1
  ORDER BY 1 DESC
`);
for (const r of conf.rows) {
  console.log('  ' + r.bucket.padEnd(50), r.n);
}

console.log('');
console.log('=== reasoning_classification distribution ===');
const rc = await client.query(`
  SELECT COALESCE(reasoning_classification, '<NULL>') AS v, count(*)::int AS n
  FROM mini_signals GROUP BY 1 ORDER BY n DESC LIMIT 20
`);
for (const r of rc.rows) console.log('  ' + r.v.padEnd(40), r.n);
console.log('');
console.log('  Note: reasoning_classification is set to null by Parse + Validate (placeholder');
console.log('  for downstream WF-15 / signal-pipeline classifier; not populated by extraction).');

console.log('');
console.log('=== Event-type distribution ===');
const et = await client.query(`
  SELECT COALESCE(event_type, '<NULL>') AS v, count(*)::int AS n
  FROM mini_signals GROUP BY 1 ORDER BY n DESC LIMIT 20
`);
for (const r of et.rows) console.log('  ' + r.v.padEnd(30), r.n);

console.log('');
console.log('=== 10 random sample mini_signals ===');
const sample = await client.query(`
  SELECT id, signal_id, confidence, event_type, companies, technologies, geography,
         left(headline, 130) AS headline,
         left(short_summary, 200) AS short_summary
  FROM mini_signals
  ORDER BY random()
  LIMIT 10
`);
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
