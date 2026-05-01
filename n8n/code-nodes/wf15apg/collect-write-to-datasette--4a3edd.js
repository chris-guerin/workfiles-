// node: Collect + Write to Datasette
// id:   4a3edd30-6341-4099-be9b-62ec039e766b
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// COLLECT + WRITE TO DATASETTE
// Mode: Run Once for All Items

const all = $('Parse + Validate Mini-Signal').all().map(i => i.json);
const today = new Date().toISOString().slice(0, 10);

const valid = all.filter(s => !s.skip && s.signal_id && s.headline);

if (valid.length === 0) {
  return [{ json: {
    no_signals: true,
    reason: 'No valid mini-signals after extraction',
    today,
    attempted: all.length,
    low_confidence: all.filter(s => s.skip_reason === 'LOW_CONFIDENCE').length,
    parse_failed: all.filter(s => s.skip_reason === 'PARSE_FAILED').length,
    api_errors: all.filter(s => s.skip_reason === 'API_ERROR').length
  } }];
}

const rows = valid.map(s => ({
  signal_id: s.signal_id,
  extracted_at: s.extracted_at || today,
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
  content_density: s.content_density || 3,
  confidence: s.confidence || 0,
  extraction_model: s.extraction_model || 'claude-haiku-4-5-20251001',
  reasoning_classification: null,
  reasoning_at: null,
  hypothesis_matches: null,
  novelty_assessment: null,
  candidate_hypothesis: null,
  pattern_cluster_id: null,
  source_news_id: s.source_news_id || null,
  content_hash: s.content_hash || null,
  _news_sector_tags: s._news_sector_tags || ''
}));

return [{
  json: {
   datasette_payload: rows,
    signal_ids: valid.map(s => s.signal_id),
    write_count: valid.length,
    skip_count: all.length - valid.length,
    today
  }
}];