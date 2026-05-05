// node: Collect Mini-Signals
// id:   b2e1d09a-0006-4b00-9000-000000000006
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// WeeklyNews — Collect Mini-Signals — 2026-05-05
// Mode: Run Once for All Items
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
}));