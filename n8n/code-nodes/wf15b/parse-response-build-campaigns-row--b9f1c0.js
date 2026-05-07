// node: Parse Response + Build Campaigns Row
// id:   b9f1c001-0006-4b00-9000-000000000006
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15b — Parse Response + Build Campaigns Row — 2026-05-05
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
const cleaned = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
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
return [{ json: row }];