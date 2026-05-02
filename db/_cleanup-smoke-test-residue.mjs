// One-off: clean smoke-test residue before gate 5 end-to-end run.
// Disposable — delete after gate 5 verification.

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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const queries = [
  { name: 'mini_signals',         sql: `DELETE FROM mini_signals       WHERE signal_id LIKE '_smoke_test_%'` },
  { name: 'heat_map_aggregates',  sql: `DELETE FROM heat_map_aggregates WHERE company = '_smoke_test_co'` },
  { name: 'news',                 sql: `DELETE FROM news               WHERE signal_id LIKE '_smoke_test_%'` },
];

console.log('Cleaning smoke-test residue:');
console.log('');
for (const q of queries) {
  const r = await client.query(q.sql);
  console.log(`  ${q.name.padEnd(22)} deleted ${r.rowCount} row(s)`);
}

console.log('');
console.log('Baseline counts after cleanup:');
for (const t of ['news', 'mini_signals', 'heat_map_aggregates']) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log(`  ${t.padEnd(22)} ${rows[0].n} rows`);
}

await client.end();
