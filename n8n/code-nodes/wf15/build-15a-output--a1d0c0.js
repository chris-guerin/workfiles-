// node: Build 15a Output
// id:   a1d0c08a-000b-4b00-9000-00000000000b
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15a — Build 15a Output — 2026-05-07
// For each matched signal: assemble the per-spec output schema, compute
// ontology_gap, apply ACT + gap filter (skip non-ACT; skip ACT where ALL
// matched hypotheses have gap; pass mixed and flag).

const matchedItems = $('Match Signals to Shell Hypotheses').all().map(i => i.json);
const enrichmentRows = $('Postgres: Ontology Enrichment').all().map(i => i.json);
const pairById = new Map(enrichmentRows.map(r => [r.pair_id, r]));

const out = [];
for (const m of matchedItems) {
  if (m.parse_error) continue;
  const overall = (m.overall_classification || '').toUpperCase();

  // Filter rule 1: keep only ACT
  if (overall !== 'ACT') continue;

  const matchedPairs = m.matched_pair_ids_per_hypothesis || [];
  const horizonClassifications = [];
  let allGap = matchedPairs.length > 0;
  let anyGap = false;

  for (const block of matchedPairs) {
    if (!block.pair_ids || block.pair_ids.length === 0) {
      // Hypothesis with no ontology pair = ontology gap for that hypothesis
      anyGap = true;
      horizonClassifications.push({
        hypothesis_id: block.hypothesis_id,
        pair_label: null,
        horizon: null,
        confidence_band: null,
        trajectory: null,
        hard_evidence_count: 0,
      });
      continue;
    }
    let pairFound = false;
    for (const pid of block.pair_ids) {
      const p = pairById.get(pid);
      if (p) {
        pairFound = true;
        horizonClassifications.push({
          hypothesis_id: block.hypothesis_id,
          pair_label: p.pair_label,
          horizon: p.horizon,
          confidence_band: p.confidence_band,
          trajectory: p.trajectory,
          hard_evidence_count: p.hard_evidence_count,
        });
      }
    }
    if (pairFound) allGap = false;
  }

  // If no hypotheses matched at all, treat as fully unmatched ACT — pass with allGap flag
  if (matchedPairs.length === 0) {
    allGap = true;
    anyGap = true;
  }

  // Filter rule 2: skip if ALL matched hypotheses have ontology_gap = TRUE
  if (allGap) continue;

  const s = m.signal || {};
  out.push({
    json: {
      signal_id: s.signal_id || '',
      signal_title: s.headline || '',
      signal_summary: s.short_summary || '',
      signal_date: s.published_date || null,
      source_url: s.url || '',
      matched_hypothesis_ids: m.matched_hypothesis_ids || [],
      matched_hypothesis_labels: m.matched_hypothesis_labels || [],
      horizon_classifications: horizonClassifications,
      overall_classification: overall,
      probability_delta: typeof m.probability_delta === 'number' ? m.probability_delta : 0,
      ontology_gap: anyGap,
    }
  });
}

return out;