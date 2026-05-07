#!/usr/bin/env node
// _build-wf-15b.mjs — assemble Signal Pipeline 15b workflow JSON.
//
// 15b is the scoring + content generation half of the pipeline.
// It picks the single highest-scoring ACT signal from
// signal_horizon_log written by 15a, generates three persona
// emails via Claude, appends one row to the Campaigns Sheet tab,
// and marks the signal processed_by_15b=TRUE.
//
// Linear flow (8 nodes, no branching):
//   1. Monday 6:30am Trigger
//   2. Postgres: Read unprocessed signals  — SELECT WHERE processed=FALSE
//   3. Score and Select Best Signal        — Code; returns [] if no rows
//   4. Build Claude Prompt                 — Code; assembles request_body
//   5. Claude — Generate Campaign Emails   — HTTP, anthropicApi credential
//   6. Parse Response + Build Campaigns Row — Code
//   7. Append to Campaigns Sheet           — googleSheets
//   8. Postgres: Mark Signal Processed     — UPDATE
//
// No inline API keys. No Datasette. Linear; if Node 2 returns
// zero rows the rest of the pipeline skips cleanly.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PG_CRED = { id: 'rgPwSKuC3uXH6fg7', name: 'hypothesis-db Railway PG' };
const ANTHROPIC_CRED = { id: 'SDCpsCbSvW9KWxdQ', name: 'Anthropic account' };
const SHEETS_CRED = { id: '9aQCdF0Uwmy5qHDV', name: 'Google Sheets account 2' };
const SHEETS_DOC_ID = '1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM';
const CAMPAIGNS_GID = 114107193;
const TODAY = '2026-05-05';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';   // per spec — flagged

// ============================================================================
// Node builders
// ============================================================================
function trigger() {
  return {
    parameters: {
      rule: { interval: [{ field: 'cronExpression', expression: '30 6 * * 1' }] }
    },
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [-1280, 240],
    id: 'b9f1c001-0001-4b00-9000-000000000001',
    name: 'Monday 6:30am Trigger',
  };
}

function readUnprocessed() {
  // Returns up to 20 unprocessed ACT signals. n8n emits one item per row.
  // If zero rows: downstream Code node returns [] → pipeline stops cleanly.
  const sql = `SELECT * FROM signal_horizon_log
WHERE processed_by_15b = FALSE
  AND overall_classification = 'ACT'
ORDER BY created_at DESC
LIMIT 20`;
  return {
    parameters: {
      operation: 'executeQuery',
      query: sql,
      options: {},
    },
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [-1040, 240],
    id: 'b9f1c001-0002-4b00-9000-000000000002',
    name: 'Postgres: Read unprocessed signals',
    credentials: { postgres: { id: PG_CRED.id, name: PG_CRED.name } },
  };
}

function scoreAndSelect() {
  const code = `// Signal Pipeline 15b — Score and Select Best Signal — ${TODAY}
// Mode: Run Once for All Items
// Scores each ACT signal and selects the single highest-composite row.
// If input is empty, returns [] so downstream nodes skip cleanly.
//
// Composite formula:
//   composite = (probability_delta * 40)
//             + (best_horizon_score * 35)
//             + (matched_hypothesis_ids.length * 25)
//   ontology_gap penalty: if TRUE, composite *= 0.5
//
// horizon_score per pair:  H2 = 1.0, H1 = 0.6, H3 = 0.4
//   Take the MAX score across all matched pairs in horizon_classifications.

const items = $input.all();
if (!items || items.length === 0) {
  return [];   // Pipeline halts cleanly — no signals to process.
}

function horizonScore(h) {
  if (h === 'H2') return 1.0;
  if (h === 'H1') return 0.6;
  if (h === 'H3') return 0.4;
  return 0;
}

function bestHorizonScore(horizon_classifications) {
  if (!Array.isArray(horizon_classifications) || horizon_classifications.length === 0) return 0;
  let best = 0;
  for (const hc of horizon_classifications) {
    const s = horizonScore(hc && hc.horizon);
    if (s > best) best = s;
  }
  return best;
}

function bestHorizonValue(horizon_classifications) {
  // Return the horizon STRING corresponding to the highest score.
  if (!Array.isArray(horizon_classifications) || horizon_classifications.length === 0) return null;
  let bestH = null, bestScore = -1;
  for (const hc of horizon_classifications) {
    const s = horizonScore(hc && hc.horizon);
    if (s > bestScore) { bestScore = s; bestH = hc && hc.horizon; }
  }
  return bestH;
}

const scored = items.map(it => {
  const r = it.json;
  const pd = typeof r.probability_delta === 'number' ? r.probability_delta : parseFloat(r.probability_delta) || 0;
  const hs = bestHorizonScore(r.horizon_classifications);
  const matchedIds = Array.isArray(r.matched_hypothesis_ids) ? r.matched_hypothesis_ids : [];
  let composite = (pd * 40) + (hs * 35) + (matchedIds.length * 25);
  if (r.ontology_gap === true) composite = composite * 0.5;
  return {
    ...r,
    composite_score: composite,
    horizon_score: hs,
    horizon_top: bestHorizonValue(r.horizon_classifications),
  };
});

scored.sort((a, b) => b.composite_score - a.composite_score);
const best = scored[0];
return [{ json: best }];`;
  return {
    parameters: { jsCode: code, mode: 'runOnceForAllItems' },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-800, 240],
    id: 'b9f1c001-0003-4b00-9000-000000000003',
    name: 'Score and Select Best Signal',
  };
}

function buildClaudePrompt() {
  const code = `// Signal Pipeline 15b — Build Claude Prompt — ${TODAY}
// Mode: Run Once for All Items
// Constructs the request_body for Node 5 from the selected signal.
// Carries the signal payload through so downstream nodes can reference it.

const items = $input.all();
if (!items || items.length === 0) return [];

const r = items[0].json;
const hypLabels = Array.isArray(r.matched_hypothesis_labels)
  ? r.matched_hypothesis_labels.join('; ')
  : '';
const horizonsFmt = Array.isArray(r.horizon_classifications)
  ? r.horizon_classifications.map(hc => {
      const lbl = (hc && hc.pair_label) || '(no pair)';
      const h = (hc && hc.horizon) || '-';
      const t = (hc && hc.trajectory) || '-';
      return lbl + ' — ' + h + ' — ' + t;
    }).join('\\n')
  : '';
const pd = typeof r.probability_delta === 'number'
  ? r.probability_delta
  : parseFloat(r.probability_delta) || 0;

const systemPrompt = \`You are a senior FutureBridge analyst writing outreach emails for energy and mobility clients. Write like Bloomberg Intelligence. Short sentences. No buzzwords. No FutureBridge name in the email body. No generic openers.

Every email follows this 5-part structure:
1. Signal — one sentence, real numbers or named entities
2. Strategy — what this company is doing / their posture
3. Meaning — what this signal means for their business
4. Question — one pointed commercial question
5. CTA — one line, specific next step

Under 120 words per email. Return ONLY valid JSON, no markdown fences, no preamble.\`;

const userPrompt = \`Signal brief:
Title: \${r.signal_title || ''}
Summary: \${r.signal_summary || ''}
Date: \${r.signal_date || ''}
Hypotheses touched: \${hypLabels}
Technology horizon:
\${horizonsFmt}
Probability delta: \${pd}
Ontology gap flag: \${r.ontology_gap === true}

Generate three outreach emails. Return ONLY this JSON:
{
  "topic": "3-5 word topic (no company name)",
  "executive": { "subject": "", "body": "" },
  "strategy":  { "subject": "", "body": "" },
  "tech":      { "subject": "", "body": "" }
}\`;

return [{ json: {
  signal: r,
  request_body: JSON.stringify({
    model: '${CLAUDE_MODEL}',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })
}}];`;
  return {
    parameters: { jsCode: code, mode: 'runOnceForAllItems' },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-560, 240],
    id: 'b9f1c001-0004-4b00-9000-000000000004',
    name: 'Build Claude Prompt',
  };
}

function claudeGenerate() {
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
      options: { timeout: 60000 },
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [-320, 240],
    id: 'b9f1c001-0005-4b00-9000-000000000005',
    name: 'Claude — Generate Campaign Emails',
    credentials: { anthropicApi: { id: ANTHROPIC_CRED.id, name: ANTHROPIC_CRED.name } },
  };
}

function parseAndBuildRow() {
  const code = `// Signal Pipeline 15b — Parse Response + Build Campaigns Row — ${TODAY}
// Mode: Run Once for All Items
// Parses Claude response. If parse fails: throw — do not write a broken row.

const items = $input.all();
if (!items || items.length === 0) return [];

const claudeResp = items[0].json || {};
const signal = $('Build Claude Prompt').first().json.signal || {};

function extractText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload.content) && payload.content[0]) return payload.content[0].text || '';
  return '';
}

const raw = extractText(claudeResp);
const cleaned = String(raw).replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
const start = cleaned.indexOf('{');
const end = cleaned.lastIndexOf('}');
let parsed;
try {
  parsed = JSON.parse(cleaned.slice(start, end + 1));
} catch (e) {
  throw new Error('Claude response did not parse as JSON. Raw (first 400 chars): ' + raw.slice(0, 400));
}
if (!parsed || !parsed.executive || !parsed.strategy || !parsed.tech) {
  throw new Error('Claude response missing executive/strategy/tech fields. Got keys: ' + Object.keys(parsed || {}).join(','));
}

const sigDate = signal.signal_date || new Date().toISOString().slice(0, 10);
const sigIdRaw = signal.signal_id || '';
const idTail = sigIdRaw.length >= 6 ? sigIdRaw.slice(-6) : sigIdRaw;

const row = {
  campaign_id:       'CAMP-' + sigDate + '-' + idTail,
  date:              sigDate,
  hypothesis_ids:    Array.isArray(signal.matched_hypothesis_ids) ? signal.matched_hypothesis_ids.join(', ') : '',
  signal_summary:    String(signal.signal_summary || '').slice(0, 500),
  topic:             parsed.topic || '',
  exec_subject:      parsed.executive.subject || '',
  exec_body:         parsed.executive.body || '',
  strategy_subject:  parsed.strategy.subject || '',
  strategy_body:     parsed.strategy.body || '',
  tech_subject:      parsed.tech.subject || '',
  tech_body:         parsed.tech.body || '',
  status:            'DRAFT',
  best_hyp_id:       (Array.isArray(signal.matched_hypothesis_ids) && signal.matched_hypothesis_ids[0]) || '',
  probability_delta: typeof signal.probability_delta === 'number' ? signal.probability_delta : parseFloat(signal.probability_delta) || 0,
  horizon:           signal.horizon_top || '',
  composite_score:   typeof signal.composite_score === 'number' ? signal.composite_score : parseFloat(signal.composite_score) || 0,
  signal_horizon_log_id: signal.id || null,
};
return [{ json: row }];`;
  return {
    parameters: { jsCode: code, mode: 'runOnceForAllItems' },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-80, 240],
    id: 'b9f1c001-0006-4b00-9000-000000000006',
    name: 'Parse Response + Build Campaigns Row',
  };
}

function appendCampaigns() {
  return {
    parameters: {
      operation: 'append',
      documentId: { __rl: true, value: SHEETS_DOC_ID, mode: 'id' },
      sheetName: {
        __rl: true,
        value: CAMPAIGNS_GID,
        mode: 'list',
        cachedResultName: 'Campaigns',
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEETS_DOC_ID}/edit#gid=${CAMPAIGNS_GID}`,
      },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [] },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.6,
    position: [160, 240],
    id: 'b9f1c001-0007-4b00-9000-000000000007',
    name: 'Append to Campaigns Sheet',
    credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED.id, name: SHEETS_CRED.name } },
  };
}

function markProcessed() {
  // signal_horizon_log_id was preserved on the row built by Node 6.
  // After Sheets append, n8n forwards the same item shape downstream,
  // so $json.signal_horizon_log_id is available here.
  return {
    parameters: {
      operation: 'executeQuery',
      query: 'UPDATE signal_horizon_log SET processed_by_15b = TRUE WHERE id = $1',
      options: { queryReplacement: '={{ $json.signal_horizon_log_id }}' },
    },
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [400, 240],
    id: 'b9f1c001-0008-4b00-9000-000000000008',
    name: 'Postgres: Mark Signal Processed',
    credentials: { postgres: { id: PG_CRED.id, name: PG_CRED.name } },
  };
}

// ============================================================================
// Build node list + linear connections
// ============================================================================
const nodes = [
  trigger(),
  readUnprocessed(),
  scoreAndSelect(),
  buildClaudePrompt(),
  claudeGenerate(),
  parseAndBuildRow(),
  appendCampaigns(),
  markProcessed(),
];

const connections = {};
for (let i = 0; i < nodes.length - 1; i++) {
  connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
}

const workflow = {
  name: 'Signal Pipeline 15b',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  staticData: null,
};

const outPath = join(__dirname, 'workflows', 'wf15b.json');
await writeFile(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('wrote ' + outPath);
console.log('nodes: ' + nodes.length + '  connections: ' + Object.keys(connections).length);
