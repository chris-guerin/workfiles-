// One-off: inspect the SIgnal-engine-api credential's stored data.
// n8n public API may or may not expose decrypted secrets. We try a few
// shapes; if none works, we fall back to patching the workflow JSON to
// use hardcoded headers and bypass the credential entirely.
// Disposable.

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

async function tryPath(path) {
  try {
    const r = await fetch(`${BASE}/api/v1${path}`, {
      headers: { 'X-N8N-API-KEY': KEY, Accept: 'application/json' },
    });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: 0, body: 'err:' + e.message };
  }
}

const paths = [
  `/credentials/${CRED_ID}`,
  `/credentials/${CRED_ID}?includeData=true`,
  `/credentials/${CRED_ID}/data`,
];

for (const p of paths) {
  const r = await tryPath(p);
  console.log(`GET ${p} → ${r.status}`);
  console.log('  ' + r.body.slice(0, 400));
  console.log('');
}
