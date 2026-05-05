// node: Combine Payload for Claude
// id:   a1d0c08a-0006-4b00-9000-000000000006
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15a — Combine Payload for Claude — 2026-05-05
// Batch signals into payloads of <=10 each; system prompt instructs Claude
// to return overall_classification + Claude-suggested probability_delta only.
// Hypothesis matching is done downstream in code, not by Claude.

const ctx = $('Build Classification Context').first().json || {};
const today = ctx.today || new Date().toISOString().slice(0, 10);
const hypList = ctx.hyp_summary_str || '';

const signals = $('Read Today\'s Mini-Signals').all().map(i => i.json).filter(s => s.signal_id && s.headline);

if (signals.length === 0) {
  return [{ json: { no_signals: true, reason: 'No mini-signals for ' + today, today } }];
}

const systemPrompt = `You are a signal classification engine for FutureBridge Advisory.

For each signal, return a JSON object inside an array. No preamble. No explanation. JSON only.

SHELL HYPOTHESES (full list — only these IDs are valid):
${hypList}

CLASSIFICATION RULES
ACT     = threshold crossing or displacement event for one or more Shell hypotheses
WATCH   = material movement on one or more hypotheses, but no threshold crossed
IGNORE  = no Shell hypothesis materially moved; or no relevance

For each signal, output:
{
  "signal_id": "",
  "overall_classification": "ACT|WATCH|IGNORE",
  "probability_delta": 0,
  "rationale": "<= 1 sentence"
}

Return a JSON array. No markdown.`;

const batchSize = 10;
const batches = [];
for (let i = 0; i < signals.length; i += batchSize) batches.push(signals.slice(i, i + batchSize));

return batches.map((batch, idx) => {
  const batchMessage = 'Classify these ' + batch.length + ' signals against the Shell hypothesis list above.\n\n' +
    batch.map((s, i) => 'SIGNAL ' + (i+1) +
      '\nID: ' + (s.signal_id || '') +
      '\nHeadline: ' + (s.headline || '') +
      '\nSource: ' + (s.source || '') +
      '\nDate: ' + (s.published_date || '') +
      '\nCompanies: ' + (s.companies || '') +
      '\nTechnologies: ' + (s.technologies || '') +
      '\nGeography: ' + (s.geography || '') +
      '\nSummary: ' + (s.short_summary || '') +
      '\nEvidence: ' + (s.evidence_snippet || '')
    ).join('\n---\n');

  return { json: {
    batch_index: idx,
    batch_size: batch.length,
    signals: batch,
    request_body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: batchMessage }]
    })
  }};
});