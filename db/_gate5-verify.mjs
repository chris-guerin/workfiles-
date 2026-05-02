// Gate 5 verification — measure end-to-end after WF-WeeklyNews-PG fires.
// Run after the trigger has completed (give it ~5-15 min for the chain).
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

const fmt = (n) => String(n).padStart(6, ' ');

console.log('=== Gate 5 — end-to-end snapshot ===');
console.log('');

const counts = {};
for (const t of ['news', 'mini_signals', 'heat_map_aggregates']) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
  counts[t] = rows[0].n;
  console.log(`  ${t.padEnd(22)} ${fmt(counts[t])} rows`);
}

console.log('');
console.log('Recent activity (last 30 min):');
const recent = await client.query(`SELECT count(*)::int AS n FROM mini_signals WHERE extracted_at > NOW() - INTERVAL '30 minutes'`);
console.log(`  mini_signals fresh     ${fmt(recent.rows[0].n)} rows`);
const newsRecent = await client.query(`SELECT count(*)::int AS n FROM news WHERE date_detected > NOW() - INTERVAL '30 minutes'`);
console.log(`  news fresh             ${fmt(newsRecent.rows[0].n)} rows`);

console.log('');
console.log('Provenance integrity:');
const orphans = await client.query(`SELECT count(*)::int AS n FROM mini_signals WHERE source_news_id IS NULL`);
console.log(`  mini_signals NULL src  ${fmt(orphans.rows[0].n)} rows  (lower is better; expected 0 if news rows still exist; OK if news cleaned)`);
const hashCheck = await client.query(`SELECT count(*)::int AS n FROM mini_signals WHERE content_hash IS NULL OR content_hash = ''`);
console.log(`  mini_signals NULL hash ${fmt(hashCheck.rows[0].n)} rows`);

console.log('');
console.log('Heat-map distribution (top 10):');
const hm = await client.query(`
  SELECT date, sector_tag, company, signal_type, count
  FROM heat_map_aggregates
  ORDER BY count DESC, date DESC
  LIMIT 10
`);
for (const r of hm.rows) {
  console.log(`  ${(r.date?.toISOString?.()?.slice(0,10) || r.date)}  ${(r.sector_tag||'').padEnd(14)} ${(r.company||'').padEnd(24)} ${(r.signal_type||'').padEnd(14)}  ${r.count}`);
}

console.log('');
console.log('mini_signals sample (latest 5):');
const sample = await client.query(`
  SELECT id, signal_id, extracted_at, source_news_id,
         left(headline, 90) AS headline, event_type, companies
  FROM mini_signals ORDER BY extracted_at DESC NULLS LAST, id DESC LIMIT 5
`);
for (const r of sample.rows) {
  console.log(`  id=${r.id}  src_news=${r.source_news_id ?? '—'}  ${r.event_type || '—'}  "${r.headline}"`);
  console.log(`    companies: ${r.companies || '—'}`);
}

console.log('');
console.log('Failed extractions still in news (next webhook will retry):');
const stuckNews = await client.query(`SELECT count(*)::int AS n FROM news`);
console.log(`  news rows remaining    ${fmt(stuckNews.rows[0].n)}`);

await client.end();
