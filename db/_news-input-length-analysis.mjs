// Diagnose: what proportion of news rows would the workflow synthesize as
// raw_text < 200 chars? This drives the thin_input drop in the new prompt.
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

// In WF-15A-PG's Map to Canonical Schema:
//   raw_text = [title, summary].filter(Boolean).join(' — ').slice(0, 6000)
// The news table doesn't store summary as a column. The Sheets-style flow had
// 'sector_tags' / 'tech_tags' / etc. as broad textual columns. The closest we
// have is news.title (the only non-tag long text in the new schema). So we
// approximate raw_text length as length of title alone — which is what
// Map-to-Canonical actually computes when the upstream RSS item has no body.
const r = await c.query(`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE length(title) < 200)::int AS under_200,
    count(*) FILTER (WHERE length(title) BETWEEN 200 AND 500)::int AS s_200_500,
    count(*) FILTER (WHERE length(title) > 500)::int AS over_500,
    avg(length(title))::int AS avg_len,
    min(length(title))::int AS min_len,
    max(length(title))::int AS max_len
  FROM news
`);
console.log('news.title length distribution:');
console.log(r.rows[0]);

console.log('');
console.log('Length buckets:');
const buckets = await c.query(`
  SELECT
    CASE
      WHEN length(title) < 50 THEN '< 50'
      WHEN length(title) < 100 THEN '50-99'
      WHEN length(title) < 150 THEN '100-149'
      WHEN length(title) < 200 THEN '150-199'
      WHEN length(title) < 300 THEN '200-299'
      WHEN length(title) < 500 THEN '300-499'
      ELSE '>= 500'
    END AS bucket,
    count(*)::int AS n
  FROM news GROUP BY 1 ORDER BY MIN(length(title))
`);
for (const b of buckets.rows) console.log('  ' + b.bucket.padEnd(10), b.n);

console.log('');
console.log('5 sample titles by source:');
const samples = await c.query(`
  SELECT source, length(title) AS len, left(title, 100) AS title
  FROM news
  ORDER BY random()
  LIMIT 8
`);
for (const s of samples.rows) {
  console.log('  [' + String(s.len).padStart(3) + 'ch] ' + s.source + '  →  ' + s.title);
}

await c.end();
