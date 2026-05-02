// Poll until a NEW WF-15A-PG execution completes.
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
const WF = process.argv[2] || 'KtFda6LGUSfbYNDQ';
const SINCE = process.argv[3] || new Date(Date.now() - 5 * 60 * 1000).toISOString(); // last 5 min

console.log('Waiting for new execution of', WF, 'started after', SINCE);

let last = '';
const start = Date.now();
const MAX_MS = 30 * 60 * 1000; // 30 min cap
while (true) {
  const r = await fetch(`${BASE}/api/v1/executions?workflowId=${WF}&limit=3`, {
    headers: { 'X-N8N-API-KEY': KEY, Accept: 'application/json' },
  });
  const j = await r.json();
  const newest = (j.data || []).filter(e => e.startedAt > SINCE)[0];
  const target = newest || j.data?.[0];
  const status = target?.status || 'none';
  const startedAt = target?.startedAt || '';
  const sig = `${target?.id}|${status}`;
  if (sig !== last) {
    const t = new Date().toISOString().slice(11, 19);
    console.log(`[${t}] id=${target?.id} status=${status} started=${startedAt}`);
    last = sig;
  }
  if (newest && (status === 'success' || status === 'error' || status === 'canceled')) {
    console.log('Done:', status);
    process.exit(0);
  }
  if (Date.now() - start > MAX_MS) {
    console.error('Timed out waiting for execution.');
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, 20_000));
}
