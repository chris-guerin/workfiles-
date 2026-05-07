// node: Prepare Today
// id:   a1d0c08a-0002-4b00-9000-000000000002
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Signal Pipeline 15a — Prepare Today — 2026-05-07
// Compute today's date for downstream filters.
const today = new Date().toISOString().slice(0, 10);
return [{ json: { today, run_label: 'Signal Pipeline 15a' } }];