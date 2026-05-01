// One-off: create a NEW workflow on n8n from a local JSON file.
// sync.js push handles updates only; this handles creates.
// Disposable — delete after gate 3 / gate 4.
//
// Usage:
//   node _create-workflow.mjs <path-to-workflow.json> [--alias <name>]
//
// On success: prints new workflow ID, optionally writes alias to tracked.json.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

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

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('Usage: node _create-workflow.mjs <path-to-workflow.json> [--alias <name>]');
  process.exit(1);
}
const aliasIdx = args.indexOf('--alias');
const alias = aliasIdx >= 0 ? args[aliasIdx + 1] : null;

const wf = JSON.parse(await readFile(file, 'utf8'));

// Sanitise — strip server-managed fields the API rejects
delete wf.id;
delete wf.createdAt;
delete wf.updatedAt;
delete wf.versionId;
delete wf.triggerCount;
delete wf.tags;
delete wf.shared;
delete wf.meta;
delete wf.active; // n8n /workflows POST forbids "active"; activate via PATCH later

// n8n public API POST /workflows is strict about settings — only certain
// keys are accepted. Strip to known-valid subset.
const ALLOWED_SETTINGS_KEYS = ['executionOrder', 'saveDataSuccessExecution', 'saveDataErrorExecution', 'saveManualExecutions', 'saveExecutionProgress', 'timezone', 'errorWorkflow'];
const inSettings = wf.settings || {};
const cleanSettings = {};
for (const k of ALLOWED_SETTINGS_KEYS) {
  if (inSettings[k] !== undefined) cleanSettings[k] = inSettings[k];
}
if (cleanSettings.executionOrder === undefined) cleanSettings.executionOrder = 'v1';

const payload = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: cleanSettings,
  staticData: wf.staticData ?? null,
};

console.log('About to CREATE workflow on n8n:');
console.log('  Name:    ', payload.name);
console.log('  Nodes:   ', payload.nodes.length);
console.log('  Target:  ', BASE);
if (alias) console.log('  Alias:    will write tracked.json[' + alias + '] = <new-id>');
console.log('');

const rl = createInterface({ input: stdin, output: stdout });
const ans = await rl.question('Proceed? [y/N] ');
rl.close();
if (ans.trim().toLowerCase() !== 'y') {
  console.log('Aborted.');
  process.exit(0);
}

const r = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: {
    'X-N8N-API-KEY': KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify(payload),
});

const body = await r.text();
if (!r.ok) {
  console.error(`\nFAILED: HTTP ${r.status}`);
  console.error(body);
  process.exit(1);
}

const created = JSON.parse(body);
const newId = created.id || created.data?.id;
if (!newId) {
  console.error('\nFAILED: response did not contain an ID');
  console.error(body);
  process.exit(1);
}

console.log('');
console.log('Created.');
console.log('  ID:      ', newId);
console.log('  Edit:    ', `${BASE}/workflow/${newId}`);

if (alias) {
  const trackedPath = join(__dirname, 'tracked.json');
  const tracked = existsSync(trackedPath)
    ? JSON.parse(await readFile(trackedPath, 'utf8'))
    : {};
  tracked[alias] = newId;
  await writeFile(trackedPath, JSON.stringify(tracked, null, 2) + '\n', 'utf8');
  console.log(`  tracked.json updated: ${alias} = ${newId}`);
}
