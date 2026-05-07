// node: Build Extraction Payload
// id:   b2e1d09a-0003-4b00-9000-000000000003
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// WeeklyNews — Build Extraction Payload — 2026-05-07
// BUILD EXTRACTION PAYLOAD
// Mode: Run Once for Each Item

const signal = $input.item.json || {};
if (signal.no_signal || signal.skip) return { json: signal };

const text = (signal.raw_text || signal.title || '').slice(0, 1500);

const systemPrompt = `You are reading a single news item. Your only job is to decide: is this story centrally about energy or mobility?

WHAT COUNTS AS ENERGY OR MOBILITY

Energy: power generation, transmission, storage, oil, gas, hydrogen, renewables, nuclear, fuels, carbon capture, energy regulation, energy markets, energy companies acting in their core business.

Mobility: passenger vehicles, commercial vehicles, EV manufacturing, charging infrastructure, autonomous systems, drivetrains, tyres, vehicle sealing and materials, automotive semiconductors, mobility regulation, mobility companies acting in their core business.

THE QUESTION

Would this story exist if you removed energy and mobility from the world? If yes, drop it. If no, keep it.

A story is centrally about energy or mobility when those subjects are the reason the story is being written. Not when they appear in passing. Not when a clever connection could be made. The story has to be about them.

THIN INPUTS

If the source contains only an identifier or category code with no human-readable content (e.g. "CELEX:32025R1468R(01)"), return skip:true with reason "no_content". A short but substantive title is fine — proceed to the relevance test.

Never extract details that are not in the source. If the title says "IBM: SDV clock speed demands faster innovation", you may extract company=IBM, technology=SDV, event_type=PERFORMANCE_THRESHOLD — those are in the source. Do not invent figures, locations, or partnerships that the source does not name.

DECISION

If the story passes — extract the fields below.
If it does not pass — return {"skip": true, "reason": "<one short phrase>"}. Nothing else.

Adjacent industries (pharma, aerospace, defence, packaging, chemicals) are out of scope in this version. If a story is about one of those, drop it even if you can imagine a connection. We are deliberately running tight in v0.

EXTRACTION (only when the story passes)

headline: the core event in one clean sentence.
companies: organisations directly involved.
technologies: specific technologies or materials named.
geography: countries, regions, cities relevant to the event.
event_type: COST_THRESHOLD | PERFORMANCE_THRESHOLD | REGULATORY | CAPITAL_COMMITMENT | MARKET_STRUCTURE | PARTNERSHIP | PRODUCT_LAUNCH | CAPACITY_CHANGE | ITERATION | EARNINGS | OTHER
value_chain_position: UPSTREAM | MIDSTREAM | DOWNSTREAM | CROSS_CHAIN | UNKNOWN
short_summary: 2-3 sentences. What happened and why an energy or mobility analyst would care.
evidence_snippet: the single most important phrase from the source.

Return valid JSON only. No markdown. No commentary outside the JSON.

For a story that passes:
{"headline":"","companies":"","technologies":"","geography":"","event_type":"","value_chain_position":"","short_summary":"","evidence_snippet":""}

For a story that does not pass:
{"skip":true,"reason":""}`;

return {
  json: {
    signal_id: signal.signal_id,
    signal,
    request_body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: 'Source: ' + (signal.source || '') + '\nDate: ' + (signal.published_date || '') + '\n\n' + text
      }]
    })
  }
};
