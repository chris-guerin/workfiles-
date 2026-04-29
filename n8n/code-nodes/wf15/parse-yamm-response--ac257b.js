// node: Parse YAMM Response
// id:   ac257bd0-223f-4707-a6a4-e4fddc85bc95
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const data = $input.first().json;
const raw = data.content && data.content[0] ? data.content[0].text : '';
const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

let variants;
try {
  variants = JSON.parse(clean);
} catch(e) {
  return [{ json: { parse_error: true, error: e.message, raw: raw.slice(0, 200) } }];
}

// Get matching upstream context by item index
const allUpstream = $('Build YAMM Prompt').all();
const idx = $input.first().pairedItem ? $input.first().pairedItem.item : 0;
const upstream = allUpstream[idx] ? allUpstream[idx].json : allUpstream[0].json;

return [{ json: {
  email_variants: variants,
  signal_id: upstream.signal_id,
  target_entities: upstream.target_entities,
  top_hypothesis: upstream.top_hypothesis,
  today: upstream.today,
  today_topic: upstream.today_topic
}}];