// One-off: patch the SIgnal-engine-api credential to ensure the header
// value has the correct "Bearer <key>" form.
// Disposable.
//
// Usage:
//   node _patch-credential.mjs              # dry-run, just shows the PATCH body
//   node _patch-credential.mjs --commit     # actually patch via API

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
const CRED_ID = 'owmBnJT6sDpq9n60';
const API_KEY = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : null;

if (!API_KEY) {
  console.error('Usage: node _patch-credential.mjs --key <api-key> [--commit]');
  console.error('       Pass the api-key as the third arg to avoid writing it to disk.');
  process.exit(1);
}

const COMMIT = process.argv.includes('--commit');

const body = {
  name: 'SIgnal-engine-api',
  type: 'httpHeaderAuth',
  data: {
    name: 'Authorization',
    value: `Bearer ${API_KEY}`,
  },
};

console.log(`Target:   PATCH ${BASE}/api/v1/credentials/${CRED_ID}`);
console.log(`Mode:     ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
console.log('Body:    ', JSON.stringify({ ...body, data: { name: body.data.name, value: 'Bearer <redacted>' } }, null, 2));
console.log('');

if (!COMMIT) {
  console.log('Dry-run only. Pass --commit to actually patch.');
  process.exit(0);
}

// Try PATCH first, then PUT, then DELETE+POST
const tryEndpoints = [
  { method: 'PATCH', url: `/credentials/${CRED_ID}` },
  { method: 'PUT',   url: `/credentials/${CRED_ID}` },
];
for (const ep of tryEndpoints) {
  console.log(`Trying ${ep.method} ${ep.url}...`);
  const r = await fetch(`${BASE}/api/v1${ep.url}`, {
    method: ep.method,
    headers: {
      'X-N8N-API-KEY': KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  console.log(`  → ${r.status}: ${txt.slice(0, 300)}`);
  if (r.ok) { console.log('SUCCESS'); process.exit(0); }
}
console.log('');
console.log('No PATCH/PUT path worked. Recommend rebuilding workflow with hardcoded headers.');
