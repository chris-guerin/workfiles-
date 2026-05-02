// One-off: PUT a local workflow JSON to its remote n8n workflow ID.
// sync.js push only triggers on code-node changes; this lets us push
// HTTP/webhook node parameter changes too.
// Disposable.
//
// Usage:
//   node _put-workflow.mjs <alias-or-id> <path-to-local-json>

import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

const [aliasOrId, file] = process.argv.slice(2);
if (!aliasOrId || !file) {
  console.error('Usage: node _put-workflow.mjs <alias-or-id> <path-to-local-json>');
  process.exit(1);
}

const tracked = JSON.parse(await readFile(join(__dirname, 'tracked.json'), 'utf8'));
const id = tracked[aliasOrId] || aliasOrId;

// Backup remote first
const r = await fetch(`${BASE}/api/v1/workflows/${id}`, {
  headers: { 'X-N8N-API-KEY': KEY, Accept: 'application/json' },
});
if (!r.ok) {
  console.error(`Failed to fetch remote: ${r.status} ${await r.text()}`);
  process.exit(1);
}
const remote = await r.json();
const backupDir = join(__dirname, 'backups');
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `${aliasOrId}-${stamp}.json`);
await writeFile(backupPath, JSON.stringify(remote, null, 2), 'utf8');
console.log(`backup -> n8n/backups/${aliasOrId}-${stamp}.json`);

const local = JSON.parse(await readFile(file, 'utf8'));

// Strip server-managed fields
delete local.id;
delete local.createdAt;
delete local.updatedAt;
delete local.versionId;
delete local.triggerCount;
delete local.tags;
delete local.shared;
delete local.meta;
delete local.pinData;
delete local.activeVersionId;
delete local.versionCounter;
delete local.activeVersion;
delete local.isArchived;
delete local.description;
delete local.active; // n8n PUT may forbid; activation managed separately

const ALLOWED_SETTINGS_KEYS = ['executionOrder', 'saveDataSuccessExecution', 'saveDataErrorExecution', 'saveManualExecutions', 'saveExecutionProgress', 'timezone', 'errorWorkflow'];
const inSettings = local.settings || {};
const cleanSettings = {};
for (const k of ALLOWED_SETTINGS_KEYS) {
  if (inSettings[k] !== undefined) cleanSettings[k] = inSettings[k];
}
if (cleanSettings.executionOrder === undefined) cleanSettings.executionOrder = 'v1';

const payload = {
  name: local.name,
  nodes: local.nodes,
  connections: local.connections,
  settings: cleanSettings,
  staticData: local.staticData ?? null,
};

console.log(`PUT ${BASE}/api/v1/workflows/${id}`);
console.log(`  name:  ${payload.name}`);
console.log(`  nodes: ${payload.nodes.length}`);

const put = await fetch(`${BASE}/api/v1/workflows/${id}`, {
  method: 'PUT',
  headers: {
    'X-N8N-API-KEY': KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify(payload),
});
const txt = await put.text();
if (!put.ok) {
  console.error(`FAILED: ${put.status}`);
  console.error(txt);
  process.exit(1);
}
console.log('SUCCESS — pushed.');
