// One-off: build WF-WeeklyNews-PG workflow JSON from the live source workflow.
// Mutates: rename, deactivate, replace Sheets sink with HTTP POST /news,
// add webhook-fire to WF-15A-PG (placeholder URL until gate 4).
// Disposable — delete after use (gate 3 cleanup).

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC = join(__dirname, 'workflows', 'uOMs2wVL0oGZM29X.json');
const OUT = join(__dirname, 'workflows', 'wf-weeklynews-pg.json');

const API_BASE = 'https://signal-engine-api-production-0cf1.up.railway.app';
const WF15A_WEBHOOK_PLACEHOLDER = 'https://n8n-production-86279.up.railway.app/webhook/wf-15a-trigger';

// Optional: pass --cred-id <id> --cred-name <name> to bake in credential reference.
const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const CRED_ID = argVal('--cred-id');
const CRED_NAME = argVal('--cred-name') || 'signal-engine-api';

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

// Rename + deactivate
src.name = 'WF-WeeklyNews-PG';
src.active = false;

// ---------- swap Log to Signal Tracker for HTTP POST /news ----------
const sheetsIdx = src.nodes.findIndex((n) => n.name === 'Log to Signal Tracker');
if (sheetsIdx < 0) throw new Error('Log to Signal Tracker node not found');
const sheetsNode = src.nodes[sheetsIdx];

const credentialBlock = CRED_ID
  ? { httpHeaderAuth: { id: CRED_ID, name: CRED_NAME } }
  : undefined;

const postNewsNode = {
  parameters: {
    method: 'POST',
    url: `${API_BASE}/news`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: JSON.stringify(
      {
        signal_id: '={{ $json.signal_id }}',
        source: '={{ $json.source }}',
        signal_type: '={{ $json.signal_type }}',
        title: '={{ $json.title }}',
        sector_tags: '={{ $json.sector_tags }}',
        tech_tags: '={{ $json.tech_tags }}',
        geography: '={{ $json.geography }}',
        companies_mentioned: '={{ $json.companies_mentioned }}',
        relevance_score: '={{ $json.relevance_score }}',
        url: '={{ $json.url }}',
        pub_date: '={{ $json.pub_date }}',
      },
      null,
      2
    ),
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.4,
  position: sheetsNode.position,
  id: '11111111-1111-1111-1111-111111111111',
  name: 'POST /news',
  onError: 'continueRegularOutput',
  ...(credentialBlock ? { credentials: credentialBlock } : {}),
};

src.nodes[sheetsIdx] = postNewsNode;

// ---------- add webhook fire to WF-15A-PG (executeOnce) ----------
const fireWebhookNode = {
  parameters: {
    method: 'POST',
    url: WF15A_WEBHOOK_PLACEHOLDER,
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: JSON.stringify({ trigger: 'wf-weeklynews-pg' }),
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.4,
  position: [sheetsNode.position[0] + 220, sheetsNode.position[1]],
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Fire WF-15A-PG webhook',
  executeOnce: true,
  onError: 'continueRegularOutput',
};
src.nodes.push(fireWebhookNode);

// ---------- rewire connections ----------
// Original: Remove Duplicates -> Log to Signal Tracker
//                                            (terminal sink)
// New:      Remove Duplicates -> POST /news -> Fire WF-15A-PG webhook
//                                            (executeOnce, fires once after all POSTs)
const conns = src.connections;
if (conns['Log to Signal Tracker']) {
  delete conns['Log to Signal Tracker'];
}
if (conns['Remove Duplicates']) {
  // Replace 'Log to Signal Tracker' with 'POST /news' as a downstream target
  for (const outputs of conns['Remove Duplicates'].main || []) {
    for (const link of outputs) {
      if (link.node === 'Log to Signal Tracker') link.node = 'POST /news';
    }
  }
}
conns['POST /news'] = {
  main: [
    [{ node: 'Fire WF-15A-PG webhook', type: 'main', index: 0 }],
  ],
};

// ---------- write ----------
await writeFile(OUT, JSON.stringify(src, null, 2), 'utf8');
console.log(`wrote ${OUT}`);
console.log('Name:    ', src.name);
console.log('Active:  ', src.active);
console.log('Nodes:   ', src.nodes.length);
console.log('Cred ID  set?', CRED_ID ? `yes (${CRED_ID})` : 'no — pass --cred-id to bake one in');
