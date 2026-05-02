# WF-15A-PG live deployed state — captured at session close

**Captured:** 2026-05-02 (end of day BST)
**Source of truth:** `GET /api/v1/workflows/KtFda6LGUSfbYNDQ` on `https://n8n-production-86279.up.railway.app`
**Workflow ID:** `KtFda6LGUSfbYNDQ`
**Workflow name:** `WF-15A-PG`
**Active:** `true`
**n8n updatedAt:** `2026-05-02T15:19:34.165Z`
**n8n versionId:** `09ecab4f-c354-4085-a23d-2a73c5995af9`
**Node count:** 15

## Local-vs-live divergence check

The deployed jsCode bodies for both nodes match the local files at `n8n/code-nodes/wf15apg/` byte-for-byte (after stripping the 4-line sync.js header marker `// node:` / `// id:` / `// type:` / `// --- code below this line is what runs in n8n ---`).

| Node | Live length (chars) | Local length (post-strip) | Match? |
|---|---|---|---|
| Build Extraction Payload | 3511 | 3511 | exact |
| Parse + Validate Mini-Signal | 2552 | 2552 | exact |

**No divergence.** Local files faithfully reflect what is running on the n8n server.

---

## Build Extraction Payload — full code-node JS (verbatim from live)

- Node id: `4ba2c2dc-4188-4c75-a22b-e3a51b6bcd5c`
- Type: `n8n-nodes-base.code`
- typeVersion: `2`
- mode: `runOnceForEachItem`

```javascript
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
```

---

## Parse + Validate Mini-Signal — full code-node JS (verbatim from live)

- Node id: `1a760a5a-0194-4e20-934b-0a781fcb187f`
- Type: `n8n-nodes-base.code`
- typeVersion: `2`
- mode: `runOnceForEachItem`

```javascript
// PARSE + VALIDATE MINI-SIGNAL
// Mode: Run Once for Each Item

const input = $input.item.json || {};
const original = $('Build Extraction Payload').item.json || {};
const signal = original.signal || {};
const today = new Date().toISOString().slice(0, 10);

function extractText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload.content) && payload.content[0] && payload.content[0].text) return payload.content[0].text;
  if (payload.text) return payload.text;
  return '';
}

function extractJson(text) {
  const c = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(c); } catch {}
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch {} }
  return null;
}

if (input.error || input.statusCode === 429) {
  return { json: { skip: true, skip_reason: 'API_ERROR', signal_id: signal.signal_id } };
}

const extracted = extractJson(extractText(input));
if (!extracted) return { json: { skip: true, skip_reason: 'PARSE_FAILED', signal_id: signal.signal_id } };

// v1 prompt contract: skip:true → drop with model-supplied reason; otherwise pass.
// Confidence-threshold gate retired alongside the v0 prompt.
if (extracted.skip === true) {
  return { json: { skip: true, skip_reason: extracted.reason || 'PROMPT_SKIP', signal_id: signal.signal_id } };
}

return {
  json: {
    signal_id: signal.signal_id || '',
    extracted_at: today,
    published_date: signal.published_date || today,
    source: signal.source || '',
    source_type: signal.source_type || 'news',
    url: signal.url || '',
    headline: extracted.headline || signal.title || '',
    companies: extracted.companies || '',
    technologies: extracted.technologies || '',
    geography: extracted.geography || signal.geography || '',
    event_type: extracted.event_type || 'OTHER',
    value_chain_position: extracted.value_chain_position || 'UNKNOWN',
    short_summary: extracted.short_summary || '',
    evidence_snippet: extracted.evidence_snippet || '',
    content_density: null,
    confidence: null,
    extraction_model: 'claude-haiku-4-5-20251001',
    reasoning_classification: null,
    reasoning_at: null,
    hypothesis_matches: null,
    novelty_assessment: null,
    candidate_hypothesis: null,
    pattern_cluster_id: null,
    source_news_id: signal.news_id || null,
    content_hash: signal.news_content_hash || null,
    _news_sector_tags: signal.sector_tags || ''
  }
};
```

---

## The user's diagnostic claim

> *"Three Haiku runs today, three identical failure modes — Parse + Validate Mini-Signal returns the same count it received. The filter is not being applied, regardless of which prompt is in the system prompt."*

Per-node trace from execution `920` (and `921`, `923` showed the same shape):

```
GET /news                       → 1251 items
Map to Canonical Schema         → 1251
Noise Blocklist + Deduplicate   → 1102
Build Extraction Payload        → 1102
Claude Haiku Extract            → 1102
Parse + Validate Mini-Signal    → 1102   ← same count as input. Claim verified at this node.
Collect + Write to Datasette    →    1   ← single item with empty datasette_payload
Split Rows                      →    0
POST /mini_signals              →    0
```

## What this looks like vs what is actually happening

Read the validator code above carefully. **`Parse + Validate Mini-Signal` does not drop items — it tags them.**

- A skip outcome returns `{ json: { skip: true, skip_reason: ..., signal_id: ... } }` — still one item out per item in.
- A pass outcome returns `{ json: { signal_id, extracted_at, headline, ... } }` — still one item out per item in.

So a 1102-in / 1102-out per-node count is consistent with two different ground truths:

- **(a)** Every item correctly tagged `skip:true` by the validator, then dropped by the *next* node, `Collect + Write to Datasette`, which filters `s => !s.skip && s.signal_id && s.headline`. End result: 0 written. **Working as designed under a strict prompt that returns skip on every input.**
- **(b)** The validator's skip branch never firing — every item passing through as a full mini_signal record. End result: `Collect` would see 1102 valid items and forward all 1102 to writes. We would observe 1102 mini_signals in PG. **We do not observe this** — `mini_signals.count` is 3 (carry-over from earlier runs) and `id > 89` count is 0.

Observed outcome (mini_signals = 0 added across exec 921 and 923) rules out (b). The behaviour is consistent with (a) — every Haiku response is `skip:true` and the downstream Collect filter is correctly excluding them all.

## The actual question to answer next session

**Why is Haiku returning `skip:true` on every item?** Three candidate causes:

1. **`centrally about` is being interpreted too literally.** The prompt says: *"A story is centrally about energy or mobility when those subjects are the reason the story is being written."* Haiku may be applying this so strictly that headlines like "IBM: SDV clock speed demands faster innovation" fail because the story is about *IBM* (the entity), not *SDVs* (the subject). The current criterion mixes "about a subject" with "about an actor in that subject."

2. **Title-only inputs trigger an implicit thin-input bias even though the prompt allows them.** The prompt says short titles are fine, then says "Never extract details that are not in the source." Haiku may resolve the tension by skipping rather than extracting from a title alone.

3. **Malformed-JSON path.** `extractJson()` returning null falls through to `PARSE_FAILED` skip. If many Haiku responses are wrapped, prefixed with prose, or otherwise non-JSON, they could be silently filtered as PARSE_FAILED rather than reaching the skip branch with a real reason.

## Recommended next-session diagnostic sequence

Do these in order. Do not patch the prompt or validator until step 1 has produced concrete data.

1. **Inspect raw `Claude Haiku Extract` output items** for ~10 random rows from the most recent execution. Use `n8n/_diag-exec.mjs` or write a small script that pulls execution data via `GET /api/v1/executions/{id}?includeData=true` and logs the raw response body for items 0, 100, 200, 500, 800, 1000 (sampling distribution). Confirm whether Haiku is returning `{"skip":true,"reason":"..."}` (with what reasons), full extracted records, or malformed text.

2. **Tally `skip_reason` values** on the `Parse + Validate Mini-Signal` output across the execution. Cluster: PROMPT_SKIP (with sub-tally of `reason` strings), PARSE_FAILED, API_ERROR. The dominant bucket tells us where the loss is.

3. **Single-input bench test.** Construct a known-good high-quality news item — e.g. *"Shell announces 200MW PEM electrolyser at Pernis with €500M FID, expected operational 2027"* — and POST it to the Anthropic API directly with the exact systemPrompt from this file. If Haiku returns `skip:true` on that, the prompt is materially over-tight and the criterion needs softening. If Haiku passes it, the issue is RSS-input-shape specific.

4. **Only after the bench test produces clear data**, propose a prompt rewrite. Per chris-side guidance, the rewrite should be hierarchical and ordered: three sequential decision steps, each conditional on the previous, with explicit "Stop" instructions on each skip path. Layered content listing has failed three times today.

## Why no further triggers were run today

Three iterations of prompt tightening (v1 with adjacency-permissive → v2 binary with thin-input length rule → v3 binary with no_content content rule) produced 84 → 0/3/3 → 0 mini_signals across four executions of WF-15A-PG. None hit the 20–50 target. Without diagnosis of where Haiku's skip decisions are landing, further prompt edits are guessing.

Session was closed at user instruction: *"Don't run another extraction."*
