// One-off: fetch most recent failed execution for a workflow, show failing node + error.
// Disposable — delete after use.

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
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const BASE = (process.env.N8N_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
const WF = process.argv[2] || '3yqglVMObKORQ595';

if (!BASE || !KEY) {
  console.error('Missing N8N_BASE_URL or N8N_API_KEY');
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': KEY, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

const list = await api(`/executions?workflowId=${WF}&status=error&limit=1&includeData=true`);
const first = (list.data ?? list)[0];
if (!first) {
  console.log('No failed executions found for this workflow.');
  process.exit(0);
}

const full = first.data ? first : await api(`/executions/${first.id}?includeData=true`);
const data = full.data;

console.log(`Execution: ${full.id}`);
console.log(`Started:   ${full.startedAt}`);
console.log(`Stopped:   ${full.stoppedAt}`);
console.log(`Status:    ${full.status}`);
console.log(`Mode:      ${full.mode}`);
console.log('');

const runData = data?.resultData?.runData || {};
let failedNode = null;
let errObj = null;

for (const [name, runs] of Object.entries(runData)) {
  for (const r of runs) {
    if (r.error) {
      failedNode = name;
      errObj = r.error;
      break;
    }
  }
  if (failedNode) break;
}

const topErr = data?.resultData?.error;

if (failedNode) {
  console.log(`Failed node: ${failedNode}`);
  console.log(`Type:        ${errObj.name || errObj.constructor?.name || '—'}`);
  console.log(`Message:     ${errObj.message}`);
  if (errObj.description) console.log(`Description: ${errObj.description}`);
  if (errObj.httpCode) console.log(`HTTP code:   ${errObj.httpCode}`);
  if (errObj.context) {
    console.log('Context:');
    console.log(JSON.stringify(errObj.context, null, 2).slice(0, 1500));
  }
  if (errObj.stack) {
    console.log('---');
    console.log(String(errObj.stack).slice(0, 2000));
  }
} else if (topErr) {
  console.log('Top-level error:');
  console.log(`Node:    ${topErr.node?.name || '—'}`);
  console.log(`Message: ${topErr.message}`);
  if (topErr.description) console.log(`Description: ${topErr.description}`);
  if (topErr.stack) console.log(String(topErr.stack).slice(0, 2000));
} else {
  console.log('No node-level or top-level error in execution data.');
  console.log('Last node executed:', data?.resultData?.lastNodeExecuted || '—');
}
