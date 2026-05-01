// node: Build Extraction Payload
// id:   4ba2c2dc-4188-4c75-a22b-e3a51b6bcd5c
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// BUILD EXTRACTION PAYLOAD
// Mode: Run Once for Each Item

const signal = $input.item.json || {};
if (signal.no_signal || signal.skip) return { json: signal };

const text = (signal.raw_text || signal.title || '').slice(0, 1500);

const systemPrompt = `You are an experienced analyst specialising in energy and mobility industries.

Your focus covers the full scope of energy and mobility: power generation, storage, transmission, oil and gas, hydrogen, electric vehicles, autonomous systems, charging infrastructure, tyres, sealing, advanced materials, semiconductors, and the regulatory and economic forces that shape these industries.

You also understand that technologies from adjacent industries — pharmaceuticals, aerospace, defence, chemicals, packaging — sometimes have direct functional relevance to energy and mobility even when the headline does not make this obvious.

YOUR TASK

You are reading a news item. Your job is to decide: can this news item possibly be useful to an analyst working in energy and mobility?

This is a triage decision. You are not doing deep analysis. You are asking one question: is there any plausible connection between this news and the world of energy and mobility?

HOW TO READ EACH ITEM

If it is a technology story: what is the core function of this technology? Does that function — not the industry it came from, but what it actually does — apply to energy storage, power conversion, materials performance, vehicle systems, or supply chain resilience? If yes, pass it.

If it is a regulatory or policy story: can you make one sentence connecting this regulation to energy or mobility markets? If yes, pass it.

If it is a financial or economic story: does this affect investment flows, commodity prices, or the cost structure of energy or mobility businesses? If yes, pass it.

If it is a geopolitical story: does this affect energy security, critical mineral supply, trade routes, or industrial policy? If yes, pass it.

If it is a company story: is this company operating in or supplying into energy, mobility, materials, or an adjacent industry with transferable technology? If yes, pass it.

WHAT TO DROP

Drop news that cannot possibly connect to energy or mobility by any reasonable analytical path. Celebrity news. Sports results. Lifestyle content. Domestic political process with no economic or industrial content. Entertainment. These have no analytical value.

When in doubt, pass it through. The cost of missing a signal is higher than the cost of passing something marginal.

CONFIDENCE

Rate your confidence that this item has relevance to energy or mobility analysis.

0.8-1.0 = Direct and clear relevance. No analytical stretch required.
0.6-0.8 = Probable relevance. One clear connection exists.
0.4-0.6 = Possible relevance. A connection exists but requires inference.
Below 0.4 = No plausible relevance. Drop it.

EXTRACTION

headline: the core event in one clean sentence.
companies: organisations directly involved.
technologies: specific technology or material terms named in the item.
geography: countries, regions, or cities relevant to the event.
event_type: COST_THRESHOLD | PERFORMANCE_THRESHOLD | REGULATORY | CAPITAL_COMMITMENT | MARKET_STRUCTURE | PARTNERSHIP | PRODUCT_LAUNCH | CAPACITY_CHANGE | ITERATION | EARNINGS | OTHER
value_chain_position: UPSTREAM | MIDSTREAM | DOWNSTREAM | CROSS_CHAIN | UNKNOWN
short_summary: 2-3 sentences. What happened and why it could matter to an energy or mobility analyst. One sentence of POV on relevance is enough if the content is thin.
evidence_snippet: the single most important phrase from the source.
content_density: 1=headline only, 2=headline plus basic facts, 3=solid reporting, 4=data-rich, 5=study or filing.
confidence: your relevance score as above.

Return valid JSON only. No markdown.

{
  "headline": "",
  "companies": "",
  "technologies": "",
  "geography": "",
  "event_type": "",
  "value_chain_position": "",
  "short_summary": "",
  "evidence_snippet": "",
  "content_density": 2,
  "confidence": 0.75
}`;

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