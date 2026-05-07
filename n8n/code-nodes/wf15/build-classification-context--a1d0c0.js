// node: Build Classification Context
// id:   a1d0c08a-0005-4b00-9000-000000000005
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15a — Build Classification Context — 2026-05-05
// Aggregate the per-(initiative,component,pair) PG rows into one entry per
// distinct Shell hypothesis. Each entry carries label + topical keywords
// (initiative name + component names + pair labels) used by the matching
// stage downstream. The Claude classifier sees a compact list of hypothesis
// IDs + labels; matching by overlap is done in code, not by the LLM.

const rows = $('Postgres: All Hypotheses').all().map(i => i.json);

const byId = new Map();
for (const r of rows) {
  if (!byId.has(r.hypothesis_id)) {
    byId.set(r.hypothesis_id, {
      hypothesis_id: r.hypothesis_id,
      hypothesis_label: r.hypothesis_label,
      initiative_name: r.initiative_name,
      components: new Set(),
      pair_ids: new Set(),
      pair_labels: new Set(),
    });
  }
  const h = byId.get(r.hypothesis_id);
  if (r.component_name) h.components.add(r.component_name);
  if (r.pair_id !== null && r.pair_id !== undefined) h.pair_ids.add(r.pair_id);
  if (r.pair_label) h.pair_labels.add(r.pair_label);
}

const hypotheses = Array.from(byId.values()).map(h => ({
  hypothesis_id: h.hypothesis_id,
  hypothesis_label: h.hypothesis_label,
  initiative_name: h.initiative_name,
  components: Array.from(h.components),
  pair_ids: Array.from(h.pair_ids),
  pair_labels: Array.from(h.pair_labels),
}));

const today = $('Prepare Today').first().json.today;

return [{
  json: {
    today,
    hyp_count: hypotheses.length,
    hypotheses,
    // Compact list for the classification prompt — Claude sees IDs + labels only.
    hyp_summary_str: hypotheses.map(h => h.hypothesis_id + ': ' + h.hypothesis_label).join('\n'),
  }
}];