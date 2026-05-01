// One-off: list n8n credentials via API (or look up one by name).
// Disposable — delete after gate 3.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  const raw = await readFile(envPath, 'utf8');
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

const BASE = (process.env.N8N_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
if (!BASE || !KEY) {
  console.error('Missing N8N_BASE_URL or N8N_API_KEY');
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': KEY, Accept: 'application/json' },
  });
  return { status: res.status, body: await res.text() };
}

// n8n public API: GET /credentials does NOT exist (only schema endpoint exists).
// We instead list workflows and inspect credentials referenced in HTTP nodes,
// or rely on the user telling us the ID. Here we try a few endpoints.
const endpoints = [
  '/credentials',
  '/credentials?limit=100',
  '/me/credentials',
];
for (const ep of endpoints) {
  const r = await api(ep);
  console.log(`GET ${ep} → ${r.status}`);
  console.log('  ', r.body.slice(0, 300));
  console.log('');
}
