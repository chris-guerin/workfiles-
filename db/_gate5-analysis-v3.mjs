// Gate 5 verification — v3 prompt run.
// Pre-baseline: max_id=89, news=1251 rows (input to processing).
// Filter "new" via id > 89.
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

const BASELINE_MAX_ID = 89;
const BASELINE_NEWS_INPUT = 1251;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const newRows = await c.query(`SELECT count(*)::int AS n FROM mini_signals WHERE id > $1`, [BASELINE_MAX_ID]);
const totalRows = await c.query(`SELECT count(*)::int AS n FROM mini_signals`);
const newsNow = await c.query(`SELECT count(*)::int AS n FROM news`);

console.log('=== v3 prompt run — funnel ===');
console.log('  Input news rows                ', BASELINE_NEWS_INPUT);
console.log('  Mini_signals NEW (this run)    ', newRows.rows[0].n);
console.log('  Mini_signals total (incl. old) ', totalRows.rows[0].n);
console.log('  News rows remaining            ', newsNow.rows[0].n);
const dropPct = BASELINE_NEWS_INPUT > 0
  ? Math.round((1 - newRows.rows[0].n / BASELINE_NEWS_INPUT) * 1000) / 10
  : 0;
console.log('  Drop rate                      ', dropPct + '%');
console.log('  Spec target                    : 80-95%');
console.log('  Gate 5 user target             : 20-50 mini_signals');
const inTargetCount = newRows.rows[0].n >= 20 && newRows.rows[0].n <= 50;
console.log('  In count target?               ', inTargetCount ? 'YES' : 'NO (' + (newRows.rows[0].n < 20 ? 'too low' : 'too high') + ')');

console.log('');
console.log('=== Event-type distribution (NEW only) ===');
const et = await c.query(`
  SELECT COALESCE(event_type, '<NULL>') AS v, count(*)::int AS n
  FROM mini_signals WHERE id > $1
  GROUP BY 1 ORDER BY n DESC LIMIT 20
`, [BASELINE_MAX_ID]);
for (const r of et.rows) console.log('  ' + r.v.padEnd(30), r.n);

console.log('');
console.log('=== 15 random samples (NEW only) ===');
const sample = await c.query(`
  SELECT id, signal_id, event_type, companies, technologies, geography,
         left(headline, 130) AS headline,
         left(short_summary, 220) AS short_summary,
         left(evidence_snippet, 140) AS evidence_snippet
  FROM mini_signals WHERE id > $1
  ORDER BY random() LIMIT 15
`, [BASELINE_MAX_ID]);
for (let i = 0; i < sample.rows.length; i++) {
  const r = sample.rows[i];
  console.log('');
  console.log(`  [${i+1}] id=${r.id} type=${r.event_type}`);
  console.log(`      headline:     ${r.headline}`);
  if (r.companies)        console.log(`      companies:    ${r.companies}`);
  if (r.technologies)     console.log(`      technologies: ${r.technologies}`);
  if (r.geography)        console.log(`      geography:    ${r.geography}`);
  if (r.short_summary)    console.log(`      summary:      ${r.short_summary}`);
  if (r.evidence_snippet) console.log(`      evidence:     ${r.evidence_snippet}`);
}

await c.end();
