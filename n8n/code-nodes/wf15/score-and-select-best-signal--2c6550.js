// node: Score and Select Best Signal
// id:   2c655008-5a78-47ab-bb3e-2b2bc9d97bfb
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const parsed = $('Parse Classification').first().json;
const todayTopic = parsed.today_topic;
const today = parsed.today;

if (parsed.overall_classification !== 'ACT') {
  return [{ json: { no_signal: true, reason: 'Signal not classified as ACT', today_topic: todayTopic, today: today } }];
}

const result = parsed.result;
const breadth = result.breadth_score || 0;
const depth = result.depth_score || 0;
const relevance = result.topic_relevance || 0;
const combined_score = (breadth * 2) + (depth * 3) + relevance;

const topImpact = result.hypothesis_impacts && result.hypothesis_impacts[0]
  ? result.hypothesis_impacts[0]
  : {};

return [{ json: {
  best_signal: result,
  top_hyp_id: topImpact.hyp_id,
  top_reason: topImpact.reason,
  combined_score: combined_score,
  today_topic: todayTopic,
  today: today
} }];