// One-off: build WF-15A-PG workflow JSON from the live source workflow.
// Mutates: rename, deactivate, swap Schedule for Webhook trigger, swap Sheets
// reads/writes for HTTP API, add Build POST Body code node and DELETE /news/:id.
// Patches three existing code nodes to thread news_id and content_hash through
// the pipeline so DELETE can target the right news row and POST /mini_signals
// carries provenance + heat_map increments.
// Disposable — delete after use (gate 4 cleanup).

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC = join(__dirname, 'workflows', '1288FlFDvYB3pMXO.json');
const OUT = join(__dirname, 'workflows', 'wf-15a-pg.json');

const API_BASE = 'https://signal-engine-api-production-0cf1.up.railway.app';
const WEBHOOK_PATH = 'wf-15a-trigger';

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const CRED_ID = argVal('--cred-id');
const CRED_NAME = argVal('--cred-name') || 'SIgnal-engine-api';

const credBlock = CRED_ID
  ? { httpHeaderAuth: { id: CRED_ID, name: CRED_NAME } }
  : undefined;

const src = JSON.parse(await readFile(SRC, 'utf8'));

// Strip server-managed fields
delete src.id;
delete src.createdAt;
delete src.updatedAt;
delete src.versionId;
delete src.triggerCount;
delete src.tags;
delete src.shared;
delete src.meta;
delete src.pinData;
delete src.activeVersionId;
delete src.versionCounter;
delete src.activeVersion;
delete src.isArchived;
delete src.description;

src.name = 'WF-15A-PG';
src.active = false;

// ---------- helpers ----------
function findNode(name) {
  const i = src.nodes.findIndex((n) => n.name === name);
  if (i < 0) throw new Error(`Node not found: ${name}`);
  return { i, node: src.nodes[i] };
}

// ---------- 1. Replace Schedule Trigger with Webhook Trigger ----------
const sched = findNode('Schedule Trigger');
const webhookNode = {
  parameters: {
    httpMethod: 'POST',
    path: WEBHOOK_PATH,
    responseMode: 'onReceived',
    options: {},
  },
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: sched.node.position,
  id: 'a1111111-1111-1111-1111-111111111111',
  name: 'Webhook Trigger',
  webhookId: 'a1111111-1111-1111-1111-111111111111',
};
src.nodes[sched.i] = webhookNode;

// ---------- 2. Replace Get News Feeds with GET /news ----------
const getFeeds = findNode('Get News Feeds');
const getNewsNode = {
  parameters: {
    method: 'GET',
    url: `${API_BASE}/news`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.4,
  position: getFeeds.node.position,
  id: 'b2222222-2222-2222-2222-222222222222',
  name: 'GET /news',
  ...(credBlock ? { credentials: credBlock } : {}),
};
src.nodes[getFeeds.i] = getNewsNode;

// ---------- 3. Patch Map to Canonical Schema (thread news_id + content_hash) ----------
const mapNode = findNode('Map to Canonical Schema').node;
const MAP_PATCH = `
    news_id: row.id || null,
    news_content_hash: row.content_hash || null,`;
// Insert news_id/content_hash into the returned object.
mapNode.parameters.jsCode = mapNode.parameters.jsCode.replace(
  /(prescore: 0, prescore_band: 'UNSCORED', fingerprint, skip: false)\s*\}/,
  `$1,${MAP_PATCH}\n  }`
);

// ---------- 4. Patch Parse + Validate (output source_news_id, content_hash, carrier) ----------
const parseNode = findNode('Parse + Validate Mini-Signal').node;
const PARSE_PATCH = `,
    source_news_id: signal.news_id || null,
    content_hash: signal.news_content_hash || null,
    _news_sector_tags: signal.sector_tags || ''`;
parseNode.parameters.jsCode = parseNode.parameters.jsCode.replace(
  /(pattern_cluster_id: null)\s*\n\s*\}\s*\n\s*\};/,
  `$1${PARSE_PATCH}\n  }\n};`
);
// Also ensure skip-paths preserve signal_id minimally (already done in original).

// ---------- 5. Patch Collect + Write to Datasette (preserve carriers in rows) ----------
const collectNode = findNode('Collect + Write to Datasette').node;
const COLLECT_PATCH = `,
  source_news_id: s.source_news_id || null,
  content_hash: s.content_hash || null,
  _news_sector_tags: s._news_sector_tags || ''`;
collectNode.parameters.jsCode = collectNode.parameters.jsCode.replace(
  /(pattern_cluster_id: null)\s*\n\s*\}\)\);/,
  `$1${COLLECT_PATCH}\n}));`
);

// ---------- 6. Add Build POST Body code node (between Split Rows and POST) ----------
const splitRows = findNode('Split Rows');
const buildBodyNode = {
  parameters: {
    jsCode: `// Build POST Body — assemble heat_map_increments and strip carriers
// Mode: Run Once for Each Item
const item = $input.item.json || {};

const split = (s) => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
const companies = split(item.companies);
const sectors = split(item._news_sector_tags);
const signalType = item.event_type || 'OTHER';

const heat_map_increments = [];
if (companies.length && sectors.length) {
  for (const c of companies) for (const s of sectors) {
    heat_map_increments.push({ sector_tag: s, company: c, signal_type: signalType });
  }
}

const { _news_sector_tags, ...miniSignal } = item;
return { json: { ...miniSignal, heat_map_increments } };
`,
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [splitRows.node.position[0] + 220, splitRows.node.position[1]],
  id: 'c3333333-3333-3333-3333-333333333333',
  name: 'Build POST Body',
};
src.nodes.push(buildBodyNode);

// ---------- 7. Replace Write to Mini_Signals with POST /mini_signals ----------
const writeMs = findNode('Write to Mini_Signals');
const postMsNode = {
  parameters: {
    method: 'POST',
    url: `${API_BASE}/mini_signals`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json) }}',
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.4,
  position: writeMs.node.position,
  id: 'd4444444-4444-4444-4444-444444444444',
  name: 'POST /mini_signals',
  onError: 'continueRegularOutput',
  ...(credBlock ? { credentials: credBlock } : {}),
};
src.nodes[writeMs.i] = postMsNode;

// ---------- 8. Add DELETE /news/:id ----------
const deleteNode = {
  parameters: {
    method: 'DELETE',
    url: `=${API_BASE}/news/{{ $('Build POST Body').item.json.source_news_id }}`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.4,
  position: [postMsNode.position[0] + 220, postMsNode.position[1]],
  id: 'e5555555-5555-5555-5555-555555555555',
  name: 'DELETE /news/:id',
  onError: 'continueRegularOutput',
  ...(credBlock ? { credentials: credBlock } : {}),
};
src.nodes.push(deleteNode);

// ---------- 9. Rewire connections ----------
const c = src.connections;

// Schedule Trigger -> Wake Datasette  ==>  Webhook Trigger -> Wake Datasette
delete c['Schedule Trigger'];
c['Webhook Trigger'] = { main: [[{ node: 'Wake Datasette', type: 'main', index: 0 }]] };

// Wake Datasette -> Get News Feeds  ==>  Wake Datasette -> GET /news
c['Wake Datasette'] = { main: [[{ node: 'GET /news', type: 'main', index: 0 }]] };

// Get News Feeds -> Map to Canonical Schema  ==>  GET /news -> Map to Canonical Schema
delete c['Get News Feeds'];
c['GET /news'] = { main: [[{ node: 'Map to Canonical Schema', type: 'main', index: 0 }]] };

// Split Rows -> Write to Mini_Signals  ==>  Split Rows -> Build POST Body
c['Split Rows'] = { main: [[{ node: 'Build POST Body', type: 'main', index: 0 }]] };

// Build POST Body -> POST /mini_signals
c['Build POST Body'] = { main: [[{ node: 'POST /mini_signals', type: 'main', index: 0 }]] };

// POST /mini_signals -> DELETE /news/:id
delete c['Write to Mini_Signals'];
c['POST /mini_signals'] = { main: [[{ node: 'DELETE /news/:id', type: 'main', index: 0 }]] };

// DELETE /news/:id -> WF-15A Summary
c['DELETE /news/:id'] = { main: [[{ node: 'WF-15A Summary', type: 'main', index: 0 }]] };

// ---------- write ----------
await writeFile(OUT, JSON.stringify(src, null, 2), 'utf8');
console.log(`wrote ${OUT}`);
console.log('Name:    ', src.name);
console.log('Active:  ', src.active);
console.log('Nodes:   ', src.nodes.length);
console.log('Cred ID  set?', CRED_ID ? `yes (${CRED_ID})` : 'no — pass --cred-id to bake one in');
console.log('');
console.log('Replaced: Schedule Trigger -> Webhook Trigger (path: ' + WEBHOOK_PATH + ')');
console.log('Replaced: Get News Feeds -> GET /news');
console.log('Replaced: Write to Mini_Signals -> POST /mini_signals');
console.log('Added:    Build POST Body (heat_map_increments assembly)');
console.log('Added:    DELETE /news/:id');
console.log('Patched:  Map to Canonical Schema (threads news_id + content_hash)');
console.log('Patched:  Parse + Validate Mini-Signal (outputs source_news_id, content_hash)');
console.log('Patched:  Collect + Write to Datasette (preserves carriers in rows)');
