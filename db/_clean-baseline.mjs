// Clean PG to true zero baseline before gate 5 fresh-pull verification.
// Deletes mini_signals, heat_map_aggregates, news.
// Disposable.

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

const queries = [
  ['mini_signals',         'DELETE FROM mini_signals'],
  ['heat_map_aggregates',  'DELETE FROM heat_map_aggregates'],
  ['news',                 'DELETE FROM news'],
];
for (const [name, sql] of queries) {
  const r = await c.query(sql);
  console.log(`  ${name.padEnd(22)} deleted ${r.rowCount} rows`);
}

console.log('');
console.log('Final state:');
for (const t of ['news', 'mini_signals', 'heat_map_aggregates']) {
  const r = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log(`  ${t.padEnd(22)} ${r.rows[0].n}`);
}

await c.end();
