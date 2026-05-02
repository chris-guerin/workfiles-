// One-off: post-outage status check for gate 5.
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

const queries = [
  ['news count',                'SELECT count(*)::int AS n FROM news'],
  ['mini_signals count',        'SELECT count(*)::int AS n FROM mini_signals'],
  ['heat_map_aggregates count', 'SELECT count(*)::int AS n FROM heat_map_aggregates'],
  ['max(mini_signals.extracted_at)', 'SELECT max(extracted_at) AS v FROM mini_signals'],
  ['mini_signals in last 2h',   `SELECT count(*)::int AS n FROM mini_signals WHERE extracted_at > NOW() - INTERVAL '2 hours'`],
];

for (const [label, sql] of queries) {
  const { rows } = await client.query(sql);
  const v = rows[0].n !== undefined ? rows[0].n : rows[0].v;
  console.log(`  ${label.padEnd(36)} ${v ?? 'null'}`);
}

// Also surface a sample of mini_signals if any
const sample = await client.query(`
  SELECT id, signal_id, extracted_at, headline, source_news_id, content_hash
  FROM mini_signals ORDER BY extracted_at DESC NULLS LAST, id DESC LIMIT 5
`);
console.log('');
console.log(`Latest mini_signals (up to 5):`);
for (const r of sample.rows) {
  console.log(`  id=${r.id}  signal_id=${r.signal_id}  src_news=${r.source_news_id}  ${r.extracted_at?.toISOString?.() || r.extracted_at}`);
  console.log(`    "${(r.headline || '').slice(0, 100)}"`);
}

// Heat map sample
const hm = await client.query(`
  SELECT date, sector_tag, company, signal_type, count
  FROM heat_map_aggregates ORDER BY date DESC, count DESC LIMIT 10
`);
console.log('');
console.log(`Heat-map top 10:`);
for (const r of hm.rows) {
  console.log(`  ${r.date?.toISOString?.()?.slice(0,10) || r.date}  ${(r.sector_tag||'').padEnd(12)} ${(r.company||'').padEnd(20)} ${(r.signal_type||'').padEnd(12)}  ${r.count}`);
}

await client.end();
