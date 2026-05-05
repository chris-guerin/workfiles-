#!/usr/bin/env node
// _build-wf-weeklynews-pg.mjs — rebuild WF-WeeklyNews-PG.
//
// This script is the source of truth for the rebuilt workflow shape.
// Loads the live-pulled JSON, drops the legacy POST /news + Datasette
// chain + WF-15A-PG webhook fire, retunes the trigger to Sunday 11pm,
// and adds a parallel Haiku-extraction branch off Remove Duplicates
// that ends with an append to the Mini_Signals Google Sheet tab.
//
// Branch architecture after Remove Duplicates:
//   A: Haiku chain → Mini_Signals Sheet (feeds Signal Pipeline 15a)
//   B: HIGH/MEDIUM filter → email alert (existing)
//
// Anthropic credential is referenced via predefinedCredentialType —
// no inline x-api-key. Credential id SDCpsCbSvW9KWxdQ ("Anthropic account").
// Sheets credential id 9aQCdF0Uwmy5qHDV ("Google Sheets account 2").

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'workflows', 'wfweeklynewspg.json');
const OUT = SRC; // overwrite in place

const ANTHROPIC_CRED = { id: 'SDCpsCbSvW9KWxdQ', name: 'Anthropic account' };
const SHEETS_CRED = { id: '9aQCdF0Uwmy5qHDV', name: 'Google Sheets account 2' };
const SHEETS_DOC_ID = '1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM';
const MINI_SIGNALS_GID = 1905930997;
const TODAY_NOTE = '2026-05-05';

// Names of nodes to remove
const REMOVE = new Set([
  'POST /news',
  'Fire WF-15A-PG webhook',
  'Code in JavaScript1',
  'Wait',
  'Write to Datasette',
]);

// Read existing Haiku-chain code extracted from WF-15A-PG.json into the
// local scratch JSON. The source-of-record for these code bodies is
// n8n/_haiku_chain_extract.json.
const haiku = JSON.parse(await readFile(join(__dirname, '_haiku_chain_extract.json'), 'utf8'));

// ---------- Code-node bodies, prefixed with the standard 15a-style header ----------
const PREFIX = (name) => `// WeeklyNews — ${name} — ${TODAY_NOTE}\n`;

function mapToCanonicalCode() {
  return PREFIX('Map to Canonical Schema') + haiku['Map to Canonical Schema'].code;
}
function noiseBlocklistCode() {
  return PREFIX('Noise Blocklist + Deduplicate') + haiku['Noise Blocklist + Deduplicate'].code;
}
function buildExtractionPayloadCode() {
  return PREFIX('Build Extraction Payload') + haiku['Build Extraction Payload'].code;
}
function parseValidateCode() {
  return PREFIX('Parse + Validate Mini-Signal') + haiku['Parse + Validate Mini-Signal'].code;
}
function collectMiniSignalsCode() {
  // Adapted from "Collect + Write to Datasette":
  //  - Filter to valid (non-skipped) mini-signals
  //  - Force extracted_at = today (so 15a's filter finds them)
  //  - Emit ONE item per mini-signal so downstream Sheets append writes per-row
  //  - On zero valid, return [] (Sheets append runs zero times)
  return `${PREFIX('Collect Mini-Signals')}// Mode: Run Once for All Items
// Filters Parse + Validate output to valid signals; emits one item per signal
// so the downstream Sheets append writes per-row. extracted_at forced to today
// so Signal Pipeline 15a's Monday-morning filter (extracted_at = today) sees
// the rows. Returns [] when no valid signals — Sheets append then runs zero
// times rather than appending an empty placeholder row.

const all = $('Parse + Validate Mini-Signal').all().map(i => i.json);
const today = new Date().toISOString().slice(0, 10);
const valid = all.filter(s => !s.skip && s.signal_id && s.headline);
if (valid.length === 0) return [];

return valid.map(s => ({
  json: {
    signal_id: s.signal_id,
    extracted_at: today,
    published_date: s.published_date || today,
    source: s.source || '',
    source_type: s.source_type || 'news',
    url: s.url || '',
    headline: s.headline || '',
    companies: s.companies || '',
    technologies: s.technologies || '',
    geography: s.geography || '',
    event_type: s.event_type || 'OTHER',
    value_chain_position: s.value_chain_position || 'UNKNOWN',
    short_summary: s.short_summary || '',
    evidence_snippet: s.evidence_snippet || '',
    content_density: s.content_density ?? 3,
    confidence: s.confidence ?? 0,
    extraction_model: s.extraction_model || 'claude-haiku-4-5-20251001',
    reasoning_classification: '',
    reasoning_at: '',
    hypothesis_matches: '',
    novelty_assessment: '',
    candidate_hypothesis: '',
    pattern_cluster_id: '',
    source_news_id: s.source_news_id || '',
    content_hash: s.content_hash || '',
    _news_sector_tags: s._news_sector_tags || '',
  }
}));`;
}

// ---------- Node builders ----------
function nodeMapToCanonical() {
  return {
    parameters: { jsCode: mapToCanonicalCode(), mode: 'runOnceForEachItem' },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [240, 480],
    id: 'b2e1d09a-0001-4b00-9000-000000000001',
    name: 'Map to Canonical Schema',
  };
}
function nodeNoiseBlocklist() {
  return {
    parameters: { jsCode: noiseBlocklistCode() },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [480, 480],
    id: 'b2e1d09a-0002-4b00-9000-000000000002',
    name: 'Noise Blocklist + Deduplicate',
  };
}
function nodeBuildExtractionPayload() {
  return {
    parameters: { jsCode: buildExtractionPayloadCode(), mode: 'runOnceForEachItem' },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [720, 480],
    id: 'b2e1d09a-0003-4b00-9000-000000000003',
    name: 'Build Extraction Payload',
  };
}
function nodeClaudeHaiku() {
  return {
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'anthropic-version', value: '2023-06-01' },
        ],
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: '={{ $json.request_body }}',
      options: { batching: { batch: { batchSize: 5 } } },
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [960, 480],
    id: 'b2e1d09a-0004-4b00-9000-000000000004',
    name: 'Claude Haiku Extract',
    credentials: { anthropicApi: { id: ANTHROPIC_CRED.id, name: ANTHROPIC_CRED.name } },
  };
}
function nodeParseValidate() {
  return {
    parameters: { jsCode: parseValidateCode(), mode: 'runOnceForEachItem' },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1200, 480],
    id: 'b2e1d09a-0005-4b00-9000-000000000005',
    name: 'Parse + Validate Mini-Signal',
  };
}
function nodeCollectMiniSignals() {
  return {
    parameters: { jsCode: collectMiniSignalsCode() },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1440, 480],
    id: 'b2e1d09a-0006-4b00-9000-000000000006',
    name: 'Collect Mini-Signals',
  };
}
function nodeAppendToSheet() {
  return {
    parameters: {
      operation: 'append',
      documentId: { __rl: true, value: SHEETS_DOC_ID, mode: 'id' },
      sheetName: {
        __rl: true,
        value: MINI_SIGNALS_GID,
        mode: 'list',
        cachedResultName: 'Mini_Signals',
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEETS_DOC_ID}/edit#gid=${MINI_SIGNALS_GID}`,
      },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [] },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.6,
    position: [1680, 480],
    id: 'b2e1d09a-0007-4b00-9000-000000000007',
    name: 'Append to Mini_Signals',
    credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED.id, name: SHEETS_CRED.name } },
  };
}

// ---------- Load + transform ----------
const wf = JSON.parse(await readFile(SRC, 'utf8'));

// 1. Trigger: rename + cron Sunday 11pm
const trig = wf.nodes.find(n => n.type === 'n8n-nodes-base.scheduleTrigger');
if (!trig) throw new Error('schedule trigger not found in source workflow');
trig.name = 'Sunday 11pm Trigger';
trig.parameters = {
  rule: { interval: [{ field: 'cronExpression', expression: '0 23 * * 0' }] }
};

// 2. Drop the 5 obsolete nodes
const oldTriggerName = 'Weekly Monday 7am';
wf.nodes = wf.nodes.filter(n => !REMOVE.has(n.name));

// 3. Add new Haiku branch nodes
const haikuNodes = [
  nodeMapToCanonical(),
  nodeNoiseBlocklist(),
  nodeBuildExtractionPayload(),
  nodeClaudeHaiku(),
  nodeParseValidate(),
  nodeCollectMiniSignals(),
  nodeAppendToSheet(),
];
wf.nodes.push(...haikuNodes);

// 4. Connections — rebuild
//    Old connections from the dropped nodes are removed; the trigger
//    rename means we update the source key for fan-out to RSS feeds.

const newConnections = {};
const triggerName = 'Sunday 11pm Trigger';

// 4a. Trigger → all 14 RSS feeds (carry over from existing fan-out, but
// scrub the dropped nodes if they were ever downstream of the trigger).
const rssNames = wf.nodes
  .filter(n => n.type === 'n8n-nodes-base.rssFeedRead')
  .map(n => n.name);
newConnections[triggerName] = {
  main: [rssNames.map(name => ({ node: name, type: 'main', index: 0 }))],
};

// 4b. Each RSS → Merge All Feeds
for (const name of rssNames) {
  newConnections[name] = { main: [[{ node: 'Merge All Feeds', type: 'main', index: 0 }]] };
}

// 4c. Merge → Detect Companies & Tag → Remove Duplicates
newConnections['Merge All Feeds'] = { main: [[{ node: 'Detect Companies & Tag', type: 'main', index: 0 }]] };
newConnections['Detect Companies & Tag'] = { main: [[{ node: 'Remove Duplicates', type: 'main', index: 0 }]] };

// 4d. Remove Duplicates → BOTH branches (Haiku + Email)
newConnections['Remove Duplicates'] = {
  main: [[
    { node: 'Map to Canonical Schema', type: 'main', index: 0 },
    { node: 'HIGH and MEDIUM Priority', type: 'main', index: 0 },
  ]]
};

// 4e. Email branch (linear)
newConnections['HIGH and MEDIUM Priority'] = { main: [[{ node: 'Build Alert Email', type: 'main', index: 0 }]] };
newConnections['Build Alert Email'] = { main: [[{ node: 'Email Alert to Chris', type: 'main', index: 0 }]] };

// 4f. Haiku branch (linear)
newConnections['Map to Canonical Schema'] = { main: [[{ node: 'Noise Blocklist + Deduplicate', type: 'main', index: 0 }]] };
newConnections['Noise Blocklist + Deduplicate'] = { main: [[{ node: 'Build Extraction Payload', type: 'main', index: 0 }]] };
newConnections['Build Extraction Payload'] = { main: [[{ node: 'Claude Haiku Extract', type: 'main', index: 0 }]] };
newConnections['Claude Haiku Extract'] = { main: [[{ node: 'Parse + Validate Mini-Signal', type: 'main', index: 0 }]] };
newConnections['Parse + Validate Mini-Signal'] = { main: [[{ node: 'Collect Mini-Signals', type: 'main', index: 0 }]] };
newConnections['Collect Mini-Signals'] = { main: [[{ node: 'Append to Mini_Signals', type: 'main', index: 0 }]] };

wf.connections = newConnections;
wf.name = 'WF-WeeklyNews-PG';

await writeFile(OUT, JSON.stringify(wf, null, 2), 'utf8');
console.log('wrote ' + OUT);
console.log('nodes: ' + wf.nodes.length + '  connections: ' + Object.keys(wf.connections).length);
