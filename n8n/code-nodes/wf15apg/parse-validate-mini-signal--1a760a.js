// node: Parse + Validate Mini-Signal
// id:   1a760a5a-0194-4e20-934b-0a781fcb187f
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// PARSE + VALIDATE MINI-SIGNAL
// Mode: Run Once for Each Item

const input = $input.item.json || {};
const original = $('Build Extraction Payload').item.json || {};
const signal = original.signal || {};
const today = new Date().toISOString().slice(0, 10);

function extractText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload.content) && payload.content[0] && payload.content[0].text) return payload.content[0].text;
  if (payload.text) return payload.text;
  return '';
}

function extractJson(text) {
  const c = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(c); } catch {}
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch {} }
  return null;
}

if (input.error || input.statusCode === 429) {
  return { json: { skip: true, skip_reason: 'API_ERROR', signal_id: signal.signal_id } };
}

const extracted = extractJson(extractText(input));
if (!extracted) return { json: { skip: true, skip_reason: 'PARSE_FAILED', signal_id: signal.signal_id } };

// v1 prompt contract: skip:true → drop with model-supplied reason; otherwise pass.
// Confidence-threshold gate retired alongside the v0 prompt.
if (extracted.skip === true) {
  return { json: { skip: true, skip_reason: extracted.reason || 'PROMPT_SKIP', signal_id: signal.signal_id } };
}

return {
  json: {
    signal_id: signal.signal_id || '',
    extracted_at: today,
    published_date: signal.published_date || today,
    source: signal.source || '',
    source_type: signal.source_type || 'news',
    url: signal.url || '',
    headline: extracted.headline || signal.title || '',
    companies: extracted.companies || '',
    technologies: extracted.technologies || '',
    geography: extracted.geography || signal.geography || '',
    event_type: extracted.event_type || 'OTHER',
    value_chain_position: extracted.value_chain_position || 'UNKNOWN',
    short_summary: extracted.short_summary || '',
    evidence_snippet: extracted.evidence_snippet || '',
    content_density: null,
    confidence: null,
    extraction_model: 'claude-haiku-4-5-20251001',
    reasoning_classification: null,
    reasoning_at: null,
    hypothesis_matches: null,
    novelty_assessment: null,
    candidate_hypothesis: null,
    pattern_cluster_id: null,
    source_news_id: signal.news_id || null,
    content_hash: signal.news_content_hash || null,
    _news_sector_tags: signal.sector_tags || ''
  }
};