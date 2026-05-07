// node: Build Claude Prompt
// id:   b9f1c001-0004-4b00-9000-000000000004
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15b — Build Claude Prompt — 2026-05-05
// Mode: Run Once for All Items
// Constructs the request_body for Node 5 from the selected signal.
// Carries the signal payload through so downstream nodes can reference it.

const items = $input.all();
if (!items || items.length === 0) return [];

const r = items[0].json;
const hypLabels = Array.isArray(r.matched_hypothesis_labels)
  ? r.matched_hypothesis_labels.join('; ')
  : '';
const horizonsFmt = Array.isArray(r.horizon_classifications)
  ? r.horizon_classifications.map(hc => {
      const lbl = (hc && hc.pair_label) || '(no pair)';
      const h = (hc && hc.horizon) || '-';
      const t = (hc && hc.trajectory) || '-';
      return lbl + ' — ' + h + ' — ' + t;
    }).join('\n')
  : '';
const pd = typeof r.probability_delta === 'number'
  ? r.probability_delta
  : parseFloat(r.probability_delta) || 0;

const systemPrompt = `You are a senior FutureBridge analyst writing outreach emails for energy and mobility clients. Write like Bloomberg Intelligence. Short sentences. No buzzwords. No FutureBridge name in the email body. No generic openers.

Every email follows this 5-part structure:
1. Signal — one sentence, real numbers or named entities
2. Strategy — what this company is doing / their posture
3. Meaning — what this signal means for their business
4. Question — one pointed commercial question
5. CTA — one line, specific next step

Under 120 words per email. Return ONLY valid JSON, no markdown fences, no preamble.`;

const userPrompt = `Signal brief:
Title: ${r.signal_title || ''}
Summary: ${r.signal_summary || ''}
Date: ${r.signal_date || ''}
Hypotheses touched: ${hypLabels}
Technology horizon:
${horizonsFmt}
Probability delta: ${pd}
Ontology gap flag: ${r.ontology_gap === true}

Generate three outreach emails. Return ONLY this JSON:
{
  "topic": "3-5 word topic (no company name)",
  "executive": { "subject": "", "body": "" },
  "strategy":  { "subject": "", "body": "" },
  "tech":      { "subject": "", "body": "" }
}`;

return [{ json: {
  signal: r,
  request_body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })
}}];