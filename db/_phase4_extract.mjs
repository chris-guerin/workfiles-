// db/_phase4_extract.mjs — Phase 4 v3 extraction.
// Manually feeds news items into the Haiku-driven extraction prompt and
// POSTs structured output to /mini_signals_v3 — equivalent to the n8n
// new-branch logic, runnable as a standalone script.
//
// Run:
//   node db/_phase4_extract.mjs              # pull 10 most recent news items, dry-run
//   node db/_phase4_extract.mjs --commit     # extract + POST live
//   node db/_phase4_extract.mjs --commit --news-ids=1234,1235  # specific items
//   node db/_phase4_extract.mjs --commit --limit=20            # 20 most recent

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
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
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
async function getApiKey() {
  if (process.env.SIGNAL_ENGINE_API_KEY) return process.env.SIGNAL_ENGINE_API_KEY;
  if (process.env.API_KEY) return process.env.API_KEY;
  const p = join(__dirname, '..', '.claude', 'settings.local.json');
  if (existsSync(p)) {
    const txt = await readFile(p, 'utf8');
    const m = txt.match(/Bearer\s+([a-f0-9]{64})/);
    if (m) return m[1];
  }
  return null;
}

const COMMIT = process.argv.includes('--commit');
const ANTHROPIC_KEY = await getAnthropicKey();
const API_KEY = await getApiKey();
const API_BASE = 'https://signal-engine-api-production-0cf1.up.railway.app';

const newsIdsArg = process.argv.find((a) => a.startsWith('--news-ids='));
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const NEWS_IDS = newsIdsArg ? newsIdsArg.slice(11).split(',').map((s) => parseInt(s)).filter(Boolean) : null;
const LIMIT = limitArg ? parseInt(limitArg.slice(8)) : 10;

if (COMMIT && (!ANTHROPIC_KEY || !API_KEY)) {
  console.error('Missing keys; check ANTHROPIC_API_KEY and API_KEY/Bearer.');
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log(`=== Phase 4 v3 extraction ===  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

// Build the controlled-vocab payload for the Haiku prompt
const { rows: attrDefs } = await c.query(`SELECT attribute_name FROM attribute_definitions ORDER BY display_order, attribute_name`);
const { rows: techFns } = await c.query(`SELECT function_name FROM tech_functions ORDER BY function_name`);
const { rows: catNames } = await c.query(`SELECT entity_name, entity_type FROM catalogue_names ORDER BY entity_type, entity_name`);
const { rows: companies } = await c.query(`SELECT name FROM companies ORDER BY name`);

const attrNames = attrDefs.map((r) => r.attribute_name);
const techFnNames = techFns.map((r) => r.function_name);
const componentNames = catNames.filter((r) => r.entity_type === 'component').map((r) => r.entity_name);
const initiativeNames = catNames.filter((r) => r.entity_type === 'initiative').map((r) => r.entity_name);
const companyNames = companies.map((r) => r.name);
const regulationNames = ['EU AFIR','EU SAF Mandate','EU Hydrogen Bank','US 45Q','US NEVI','UK PCPR 2023','UK CCS Track 1','UK CCS Track 2','UK Rapid Charging Fund','REPowerEU','RED III','UK Renewables Obligation','REFHYNE','EU CEF-T AFIF'];

console.log(`[vocab] ${attrNames.length} attribute_names, ${techFnNames.length} tech_functions, ${componentNames.length} components, ${companyNames.length} companies, ${regulationNames.length} regulations`);

// Pull news items to extract
let newsItems;
if (NEWS_IDS) {
  const r = await c.query(`SELECT id, title, source, signal_type, sector_tags, tech_tags, geography, companies_mentioned, url, pub_date FROM news WHERE id = ANY($1::int[]) ORDER BY id`, [NEWS_IDS]);
  newsItems = r.rows;
} else {
  const r = await c.query(`SELECT id, title, source, signal_type, sector_tags, tech_tags, geography, companies_mentioned, url, pub_date FROM news ORDER BY processed_at DESC NULLS LAST LIMIT $1`, [LIMIT]);
  newsItems = r.rows;
}

console.log(`[news] ${newsItems.length} items to extract`);

// Haiku v3 extraction prompt (per spec section 4.1)
const SYSTEM_PROMPT = `You read a news item and output STRICT JSON conforming to this schema, no prose:

{
  "is_signal": boolean,
  "signal_type": "announcement"|"decision"|"data_release"|"commitment"|"commentary"|"regulatory_change"|"financial_filing"|"other",
  "extracted_entities": [array of strings — only entity names that match the provided vocabulary lists or are explicitly named in the article],
  "extracted_attribute_types": [array of strings — only from the provided controlled list of attribute names],
  "extracted_values": { object keyed by attribute_type, each value: {"value_numeric"?: number, "value_text"?: string, "value_unit"?: string, "context"?: string, "direction"?: "rising"|"falling"|"stable"|"volatile"} },
  "extracted_geographic_scope": [array of ISO country codes or named regions],
  "extracted_temporal_scope_start": "YYYY-MM-DD" | null,
  "extracted_temporal_scope_end": "YYYY-MM-DD" | null,
  "confidence": number 0-1
}

If is_signal=false, return {"is_signal": false, "reason": "string"} only.

The contract:
- extracted_attribute_types ONLY contains values from the provided controlled list
- extracted_entities are matched at SQL time against components / tech_functions / regulations / companies — names should be specific (e.g. "EU Hydrogen Bank", "Shell Recharge", "Holland Hydrogen 1"), not generic categories
- extracted_geographic_scope uses ISO country codes (US, GB, DE, FR, NL, etc) or named regions (EU, NW Europe, Asia-Pacific, North Sea, MENA)
- extracted_values: when prose names a number, extract it; when it names a unit, extract that; when it names a direction (rising/falling/stable/volatile), extract that. Don't invent.`;

async function callHaiku(news) {
  if (!COMMIT) return JSON.stringify({ __dryrun: true });
  const userPrompt = `Vocabulary lists:

attribute_name controlled vocab:
${attrNames.join(', ')}

tech_functions controlled vocab:
${techFnNames.join(', ') || '(none populated yet)'}

component names known to catalogue:
${componentNames.join(', ')}

initiative names known to catalogue:
${initiativeNames.join(', ')}

company names:
${companyNames.join(', ')}

regulatory instrument names:
${regulationNames.join(', ')}

NEWS ITEM:
title: ${news.title}
source: ${news.source}
signal_type_v1: ${news.signal_type || '(none)'}
sector_tags: ${news.sector_tags || '(none)'}
tech_tags: ${news.tech_tags || '(none)'}
geography_v1: ${news.geography || '(none)'}
companies_v1: ${news.companies_mentioned || '(none)'}
pub_date: ${news.pub_date ? String(news.pub_date).slice(0, 10) : '(unknown)'}
url: ${news.url}

Extract structured JSON per the schema.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.content?.[0]?.text || '';
}

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

let totals = { attempted: 0, signals: 0, non_signals: 0, parse_failed: 0, posted: 0, post_failed: 0 };

for (const news of newsItems) {
  totals.attempted++;
  console.log(`\n[${totals.attempted}/${newsItems.length}] news.id=${news.id}: ${(news.title || '').slice(0, 80)}`);

  let extracted;
  try {
    const text = await callHaiku(news);
    extracted = tryJson(text);
    if (!extracted) {
      totals.parse_failed++;
      console.log(`  parse failed: raw=${text.slice(0, 200)}`);
      continue;
    }
  } catch (e) {
    totals.parse_failed++;
    console.log(`  haiku error: ${e.message.slice(0, 200)}`);
    continue;
  }

  if (extracted.is_signal === false) {
    totals.non_signals++;
    console.log(`  not a signal: ${extracted.reason || '(no reason given)'}`);
    continue;
  }

  totals.signals++;
  console.log(`  signal_type=${extracted.signal_type}, entities=${(extracted.extracted_entities || []).length}, attrs=${(extracted.extracted_attribute_types || []).length}, conf=${extracted.confidence}`);

  if (!COMMIT) continue;

  // POST to /mini_signals_v3
  const body = {
    source_news_id: news.id,
    signal_text: news.title,
    signal_type: extracted.signal_type || 'other',
    extracted_entities: extracted.extracted_entities || [],
    extracted_attribute_types: extracted.extracted_attribute_types || [],
    extracted_values: extracted.extracted_values || {},
    extracted_geographic_scope: extracted.extracted_geographic_scope || [],
    extracted_temporal_scope_start: extracted.extracted_temporal_scope_start || null,
    extracted_temporal_scope_end: extracted.extracted_temporal_scope_end || null,
    extracted_at: new Date().toISOString(),
    extraction_confidence: typeof extracted.confidence === 'number' ? extracted.confidence : null,
    extraction_model: 'claude-haiku-4-5',
    source_url: news.url,
    pub_date: news.pub_date instanceof Date ? news.pub_date.toISOString().slice(0, 10) : (news.pub_date ? String(news.pub_date).slice(0, 10) : null),
  };

  try {
    const r = await fetch(`${API_BASE}/mini_signals_v3`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      totals.post_failed++;
      const t = await r.text();
      console.log(`  POST failed (${r.status}): ${t.slice(0, 200)}`);
    } else {
      const j = await r.json();
      totals.posted++;
      console.log(`  posted mini_signal_v3 id=${j.row?.id}`);
    }
  } catch (e) {
    totals.post_failed++;
    console.log(`  POST error: ${e.message.slice(0, 200)}`);
  }
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(totals, null, 2));

await c.end();
