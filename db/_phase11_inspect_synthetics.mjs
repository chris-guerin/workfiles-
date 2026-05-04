// db/_phase11_inspect_synthetics.mjs — runs the new soft-signal-extended
// Haiku prompt against the existing 6 synthetic mini_signals_v3 rows
// (extraction_model='_phase4_seed') to document what soft signals fire.
// Read-only: does not write to PG, does not mutate the synthetic rows.
//
// Run: node db/_phase11_inspect_synthetics.mjs

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
async function loadEnv(p) {
  if (!existsSync(p)) return;
  const raw = await readFile(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '.env'));
await loadEnv(join(__dirname, '..', 'n8n', '.env'));

async function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const candidates = [
    join(__dirname, '..', 'n8n', 'workflows', 'wf-15.json'),
    join(__dirname, '..', 'n8n', 'workflows', 'wf15apg.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const txt = await readFile(p, 'utf8');
    const m = txt.match(/sk-ant-api03-[A-Za-z0-9_-]{80,300}/);
    if (m) return m[0];
  }
  return null;
}
const ANTHROPIC_KEY = await getAnthropicKey();
if (!ANTHROPIC_KEY) { console.error('No Anthropic key'); process.exit(1); }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows: seeds } = await c.query(`
  SELECT id, signal_text, signal_type, extracted_entities, extracted_attribute_types
  FROM mini_signals_v3
  WHERE extraction_model = '_phase4_seed'
  ORDER BY id
`);
console.log(`Inspecting ${seeds.length} synthetic seed signals for soft-signal detection.\n`);

// Tighter prompt — only soft-signal section (we already have hard-signal data)
const SYS = `You receive a market signal and identify soft-signal content per the v3 framework.

Soft signals are interpretive content that doesn't reduce to attribute movements. Three categories:

ASSUMPTION_EVIDENCE: evidence for/against an unstated assumption a strategy bet depends on.
TENSION_EVIDENCE: reinforces/contradicts a structural tension crossing initiatives, horizons, or industries.
REFRAME_EVIDENCE: industry framing of a topic is shifting (e.g., from utilisation-driven to demand-shape-driven).

Output STRICT JSON:
{
  "soft_signal_type": "assumption_evidence" | "tension_evidence" | "reframe_evidence" | "none",
  "soft_signal_subject": "<short text describing what's affected; empty string if none>",
  "soft_signal_direction": "reinforcing" | "contradicting" | "clarifying" | null,
  "soft_signal_reasoning": "<2-3 sentences if soft signal; empty string if none>"
}`;

function tryJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = fenced ? fenced[1] : text;
  const start = s.indexOf('{'); if (start < 0) return null;
  let d = 0, end = -1;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

let detected = 0, none = 0, errors = 0;
const results = [];

for (const seed of seeds) {
  const userPrompt = `Signal text: """${seed.signal_text}"""
Hard-signal classification: signal_type=${seed.signal_type}; entities=${JSON.stringify(seed.extracted_entities)}; attribute_types=${JSON.stringify(seed.extracted_attribute_types)}.

Identify any soft-signal content. Output the JSON.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        system: SYS,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 150)}`);
    const j = await r.json();
    const text = j.content?.[0]?.text || '';
    const parsed = tryJson(text);
    if (!parsed) { errors++; results.push({ id: seed.id, error: 'parse failed', raw: text.slice(0,150) }); continue; }
    if (!parsed.soft_signal_type || parsed.soft_signal_type === 'none') {
      none++;
      results.push({ id: seed.id, signal_text_head: seed.signal_text.slice(0, 80), soft: 'none' });
    } else {
      detected++;
      results.push({
        id: seed.id,
        signal_text_head: seed.signal_text.slice(0, 80),
        soft_signal_type: parsed.soft_signal_type,
        soft_signal_subject: parsed.soft_signal_subject,
        soft_signal_direction: parsed.soft_signal_direction,
        soft_signal_reasoning: parsed.soft_signal_reasoning,
      });
    }
  } catch (e) {
    errors++;
    results.push({ id: seed.id, error: e.message.slice(0, 200) });
  }
}

console.log(`Soft-signal detection on ${seeds.length} synthetic seeds: ${detected} detected, ${none} none, ${errors} errors.\n`);
for (const r of results) {
  console.log(`--- mini_signals_v3.id=${r.id} ---`);
  if (r.error) { console.log(`  ERROR: ${r.error}`); continue; }
  console.log(`  text:    ${r.signal_text_head}...`);
  if (r.soft === 'none') console.log(`  soft:    none`);
  else {
    console.log(`  soft:    ${r.soft_signal_type} / ${r.soft_signal_direction}`);
    console.log(`  subject: ${r.soft_signal_subject}`);
    console.log(`  reason:  ${r.soft_signal_reasoning}`);
  }
}

await c.end();
