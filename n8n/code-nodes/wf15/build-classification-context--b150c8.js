// node: Build Classification Context
// id:   b150c807-78bc-4793-8bbf-9303d2eb8e3d
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Build compressed hypothesis context for Claude
const hypData = $('Fetch Hypothesis Repository').first().json;
const hypotheses = hypData.hypotheses || [];
const hypContext = hypotheses.map(function(h) {
  return {
    id: h.hyp_id,
    sector: h.sector,
    title: h.business_hypothesis || h.title,
    prob: h.probability,
    step: h.current_step + '/' + h.total_steps,
    wntbt: h.wntbt_next,
    window: h.window + ' ' + h.window_closes,
    signal_types: h.signal_types,
    system_layer: h.system_layer,
    company_tags: h.company_tags
  };
});
const today = new Date().toISOString().slice(0,10);
return [{ json: {
  today: today,
  today_topic: 'energy security',
  hyp_count: hypContext.length,
  hyp_context_str: JSON.stringify(hypContext)
} }];