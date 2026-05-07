// node: Noise Blocklist + Deduplicate
// id:   b2e1d09a-0002-4b00-9000-000000000002
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// WeeklyNews — Noise Blocklist + Deduplicate — 2026-05-07
// NOISE BLOCKLIST + DEDUPLICATE
// Mode: Run Once for All Items
// Job: remove genuine noise and exact duplicates only
// No length filter. No keyword filter. No relevance judgement.
// That is Haiku's job.

const items = $input.all();

// Only block categories that could never be relevant to any industrial,
// energy, mobility, materials, supply chain, or geopolitical topic
const NOISE_PATTERNS = [
  /\b(kardashian|oscars|grammy|bafta|box office|celebrity gossip|red carpet)\b/i,
  /\b(premier league goal|match report|football score|cricket score|tennis score|golf score|nfl score|nba score|transfer rumour|starting lineup|man of the match)\b/i,
  /\b(recipe|cooking tips|fashion week|diet tips|weight loss tips|skincare routine|makeup tutorial|home decor ideas|holiday destination|travel tips)\b/i,
  /\b(goes viral|twitter reacts|social media reacts|people are saying|you won't believe)\b/i,
  /\b(horoscope|zodiac|astrology)\b/i,
  /\b(obituary|funeral service|in memoriam)\b/i
];

// Geopolitics always passes — overrides everything
const GEOPOLITICAL_OVERRIDE = /\b(sanctions|war|conflict|strait|tariff|embargo|invasion|ceasefire|nato|opec|crude|brent|geopolit|trade war|critical mineral|rare earth|supply chain)\b/i;

const seen = new Map();
const summary = { input: items.length, noise_blocked: 0, deduped: 0, output: 0 };

for (const item of items) {
  const s = item.json || {};
  if (s.skip) continue;

  const content = ((s.title || '') + ' ' + (s.raw_text || '')).trim();
  if (!content) continue;

  // Geopolitics always passes
  const isGeo = GEOPOLITICAL_OVERRIDE.test(content);

  if (!isGeo) {
    let isNoise = false;
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(content)) { isNoise = true; break; }
    }
    if (isNoise) { summary.noise_blocked++; continue; }
  }

  // Deduplicate by URL, then fingerprint, then title
  const key = s.url || s.fingerprint ||
    ((s.title || '').toLowerCase().slice(0, 80) + '|' + (s.published_date || ''));
  if (!key) continue;

  if (!seen.has(key)) {
    seen.set(key, s);
  } else {
    summary.deduped++;
  }
}

const result = Array.from(seen.values());
summary.output = result.length;

if (result.length === 0) {
  return [{ json: { no_signal: true, reason: 'All signals filtered as noise', summary } }];
}

const output = result.map(s => ({ json: s }));
output[0].json._filter_summary = summary;
return output;