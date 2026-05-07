// node: Match Signals to Hypotheses
// id:   a1d0c08a-0009-4b00-9000-000000000009
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15a — Match Signals to Hypotheses — 2026-05-05
// Code-based keyword overlap: not LLM. Each Shell hypothesis's keyword bag
// is built from its initiative name, component names, and pair labels.
// A signal matches if it shares >=2 distinct content tokens (after stop-word
// stripping) OR >=1 high-weight domain token (LNG, CCS, hydrogen, SAF, EV,
// offshore wind, etc.).

const STOP = new Set(('a an the and or of for to in on at by from with as is are was were be been being '+
  'shell company industry industrial market technology global european european-european nw ' +
  'including via includes initial new high low medium short long').split(/\s+/));

const HIGH_WEIGHT = new Set([
  'ccs','ccus','co2','carbon','capture','sequestration','storage','northern','lights','quest',
  'hydrogen','h2','blue','green','electrolysis','electrolyser','pem','alkaline','smr','atr',
  'lng','gas','liquefied','natural','fsru',
  'saf','aviation','jet','hefa','atj','pt-l','ptl','refueleu',
  'ev','charging','electric','vehicle','recharge','nacs','ccs','combo',
  'offshore','wind','floating','hywind','hornsea','scotwind','vattenfall','equinor',
  'brazil','deepwater','lula','offshore','presalt',
  'namibia','orange','basin','exploration',
  'chemical','chemicals','pernis','performance','specialty',
  'refining','refinery','ammonia','steel','dri','cement',
  'eor','enhanced','recovery','45q','45v','cbam','ets','hyd-bank','hydrogenbank',
  'iea','ieaghg','iea-hydrogen'
]);

function tokenise(text) {
  if (!text) return [];
  return String(text).toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/[\s_-]+/)
    .filter(t => t.length >= 2 && !STOP.has(t));
}

function keywordsForHypothesis(h) {
  const blob = [h.hypothesis_label, h.initiative_name, ...(h.components||[]), ...(h.pair_labels||[])].join(' ');
  return new Set(tokenise(blob));
}

function tokensForSignal(s) {
  const blob = [s.headline, s.short_summary, s.companies, s.technologies, s.geography, s.evidence_snippet].join(' ');
  return new Set(tokenise(blob));
}

const ctx = $('Build Classification Context').first().json || {};
const hypotheses = (ctx.hypotheses || []).map(h => ({ ...h, keywords: keywordsForHypothesis(h) }));
const parsed = $input.first().json || {};
const results = parsed.results || [];

const out = [];
for (const r of results) {
  const s = r.signal;
  if (!s) {
    out.push({ json: { ...r, matched_hypothesis_ids: [], matched_pair_ids: [], match_diagnostics: 'no_signal_payload' } });
    continue;
  }
  const sigTokens = tokensForSignal(s);
  const matches = [];
  for (const h of hypotheses) {
    let overlap = 0;
    let highWeightHits = 0;
    for (const t of sigTokens) {
      if (h.keywords.has(t)) {
        overlap++;
        if (HIGH_WEIGHT.has(t)) highWeightHits++;
      }
    }
    if (overlap >= 2 || highWeightHits >= 1) {
      matches.push({ hypothesis_id: h.hypothesis_id, hypothesis_label: h.hypothesis_label,
                     pair_ids: h.pair_ids, overlap, highWeightHits });
    }
  }
  out.push({
    json: {
      ...r,
      matched_hypothesis_ids: matches.map(m => m.hypothesis_id),
      matched_hypothesis_labels: matches.map(m => m.hypothesis_label),
      matched_pair_ids_per_hypothesis: matches.map(m => ({ hypothesis_id: m.hypothesis_id, pair_ids: m.pair_ids })),
      all_matched_pair_ids: Array.from(new Set(matches.flatMap(m => m.pair_ids))),
      match_diagnostics: matches.map(m => ({ hyp: m.hypothesis_id, overlap: m.overlap, high: m.highWeightHits })),
    }
  });
}

return out;