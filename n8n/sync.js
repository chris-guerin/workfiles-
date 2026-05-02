#!/usr/bin/env node
// sync.js — local <-> n8n bridge, multi-workflow aware
//
// Usage:
//   node sync.js list                    List all workflows on n8n with active state
//   node sync.js status                  Show last 5 executions per active workflow, flag failures
//   node sync.js status --since 24h      Only executions in the last N hours (default 24)
//   node sync.js pull <id|alias>         Fetch one workflow, explode Code nodes
//   node sync.js pull --all-tracked      Pull every workflow listed in tracked.json
//   node sync.js diff <id|alias>         Show pending code-node changes vs remote
//   node sync.js push <id|alias>         Backup remote, push if confirmed
//
// Aliases live in tracked.json — friendly names for workflow IDs.
// Layout:
//   n8n/
//   ├── sync.js
//   ├── .env                  (N8N_BASE_URL, N8N_API_KEY)
//   ├── tracked.json          ({ "wf15": "3yqg1VMObKORQ595", ... })
//   ├── workflows/<alias>.json
//   ├── code-nodes/<alias>/<slug>--<id>.js
//   └── backups/<alias>-<timestamp>.json

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- env loader ----------
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

const N8N_BASE_URL = (process.env.N8N_BASE_URL || '').replace(/\/$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY;
const LEGACY_WF15 = process.env.WF15_ID;

if (!N8N_BASE_URL || !N8N_API_KEY) {
  console.error('Missing env. Need N8N_BASE_URL and N8N_API_KEY in .env');
  process.exit(1);
}

const TRACKED_PATH = join(__dirname, 'tracked.json');
const HEADER_MARKER = '// --- code below this line is what runs in n8n ---';

// ---------- tracked.json ----------
async function loadTracked() {
  if (!existsSync(TRACKED_PATH)) {
    const seed = LEGACY_WF15 ? { wf15: LEGACY_WF15 } : {};
    await writeFile(TRACKED_PATH, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
  return JSON.parse(await readFile(TRACKED_PATH, 'utf8'));
}

async function resolveTarget(arg) {
  const tracked = await loadTracked();
  if (!arg) {
    if (tracked.wf15) return { alias: 'wf15', id: tracked.wf15 };
    throw new Error('No target given. Pass an alias or workflow id.');
  }
  if (tracked[arg]) return { alias: arg, id: tracked[arg] };
  return { alias: arg, id: arg };
}

// ---------- helpers ----------
const slug = (s) =>
  String(s || 'unnamed')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function api(method, path, body) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n API ${method} ${path} -> ${res.status} ${res.statusText}\n${text}`);
  }
  return res.json();
}

function nodeFilename(node) {
  const idShort = (node.id || '').slice(0, 6);
  return `${slug(node.name)}--${idShort}.js`;
}

function buildHeader(node) {
  return [
    `// node: ${node.name}`,
    `// id:   ${node.id}`,
    `// type: ${node.type}`,
    HEADER_MARKER,
    '',
  ].join('\n');
}

function stripHeader(raw) {
  const i = raw.indexOf(HEADER_MARKER);
  if (i < 0) return raw;
  return raw.slice(i + HEADER_MARKER.length).replace(/^\r?\n/, '');
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function ageHours(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

// ---------- list ----------
async function list() {
  console.log('Fetching all workflows from n8n...\n');
  const res = await api('GET', '/workflows?limit=250');
  const workflows = res.data ?? res;
  const tracked = await loadTracked();
  const trackedIds = new Set(Object.values(tracked));

  const rows = workflows
    .map((w) => ({
      id: w.id,
      name: w.name,
      active: w.active ? 'ACTIVE' : 'inactive',
      tracked: trackedIds.has(w.id) ? 'tracked' : '',
      updated: fmtTime(w.updatedAt),
    }))
    .sort((a, b) =>
      a.active === b.active ? a.name.localeCompare(b.name) : a.active === 'ACTIVE' ? -1 : 1,
    );

  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  console.log(
    'STATUS    TRACKED   ' + 'NAME'.padEnd(nameW) + '  ID                          UPDATED',
  );
  console.log('-'.repeat(8 + 2 + 8 + 2 + nameW + 2 + 26 + 2 + 20));
  for (const r of rows) {
    console.log(
      r.active.padEnd(8) +
        '  ' +
        r.tracked.padEnd(8) +
        '  ' +
        r.name.padEnd(nameW) +
        '  ' +
        r.id.padEnd(26) +
        '  ' +
        r.updated,
    );
  }
  console.log(
    `\n${rows.length} workflows total. ${rows.filter((r) => r.active === 'ACTIVE').length} active.`,
  );
  console.log('\nTo track a workflow locally, edit tracked.json:  { "alias": "<workflow-id>" }');
}

// ---------- status ----------
async function status(args) {
  let sinceHours = 24;
  const sinceIdx = args.indexOf('--since');
  if (sinceIdx >= 0 && args[sinceIdx + 1]) {
    const v = args[sinceIdx + 1];
    const m = v.match(/^(\d+)([hd])$/);
    if (m) sinceHours = parseInt(m[1], 10) * (m[2] === 'd' ? 24 : 1);
    else sinceHours = parseInt(v, 10) || 24;
  }

  console.log(`Pipeline status — executions in the last ${sinceHours}h\n`);
  const res = await api('GET', '/workflows?limit=250&active=true');
  const active = res.data ?? res;

  if (active.length === 0) {
    console.log('No active workflows.');
    return;
  }

  const sinceMs = Date.now() - sinceHours * 3_600_000;
  const summary = [];

  for (const wf of active) {
    try {
      const ex = await api('GET', `/executions?workflowId=${wf.id}&limit=10&includeData=false`);
      const all = ex.data ?? ex;
      const runs = all
        .map((r) => ({
          id: r.id,
          startedAt: r.startedAt,
          stoppedAt: r.stoppedAt,
          finished: r.finished,
          status: r.status || (r.finished ? 'success' : 'running'),
          mode: r.mode,
        }))
        .filter((r) => new Date(r.startedAt).getTime() >= sinceMs);

      const last = all[0];
      summary.push({
        name: wf.name,
        id: wf.id,
        runsInWindow: runs.length,
        lastRun: last ? fmtTime(last.startedAt) : '—',
        lastStatus: last ? last.status || (last.finished ? 'success' : 'running') : 'never',
        lastAge: last ? ageHours(last.startedAt) : Infinity,
        recentFails: runs.filter((r) => r.status === 'error').length,
      });
    } catch (err) {
      summary.push({
        name: wf.name,
        id: wf.id,
        runsInWindow: 0,
        lastRun: 'API error',
        lastStatus: 'unknown',
        lastAge: Infinity,
        recentFails: 0,
        error: err.message,
      });
    }
  }

  const nameW = Math.max(4, ...summary.map((s) => s.name.length));
  console.log(
    'FLAG   ' +
      'WORKFLOW'.padEnd(nameW) +
      '  RUNS  LAST STATUS    LAST RUN              FAILS',
  );
  console.log('-'.repeat(7 + nameW + 2 + 6 + 2 + 14 + 2 + 22 + 2 + 6));

  for (const s of summary.sort((a, b) => a.lastAge - b.lastAge)) {
    let flag = ' ok';
    if (s.lastStatus === 'error') flag = 'FAIL';
    else if (s.runsInWindow === 0) flag = 'STALE';
    else if (s.recentFails > 0) flag = 'WARN';

    console.log(
      flag.padEnd(7) +
        s.name.padEnd(nameW) +
        '  ' +
        String(s.runsInWindow).padStart(4) +
        '  ' +
        s.lastStatus.padEnd(13) +
        '  ' +
        s.lastRun.padEnd(22) +
        '  ' +
        String(s.recentFails).padStart(5),
    );
  }

  const stale = summary.filter((s) => s.runsInWindow === 0);
  const failed = summary.filter((s) => s.lastStatus === 'error');
  console.log('');
  if (failed.length) console.log(`FAIL: ${failed.length} workflow(s) — last run errored.`);
  if (stale.length) console.log(`STALE: ${stale.length} workflow(s) — no run in window.`);
  if (!failed.length && !stale.length) console.log('All active workflows ran cleanly in window.');
}

// ---------- pull ----------
async function pull(target) {
  const { alias, id } = target;
  console.log(`Pulling "${alias}" (${id}) from ${N8N_BASE_URL}...`);
  const wf = await api('GET', `/workflows/${id}`);

  const workflowPath = join(__dirname, 'workflows', `${alias}.json`);
  const nodesDir = join(__dirname, 'code-nodes', alias);
  await mkdir(dirname(workflowPath), { recursive: true });
  await mkdir(nodesDir, { recursive: true });

  await writeFile(workflowPath, JSON.stringify(wf, null, 2), 'utf8');
  console.log(`  workflow -> workflows/${alias}.json`);

  let codeCount = 0;
  for (const node of wf.nodes ?? []) {
    if (node.type === 'n8n-nodes-base.code' && typeof node.parameters?.jsCode === 'string') {
      const filename = nodeFilename(node);
      const filepath = join(nodesDir, filename);
      await writeFile(filepath, buildHeader(node) + node.parameters.jsCode, 'utf8');
      console.log(`  code node -> code-nodes/${alias}/${filename}`);
      codeCount++;
    }
  }
  console.log(`Done. ${wf.nodes?.length ?? 0} total nodes, ${codeCount} code nodes exploded.\n`);
}

async function pullAllTracked() {
  const tracked = await loadTracked();
  const aliases = Object.keys(tracked);
  if (aliases.length === 0) {
    console.error('No workflows tracked. Edit tracked.json first.');
    return;
  }
  console.log(`Pulling ${aliases.length} tracked workflow(s)...\n`);
  for (const alias of aliases) {
    await pull({ alias, id: tracked[alias] });
  }
}

// ---------- diff ----------
async function rebuildLocal(target) {
  const { alias } = target;
  const workflowPath = join(__dirname, 'workflows', `${alias}.json`);
  const nodesDir = join(__dirname, 'code-nodes', alias);
  if (!existsSync(workflowPath)) {
    throw new Error(`No local workflow at ${workflowPath}. Run 'pull ${alias}' first.`);
  }
  const wf = JSON.parse(await readFile(workflowPath, 'utf8'));
  for (const node of wf.nodes ?? []) {
    if (node.type !== 'n8n-nodes-base.code') continue;
    const filepath = join(nodesDir, nodeFilename(node));
    if (!existsSync(filepath)) continue;
    const raw = await readFile(filepath, 'utf8');
    node.parameters.jsCode = stripHeader(raw);
  }
  return wf;
}

async function diff(target) {
  const { alias, id } = target;
  const local = await rebuildLocal(target);
  const remote = await api('GET', `/workflows/${id}`);

  const changes = [];
  const remoteById = new Map((remote.nodes ?? []).map((n) => [n.id, n]));

  for (const lNode of local.nodes ?? []) {
    if (lNode.type !== 'n8n-nodes-base.code') continue;
    const rNode = remoteById.get(lNode.id);
    if (!rNode) {
      changes.push(`+ new code node not on remote: ${lNode.name}`);
      continue;
    }
    const lCode = lNode.parameters?.jsCode || '';
    const rCode = rNode.parameters?.jsCode || '';
    if (lCode !== rCode) {
      const lLines = lCode.split('\n').length;
      const rLines = rCode.split('\n').length;
      const delta = lLines - rLines;
      const sign = delta >= 0 ? `+${delta}` : `${delta}`;
      changes.push(`~ ${lNode.name}  (${rLines} -> ${lLines} lines, ${sign})`);
    }
  }

  if (changes.length === 0) {
    console.log(`No code-node changes vs remote for "${alias}".`);
  } else {
    console.log(`${changes.length} change(s) pending on "${alias}":`);
    for (const c of changes) console.log(`  ${c}`);
  }
  return { local, remote, changes };
}

// ---------- push ----------
async function push(target) {
  const { alias, id } = target;
  const { local, remote, changes } = await diff(target);
  if (changes.length === 0) {
    console.log('Nothing to push.');
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(`\nPush ${changes.length} change(s) to "${alias}"? [y/N] `);
  rl.close();
  if (ans.trim().toLowerCase() !== 'y') {
    console.log('Aborted.');
    return;
  }

  const backupDir = join(__dirname, 'backups');
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `${alias}-${stamp}.json`);
  await writeFile(backupPath, JSON.stringify(remote, null, 2), 'utf8');
  console.log(`  backup -> backups/${alias}-${stamp}.json`);

  // n8n public API rejects extra settings properties on PUT — strip to known-valid subset.
  const ALLOWED_SETTINGS_KEYS = ['executionOrder', 'saveDataSuccessExecution', 'saveDataErrorExecution', 'saveManualExecutions', 'saveExecutionProgress', 'timezone', 'errorWorkflow'];
  const cleanSettings = {};
  for (const k of ALLOWED_SETTINGS_KEYS) {
    if (local.settings?.[k] !== undefined) cleanSettings[k] = local.settings[k];
  }
  if (cleanSettings.executionOrder === undefined) cleanSettings.executionOrder = 'v1';

  const payload = {
    name: local.name,
    nodes: local.nodes,
    connections: local.connections,
    settings: cleanSettings,
    staticData: local.staticData ?? null,
  };

  console.log('Pushing...');
  await api('PUT', `/workflows/${id}`, payload);
  console.log('  pushed.');
  console.log('Re-pulling to confirm round-trip...');
  await pull(target);
}

// ---------- entry ----------
const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'list') await list();
  else if (cmd === 'status') await status(rest);
  else if (cmd === 'pull' && rest[0] === '--all-tracked') await pullAllTracked();
  else if (cmd === 'pull') await pull(await resolveTarget(rest[0]));
  else if (cmd === 'diff') await diff(await resolveTarget(rest[0]));
  else if (cmd === 'push') await push(await resolveTarget(rest[0]));
  else {
    console.error('Usage:');
    console.error('  node sync.js list');
    console.error('  node sync.js status [--since 24h]');
    console.error('  node sync.js pull <alias|id>');
    console.error('  node sync.js pull --all-tracked');
    console.error('  node sync.js diff <alias|id>');
    console.error('  node sync.js push <alias|id>');
    process.exit(1);
  }
} catch (err) {
  console.error('\nError:', err.message);
  process.exit(1);
}
