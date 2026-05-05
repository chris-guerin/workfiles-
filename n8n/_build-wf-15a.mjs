#!/usr/bin/env node
// _build-wf-15a.mjs — assemble Signal Pipeline 15a workflow JSON.
//
// 15a is the signal-ingestion + hypothesis-matching half of the pipeline.
// It ends with an enriched output object ready for 15b to consume.
// It does NOT score, select, generate content, or write to Signal Tracker.
//
// Linear flow:
//   1.  Schedule Trigger (Monday 6am — weekly)
//   2.  Prepare Today                       — Code
//   3.  Read Today's Mini-Signals           — Google Sheets (kept)
//   4.  Postgres: Shell Hypotheses          — PG node (replaces Sheet HTTP)
//   5.  Build Classification Context        — Code (rewritten for PG)
//   6.  Combine Payload for Claude          — Code
//   7.  Claude — Classify Signals           — HTTP (kept)
//   8.  Parse Classification                — Code
//   9.  Match Signals to Shell Hypotheses   — Code (keyword overlap)
//   10. Postgres: Ontology Enrichment       — PG node (horizon by pair_id)
//   11. Build 15a Output                    — Code (ACT + gap filter, 15a schema)
//   12. Postgres: Insert into signal_horizon_log — PG node (15a → 15b handoff)
//
// 2026-05-05 second pass: replaced the Append-to-Signal_Pipeline_Queue
// Google Sheets node with a Postgres insert into signal_horizon_log
// (migration 015). The Sheet handoff is gone; 15b reads from PG.
//
// Output local file is gitignored (n8n/workflows/) because the legacy
// "Claude — Classify Signals" node carries an inline x-api-key. Code nodes
// (under n8n/code-nodes/<id>/) are committed.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PG_CRED_ID = 'rgPwSKuC3uXH6fg7';     // hypothesis-db Railway PG (created 2026-05-05)
const PG_CRED_NAME = 'hypothesis-db Railway PG';
const SHEETS_CRED_ID = '9aQCdF0Uwmy5qHDV'; // Google Sheets account 2 (existing)
const SHEETS_DOC_ID = '1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM';
const MINI_SIGNALS_GID = 1905930997;
const TODAY = '2026-05-05';

// ---------- Load existing workflow for the legacy nodes we're keeping ----------
const oldPath = join(__dirname, 'workflows', '3yqglVMObKORQ595.json');
const old = JSON.parse(await readFile(oldPath, 'utf8'));
const byName = Object.fromEntries(old.nodes.map(n => [n.name, n]));

// ---------- Node builders ----------
function trigger() {
  return {
    parameters: {
      rule: {
        interval: [{ field: 'cronExpression', expression: '0 6 * * 1' }] // Mondays 06:00 UTC
      }
    },
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [-1408, 224],
    id: 'a1d0c08a-0001-4b00-9000-000000000001',
    name: 'Monday 6am Trigger',
  };
}

function prepareToday() {
  const code = `// Signal Pipeline 15a — Prepare Today — ${TODAY}
// Compute today's date for downstream filters.
const today = new Date().toISOString().slice(0, 10);
return [{ json: { today, run_label: 'Signal Pipeline 15a' } }];`;
  return {
    parameters: { jsCode: code },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-1184, 224],
    id: 'a1d0c08a-0002-4b00-9000-000000000002',
    name: 'Prepare Today',
  };
}

function readMiniSignals() {
  return {
    parameters: {
      documentId: { __rl: true, value: SHEETS_DOC_ID, mode: 'id' },
      sheetName: {
        __rl: true,
        value: MINI_SIGNALS_GID,
        mode: 'list',
        cachedResultName: 'Mini_Signals',
        cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEETS_DOC_ID}/edit#gid=${MINI_SIGNALS_GID}`,
      },
      filtersUI: {
        values: [{
          lookupColumn: 'extracted_at',
          lookupValue: '={{ $(\'Prepare Today\').first().json.today }}'
        }]
      },
      options: {},
    },
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.6,
    position: [-960, 224],
    id: 'a1d0c08a-0003-4b00-9000-000000000003',
    name: "Read Today's Mini-Signals",
    credentials: {
      googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: 'Google Sheets account 2' }
    },
  };
}

function postgresShellHypotheses() {
  // Adapted from spec to live schema:
  //   * initiative_assumptions has no assumption_code/component_id and is empty.
  //   * Pivot to initiatives_v2 — each Shell initiative IS a hypothesis.
  //   * Coin hypothesis_id = 'SHELL_' || LPAD(i.id::text, 3, '0')
  // Returns 1 row per (initiative × component × pair). 9 distinct hypotheses,
  // ~64 rows for Shell as of 2026-05-05.
  const sql = `SELECT
  'SHELL_' || LPAD(i.id::text, 3, '0') AS hypothesis_id,
  i.name                               AS hypothesis_label,
  i.name                               AS initiative_name,
  c.name                               AS component_name,
  cpl.pair_id,
  tap.pair_label,
  tap.horizon,
  tap.confidence_band,
  tap.trajectory,
  tap.hard_evidence_count
FROM initiatives_v2 i
JOIN companies co ON co.id = i.company_id
LEFT JOIN components c ON c.initiative_id = i.id
LEFT JOIN component_pair_links cpl ON cpl.component_id = c.id
LEFT JOIN technology_application_pairs tap ON tap.id = cpl.pair_id
WHERE co.name = 'Shell'
ORDER BY i.id, c.id, cpl.pair_id`;
  return {
    parameters: {
      operation: 'executeQuery',
      query: sql,
      options: {},
    },
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [-720, 224],
    id: 'a1d0c08a-0004-4b00-9000-000000000004',
    name: 'Postgres: Shell Hypotheses',
    credentials: {
      postgres: { id: PG_CRED_ID, name: PG_CRED_NAME }
    },
  };
}

function buildClassificationContext() {
  const code = `// Signal Pipeline 15a — Build Classification Context — ${TODAY}
// Aggregate the per-(initiative,component,pair) PG rows into one entry per
// distinct Shell hypothesis. Each entry carries label + topical keywords
// (initiative name + component names + pair labels) used by the matching
// stage downstream. The Claude classifier sees a compact list of hypothesis
// IDs + labels; matching by overlap is done in code, not by the LLM.

const rows = $('Postgres: Shell Hypotheses').all().map(i => i.json);

const byId = new Map();
for (const r of rows) {
  if (!byId.has(r.hypothesis_id)) {
    byId.set(r.hypothesis_id, {
      hypothesis_id: r.hypothesis_id,
      hypothesis_label: r.hypothesis_label,
      initiative_name: r.initiative_name,
      components: new Set(),
      pair_ids: new Set(),
      pair_labels: new Set(),
    });
  }
  const h = byId.get(r.hypothesis_id);
  if (r.component_name) h.components.add(r.component_name);
  if (r.pair_id !== null && r.pair_id !== undefined) h.pair_ids.add(r.pair_id);
  if (r.pair_label) h.pair_labels.add(r.pair_label);
}

const hypotheses = Array.from(byId.values()).map(h => ({
  hypothesis_id: h.hypothesis_id,
  hypothesis_label: h.hypothesis_label,
  initiative_name: h.initiative_name,
  components: Array.from(h.components),
  pair_ids: Array.from(h.pair_ids),
  pair_labels: Array.from(h.pair_labels),
}));

const today = $('Prepare Today').first().json.today;

return [{
  json: {
    today,
    hyp_count: hypotheses.length,
    hypotheses,
    // Compact list for the classification prompt — Claude sees IDs + labels only.
    hyp_summary_str: hypotheses.map(h => h.hypothesis_id + ': ' + h.hypothesis_label).join('\\n'),
  }
}];`;
  return {
    parameters: { jsCode: code },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-480, 224],
    id: 'a1d0c08a-0005-4b00-9000-000000000005',
    name: 'Build Classification Context',
  };
}

function combinePayloadForClaude() {
  // Slim version of the legacy combine-payload, oriented around the 9 PG-sourced
  // Shell hypotheses (not the 80+ legacy IOC portfolio).
  const code = `// Signal Pipeline 15a — Combine Payload for Claude — ${TODAY}
// Batch signals into payloads of <=10 each; system prompt instructs Claude
// to return overall_classification + Claude-suggested probability_delta only.
// Hypothesis matching is done downstream in code, not by Claude.

const ctx = $('Build Classification Context').first().json || {};
const today = ctx.today || new Date().toISOString().slice(0, 10);
const hypList = ctx.hyp_summary_str || '';

const signals = $('Read Today\\'s Mini-Signals').all().map(i => i.json).filter(s => s.signal_id && s.headline);

if (signals.length === 0) {
  return [{ json: { no_signals: true, reason: 'No mini-signals for ' + today, today } }];
}

const systemPrompt = \`You are a signal classification engine for FutureBridge Advisory.

For each signal, return a JSON object inside an array. No preamble. No explanation. JSON only.

SHELL HYPOTHESES (full list — only these IDs are valid):
\${hypList}

CLASSIFICATION RULES
ACT     = threshold crossing or displacement event for one or more Shell hypotheses
WATCH   = material movement on one or more hypotheses, but no threshold crossed
IGNORE  = no Shell hypothesis materially moved; or no relevance

For each signal, output:
{
  "signal_id": "",
  "overall_classification": "ACT|WATCH|IGNORE",
  "probability_delta": 0,
  "rationale": "<= 1 sentence"
}

Return a JSON array. No markdown.\`;

const batchSize = 10;
const batches = [];
for (let i = 0; i < signals.length; i += batchSize) batches.push(signals.slice(i, i + batchSize));

return batches.map((batch, idx) => {
  const batchMessage = 'Classify these ' + batch.length + ' signals against the Shell hypothesis list above.\\n\\n' +
    batch.map((s, i) => 'SIGNAL ' + (i+1) +
      '\\nID: ' + (s.signal_id || '') +
      '\\nHeadline: ' + (s.headline || '') +
      '\\nSource: ' + (s.source || '') +
      '\\nDate: ' + (s.published_date || '') +
      '\\nCompanies: ' + (s.companies || '') +
      '\\nTechnologies: ' + (s.technologies || '') +
      '\\nGeography: ' + (s.geography || '') +
      '\\nSummary: ' + (s.short_summary || '') +
      '\\nEvidence: ' + (s.evidence_snippet || '')
    ).join('\\n---\\n');

  return { json: {
    batch_index: idx,
    batch_size: batch.length,
    signals: batch,
    request_body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: batchMessage }]
    })
  }};
});`;
  return {
    parameters: { jsCode: code },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-240, 224],
    id: 'a1d0c08a-0006-4b00-9000-000000000006',
    name: 'Combine Payload for Claude',
  };
}

function claudeClassify() {
  // Reuse the existing node verbatim — preserves the inline x-api-key as deployed.
  // Migration to anthropicApi credential is out of scope for this build (flagged
  // in the run report as a separate fix).
  const existing = byName['Claude — Classify Signals'];
  return {
    ...existing,
    position: [0, 224],
    id: 'a1d0c08a-0007-4b00-9000-000000000007',
  };
}

function parseClassification() {
  const code = `// Signal Pipeline 15a — Parse Classification — ${TODAY}
// Parse Claude's batch responses. Each batch returns a JSON array of
// {signal_id, overall_classification, probability_delta, rationale}.
// Flatten to a single results array and attach the original signal payload
// so downstream nodes can do keyword-overlap matching against PG hypotheses.

function extractText(resp) {
  if (!resp) return '';
  if (Array.isArray(resp.content) && resp.content[0]) return resp.content[0].text || '';
  if (typeof resp === 'string') return resp;
  return '';
}

function extractJsonArray(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

const all = $input.all();
const results = [];

for (const batchItem of all) {
  const claudeResp = batchItem.json || {};
  const arr = extractJsonArray(extractText(claudeResp));
  if (!arr) {
    results.push({ parse_error: true, raw: extractText(claudeResp).slice(0, 200) });
    continue;
  }
  // Re-attach original signal payload by signal_id (the batch payload
  // exposes \`signals\` upstream; we look that up).
  // The batch index isn't directly knowable from $input here, so we resolve
  // signal payloads by walking all upstream batches.
  for (const r of arr) results.push(r);
}

// Pull all signal payloads from the batches upstream
const batches = $('Combine Payload for Claude').all().map(i => i.json || {});
const signalById = new Map();
for (const b of batches) {
  for (const s of (b.signals || [])) {
    if (s && s.signal_id) signalById.set(s.signal_id, s);
  }
}

// Attach signal payload to each classification result
const enriched = results.map(r => ({
  ...r,
  signal: signalById.get(r.signal_id) || null,
}));

const today = $('Prepare Today').first().json.today;

return [{
  json: {
    today,
    results: enriched,
    signal_count: enriched.length,
    act_count: enriched.filter(r => r.overall_classification === 'ACT').length,
    watch_count: enriched.filter(r => r.overall_classification === 'WATCH').length,
    ignore_count: enriched.filter(r => r.overall_classification === 'IGNORE').length,
    parse_error_count: enriched.filter(r => r.parse_error).length,
  }
}];`;
  return {
    parameters: { jsCode: code },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [240, 224],
    id: 'a1d0c08a-0008-4b00-9000-000000000008',
    name: 'Parse Classification',
  };
}

function matchSignalsToHypotheses() {
  // Keyword/topic overlap matching — code-based, not LLM. For each signal,
  // compute the set of Shell hypotheses whose keyword bag overlaps with the
  // signal's text bag above a threshold. Returns one item per matched signal,
  // with matched_hypothesis_ids and matched_pair_ids arrays.
  const code = `// Signal Pipeline 15a — Match Signals to Shell Hypotheses — ${TODAY}
// Code-based keyword overlap: not LLM. Each Shell hypothesis's keyword bag
// is built from its initiative name, component names, and pair labels.
// A signal matches if it shares >=2 distinct content tokens (after stop-word
// stripping) OR >=1 high-weight domain token (LNG, CCS, hydrogen, SAF, EV,
// offshore wind, etc.).

const STOP = new Set(('a an the and or of for to in on at by from with as is are was were be been being '+
  'shell company industry industrial market technology global european european-european nw ' +
  'including via includes initial new high low medium short long').split(/\\s+/));

const HIGH_WEIGHT = new Set([
  'ccs','ccus','co2','carbon','capture','sequestration','storage','northern','lights','quest',
  'hydrogen','h2','blue','green','electrolysis','electrolyser','pem','alkaline','smr','atr',
  'lng','gas','liquefied','natural','fsru',
  'saf','aviation','jet','hefa','atj','pt-l','ptl','refueleu',
  'ev','charging','electric','vehicle','recharge','nacs','ccs','combo',
  'offshore','wind','floating','hywind','hornsea','scotwind','vattenfall','equinor',
  'brazil','deepwater','lula','offshore','presalt',
  'namibia','orange','basin','exploration',
  'chemical','chemicals','pernis','performance','specialty',
  'refining','refinery','ammonia','steel','dri','cement',
  'eor','enhanced','recovery','45q','45v','cbam','ets','hyd-bank','hydrogenbank',
  'iea','ieaghg','iea-hydrogen'
]);

function tokenise(text) {
  if (!text) return [];
  return String(text).toLowerCase()
    .replace(/[^a-z0-9\\s_-]/g, ' ')
    .split(/[\\s_-]+/)
    .filter(t => t.length >= 2 && !STOP.has(t));
}

function keywordsForHypothesis(h) {
  const blob = [h.hypothesis_label, h.initiative_name, ...(h.components||[]), ...(h.pair_labels||[])].join(' ');
  return new Set(tokenise(blob));
}

function tokensForSignal(s) {
  const blob = [s.headline, s.short_summary, s.companies, s.technologies, s.geography, s.evidence_snippet].join(' ');
  return new Set(tokenise(blob));
}

const ctx = $('Build Classification Context').first().json || {};
const hypotheses = (ctx.hypotheses || []).map(h => ({ ...h, keywords: keywordsForHypothesis(h) }));
const parsed = $input.first().json || {};
const results = parsed.results || [];

const out = [];
for (const r of results) {
  const s = r.signal;
  if (!s) {
    out.push({ json: { ...r, matched_hypothesis_ids: [], matched_pair_ids: [], match_diagnostics: 'no_signal_payload' } });
    continue;
  }
  const sigTokens = tokensForSignal(s);
  const matches = [];
  for (const h of hypotheses) {
    let overlap = 0;
    let highWeightHits = 0;
    for (const t of sigTokens) {
      if (h.keywords.has(t)) {
        overlap++;
        if (HIGH_WEIGHT.has(t)) highWeightHits++;
      }
    }
    if (overlap >= 2 || highWeightHits >= 1) {
      matches.push({ hypothesis_id: h.hypothesis_id, hypothesis_label: h.hypothesis_label,
                     pair_ids: h.pair_ids, overlap, highWeightHits });
    }
  }
  out.push({
    json: {
      ...r,
      matched_hypothesis_ids: matches.map(m => m.hypothesis_id),
      matched_hypothesis_labels: matches.map(m => m.hypothesis_label),
      matched_pair_ids_per_hypothesis: matches.map(m => ({ hypothesis_id: m.hypothesis_id, pair_ids: m.pair_ids })),
      all_matched_pair_ids: Array.from(new Set(matches.flatMap(m => m.pair_ids))),
      match_diagnostics: matches.map(m => ({ hyp: m.hypothesis_id, overlap: m.overlap, high: m.highWeightHits })),
    }
  });
}

return out;`;
  return {
    parameters: { jsCode: code },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [480, 224],
    id: 'a1d0c08a-0009-4b00-9000-000000000009',
    name: 'Match Signals to Shell Hypotheses',
  };
}

function postgresOntologyEnrichment() {
  // Per the spec: pulls horizon context for ALL pair_ids referenced by any
  // matched signal in this run. Returns ALL relevant pair rows in a single
  // query. Downstream Build 15a Output joins back per-signal.
  const sql = `SELECT
  tap.id          AS pair_id,
  tap.pair_label,
  tap.horizon,
  tap.confidence_band,
  tap.trajectory,
  tap.hard_evidence_count
FROM technology_application_pairs tap
WHERE tap.id = ANY($1::int[])`;
  return {
    parameters: {
      operation: 'executeQuery',
      query: sql,
      options: {
        queryReplacement:
          // Build the pair_ids array from all matched signals (unique).
          // n8n PG node accepts $1 as a positional parameter via queryReplacement.
          // Expression aggregates upstream items.
          '={{ Array.from(new Set($input.all().flatMap(i => i.json.all_matched_pair_ids || []))) }}'
      },
    },
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [720, 224],
    id: 'a1d0c08a-000a-4b00-9000-00000000000a',
    name: 'Postgres: Ontology Enrichment',
    credentials: {
      postgres: { id: PG_CRED_ID, name: PG_CRED_NAME }
    },
  };
}

function build15aOutput() {
  const code = `// Signal Pipeline 15a — Build 15a Output — ${TODAY}
// For each matched signal: assemble the per-spec output schema, compute
// ontology_gap, apply ACT + gap filter (skip non-ACT; skip ACT where ALL
// matched hypotheses have gap; pass mixed and flag).

const matchedItems = $('Match Signals to Shell Hypotheses').all().map(i => i.json);
const enrichmentRows = $('Postgres: Ontology Enrichment').all().map(i => i.json);
const pairById = new Map(enrichmentRows.map(r => [r.pair_id, r]));

const out = [];
for (const m of matchedItems) {
  if (m.parse_error) continue;
  const overall = (m.overall_classification || '').toUpperCase();

  // Filter rule 1: keep only ACT
  if (overall !== 'ACT') continue;

  const matchedPairs = m.matched_pair_ids_per_hypothesis || [];
  const horizonClassifications = [];
  let allGap = matchedPairs.length > 0;
  let anyGap = false;

  for (const block of matchedPairs) {
    if (!block.pair_ids || block.pair_ids.length === 0) {
      // Hypothesis with no ontology pair = ontology gap for that hypothesis
      anyGap = true;
      horizonClassifications.push({
        hypothesis_id: block.hypothesis_id,
        pair_label: null,
        horizon: null,
        confidence_band: null,
        trajectory: null,
        hard_evidence_count: 0,
      });
      continue;
    }
    let pairFound = false;
    for (const pid of block.pair_ids) {
      const p = pairById.get(pid);
      if (p) {
        pairFound = true;
        horizonClassifications.push({
          hypothesis_id: block.hypothesis_id,
          pair_label: p.pair_label,
          horizon: p.horizon,
          confidence_band: p.confidence_band,
          trajectory: p.trajectory,
          hard_evidence_count: p.hard_evidence_count,
        });
      }
    }
    if (pairFound) allGap = false;
  }

  // If no hypotheses matched at all, treat as fully unmatched ACT — pass with allGap flag
  if (matchedPairs.length === 0) {
    allGap = true;
    anyGap = true;
  }

  // Filter rule 2: skip if ALL matched hypotheses have ontology_gap = TRUE
  if (allGap) continue;

  const s = m.signal || {};
  out.push({
    json: {
      signal_id: s.signal_id || '',
      signal_title: s.headline || '',
      signal_summary: s.short_summary || '',
      signal_date: s.published_date || null,
      source_url: s.url || '',
      matched_hypothesis_ids: m.matched_hypothesis_ids || [],
      matched_hypothesis_labels: m.matched_hypothesis_labels || [],
      horizon_classifications: horizonClassifications,
      overall_classification: overall,
      probability_delta: typeof m.probability_delta === 'number' ? m.probability_delta : 0,
      ontology_gap: anyGap,
    }
  });
}

return out;`;
  return {
    parameters: { jsCode: code },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [960, 224],
    id: 'a1d0c08a-000b-4b00-9000-00000000000b',
    name: 'Build 15a Output',
  };
}

function postgresInsertSignalHorizonLog() {
  // Per-input-item INSERT into signal_horizon_log (migration 015).
  // Replaces the Append-to-Signal_Pipeline_Queue Google Sheet handoff.
  // Arrays bound as text[]; horizon_classifications JSON-stringified
  // and cast ::jsonb. signal_date NULL if upstream item has no date.
  const sql = `INSERT INTO signal_horizon_log
  (signal_id, signal_title, signal_summary, signal_date, source_url,
   matched_hypothesis_ids, matched_hypothesis_labels, horizon_classifications,
   overall_classification, probability_delta, ontology_gap)
VALUES
  ($1, $2, $3, NULLIF($4, '')::date, $5,
   $6::text[], $7::text[], $8::jsonb,
   $9, $10::numeric, $11)`;
  // Eleven positional parameters bound from the upstream item.
  // Each ={{ ... }} expression evaluates per-item.
  const replacement = [
    "{{ $json.signal_id }}",
    "{{ $json.signal_title }}",
    "{{ $json.signal_summary }}",
    "{{ $json.signal_date }}",
    "{{ $json.source_url }}",
    "{{ $json.matched_hypothesis_ids }}",
    "{{ $json.matched_hypothesis_labels }}",
    "{{ JSON.stringify($json.horizon_classifications) }}",
    "{{ $json.overall_classification }}",
    "{{ $json.probability_delta }}",
    "{{ $json.ontology_gap }}",
  ].join(', ');
  return {
    parameters: {
      operation: 'executeQuery',
      query: sql,
      options: { queryReplacement: '=' + replacement },
    },
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position: [1200, 224],
    id: 'a1d0c08a-000c-4b00-9000-00000000000c',
    name: 'Postgres: Insert into signal_horizon_log',
    credentials: {
      postgres: { id: PG_CRED_ID, name: PG_CRED_NAME }
    },
  };
}

// ---------- Build node list + connections ----------
const nodes = [
  trigger(),
  prepareToday(),
  readMiniSignals(),
  postgresShellHypotheses(),
  buildClassificationContext(),
  combinePayloadForClaude(),
  claudeClassify(),
  parseClassification(),
  matchSignalsToHypotheses(),
  postgresOntologyEnrichment(),
  build15aOutput(),
  postgresInsertSignalHorizonLog(),
];

// Linear connections: each node's `main[0]` -> next node
const connections = {};
for (let i = 0; i < nodes.length - 1; i++) {
  connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
}

const workflow = {
  name: 'Signal Pipeline 15a',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  staticData: null,
};

const outPath = join(__dirname, 'workflows', '3yqglVMObKORQ595.json');
await writeFile(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('wrote ' + outPath);
console.log('nodes: ' + nodes.length + '  connections: ' + Object.keys(connections).length);
