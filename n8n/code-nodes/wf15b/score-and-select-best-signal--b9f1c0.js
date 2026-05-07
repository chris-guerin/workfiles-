// node: Score and Select Best Signal
// id:   b9f1c001-0003-4b00-9000-000000000003
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15b — Score and Select Best Signal — 2026-05-05
// Mode: Run Once for All Items
// Scores each ACT signal and selects the single highest-composite row.
// If input is empty, returns [] so downstream nodes skip cleanly.
//
// Composite formula:
//   composite = (probability_delta * 40)
//             + (best_horizon_score * 35)
//             + (matched_hypothesis_ids.length * 25)
//   ontology_gap penalty: if TRUE, composite *= 0.5
//
// horizon_score per pair:  H2 = 1.0, H1 = 0.6, H3 = 0.4
//   Take the MAX score across all matched pairs in horizon_classifications.

const items = $input.all();
if (!items || items.length === 0) {
  return [];   // Pipeline halts cleanly — no signals to process.
}

function horizonScore(h) {
  if (h === 'H2') return 1.0;
  if (h === 'H1') return 0.6;
  if (h === 'H3') return 0.4;
  return 0;
}

function bestHorizonScore(horizon_classifications) {
  if (!Array.isArray(horizon_classifications) || horizon_classifications.length === 0) return 0;
  let best = 0;
  for (const hc of horizon_classifications) {
    const s = horizonScore(hc && hc.horizon);
    if (s > best) best = s;
  }
  return best;
}

function bestHorizonValue(horizon_classifications) {
  // Return the horizon STRING corresponding to the highest score.
  if (!Array.isArray(horizon_classifications) || horizon_classifications.length === 0) return null;
  let bestH = null, bestScore = -1;
  for (const hc of horizon_classifications) {
    const s = horizonScore(hc && hc.horizon);
    if (s > bestScore) { bestScore = s; bestH = hc && hc.horizon; }
  }
  return bestH;
}

const scored = items.map(it => {
  const r = it.json;
  const pd = typeof r.probability_delta === 'number' ? r.probability_delta : parseFloat(r.probability_delta) || 0;
  const hs = bestHorizonScore(r.horizon_classifications);
  const matchedIds = Array.isArray(r.matched_hypothesis_ids) ? r.matched_hypothesis_ids : [];
  let composite = (pd * 40) + (hs * 35) + (matchedIds.length * 25);
  if (r.ontology_gap === true) composite = composite * 0.5;
  return {
    ...r,
    composite_score: composite,
    horizon_score: hs,
    horizon_top: bestHorizonValue(r.horizon_classifications),
  };
});

scored.sort((a, b) => b.composite_score - a.composite_score);
const best = scored[0];
return [{ json: best }];