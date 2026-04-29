// node: Prepare Sheet Updates
// id:   54f587cd-a5e2-4c3e-bb0c-e08f976ffd3a
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const data = $input.first().json;
const updates = data.probability_updates || [];
const APPS_URL = 'https://script.google.com/macros/s/AKfycbyetK4hQDr9HZmrSZIAKaOM0DZ-bGRgcw23ah9o4S9yesnQWlU5qzFF-1en3opKKyMF3Q/exec';
if (updates.length === 0) {
  return [{ json: { no_updates: true, today_topic: data.today_topic, today: data.today, classifications: data.classifications } }];
}
return updates.map(function(u) {
  return { json: {
    url: APPS_URL,
    body: {
      action: 'probability_update',
      hyp_id: u.hyp_id,
      new_probability: u.new_probability,
      prob_before: (parseInt(u.new_probability) - parseInt(u.probability_delta)),
      delta: u.probability_delta,
      reason: u.reason,
      signal_id: u.signal_id,
      signal_date: data.today,
      signal_summary: u.signal_title + ' — ' + u.reason,
      source_type: u.signal_type,
      step_hit: String(u.step_evidenced),
      reviewed_by: 'Signal Engine WF-15'
    }
  } };
});