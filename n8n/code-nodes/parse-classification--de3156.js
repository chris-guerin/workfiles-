// node: Parse Classification
// id:   de315621-65f7-4979-8ac6-2e92f5e3fc99
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const claudeResp = $input.first().json;
const rawText = claudeResp.content && claudeResp.content[0] ? claudeResp.content[0].text : '';

let results = [];
try {
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found');
  results = JSON.parse(cleaned.slice(start, end + 1));
} catch(e) {
  return [{ json: { parse_error: true, error: e.message, raw: rawText.slice(0, 300), probability_updates: [] } }];
}

const ctx = $('Combine Payload for Claude').first().json;
const probabilityUpdates = [];

results.forEach(function(result) {
  (result.hypothesis_matches || []).forEach(function(match) {
    if (match.match_strength === 'WEAK') return;
    if (!match.probability_delta || match.probability_delta === 0) return;
    probabilityUpdates.push({
      signal_id: result.signal_id,
      hyp_id: match.hyp_id,
      match_strength: match.match_strength,
      probability_delta: match.probability_delta,
      new_probability: match.new_probability,
      mechanism: match.mechanism,
      overall_classification: result.overall_classification
    });
  });
});

return [{ json: {
  results,
  signal_count: results.length,
  act_count: results.filter(r => r.overall_classification === 'ACT').length,
  watch_count: results.filter(r => r.overall_classification === 'WATCH').length,
  probability_updates: probabilityUpdates,
  update_count: probabilityUpdates.length,
  today: ctx.today,
  today_topic: ctx.today_topic
} }];