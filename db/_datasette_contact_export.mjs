// db/_datasette_contact_export.mjs — exports the Datasette contacts table to
// a local JSON file for replayable import. Public-readable Datasette; no
// auth header needed (verified at probe time).
//
// Run: node db/_datasette_contact_export.mjs

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
async function loadDatasetteToken() {
  if (process.env.DATASETTE_TOKEN) return process.env.DATASETTE_TOKEN;
  const p = join(__dirname, '..', '.claude', 'settings.local.json');
  if (existsSync(p)) {
    const txt = await readFile(p, 'utf8');
    const m = txt.match(/datasette[_\W]token[\s:=]+["']?([A-Za-z0-9_-]{20,})["']?/i);
    if (m) return m[1];
  }
  return null;
}

const BASE = 'https://futurbridge-signals.onrender.com';
const TABLE_PATH = '/signal_engine_pe/contacts.json';
const PAGE_SIZE = 1000;
const TOKEN = await loadDatasetteToken();

const OUT_PATH = join(__dirname, '..', 'docs', 'draft_review', 'datasette_contacts_raw.json');
const dir = dirname(OUT_PATH);
if (!existsSync(dir)) await mkdir(dir, { recursive: true });

console.log('=== Datasette contact export ===');
console.log(`Source: ${BASE}${TABLE_PATH}`);
console.log(`Auth:   ${TOKEN ? 'Bearer token (loaded)' : 'unauthenticated (public-readable)'}`);
console.log(`Out:    ${OUT_PATH}`);
console.log('');

async function fetchPage(url) {
  const opts = { method: 'GET', headers: {} };
  if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const startUrl = `${BASE}${TABLE_PATH}?_size=${PAGE_SIZE}&_shape=objects`;
let url = startUrl;
let page = 0;
let allRows = [];
let columns = null;
let totalReported = null;

while (url) {
  page++;
  const t0 = Date.now();
  const j = await fetchPage(url);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (page === 1) {
    columns = j.columns;
    totalReported = j.filtered_table_rows_count;
    console.log(`page 1: schema columns = ${columns.length}; total rows reported = ${totalReported}`);
  }
  // _shape=objects returns rows as { columns: [...], rows: [{col: val, ...}] }
  const rows = Array.isArray(j.rows) ? j.rows : [];
  allRows = allRows.concat(rows);
  console.log(`  page ${page} fetched ${rows.length} rows (cumulative ${allRows.length} / ${totalReported}, ${elapsed}s)`);
  if (j.next_url) {
    url = j.next_url;
  } else if (j.next) {
    // fallback: build next URL manually if next_url missing
    url = `${BASE}${TABLE_PATH}?_size=${PAGE_SIZE}&_shape=objects&_next=${encodeURIComponent(j.next)}`;
  } else {
    url = null;
  }
}

const out = {
  exported_at: new Date().toISOString(),
  source: `${BASE}${TABLE_PATH}`,
  total_reported: totalReported,
  total_fetched: allRows.length,
  pages: page,
  columns,
  rows: allRows,
};

await writeFile(OUT_PATH, JSON.stringify(out));
console.log(`\n=== Summary ===`);
console.log(`Pages:           ${page}`);
console.log(`Reported total:  ${totalReported}`);
console.log(`Fetched total:   ${allRows.length}`);
console.log(`Wrote:           ${OUT_PATH} (${(JSON.stringify(out).length / 1024 / 1024).toFixed(1)} MB)`);

if (allRows.length === 0) {
  console.error('FATAL: zero rows fetched — Datasette may have changed or auth required');
  process.exit(2);
}
if (totalReported && allRows.length < totalReported) {
  console.warn(`WARN: fetched ${allRows.length} of reported ${totalReported} — pagination may have missed rows`);
}

// Document schema with one sample row
console.log('\nSchema (column names):');
console.log('  ' + columns.join(', '));
console.log('\nSample row 0:');
console.log(JSON.stringify(allRows[0], null, 2).slice(0, 1200));
