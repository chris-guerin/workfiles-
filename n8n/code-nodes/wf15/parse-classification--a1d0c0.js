// node: Parse Classification
// id:   a1d0c08a-0008-4b00-9000-000000000008
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15a — Parse Classification — 2026-05-07
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
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
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
  // exposes `signals` upstream; we look that up).
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
}];