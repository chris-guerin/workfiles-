// node: WF-15A Summary
// id:   77905992-47bd-4eb4-b16d-b4f55ba3ae6a
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// WF-15A SUMMARY
const datasette = $input.first().json;
const collect = $('Collect + Write to Datasette').first().json;

return [{ json: {
  wf: 'WF-15A',
  status: 'complete',
  date: collect.today || new Date().toISOString().slice(0, 10),
  signals_written: datasette.table_count || collect.write_count || 0,
  signals_skipped: collect.skip_count || 0,
  message: (datasette.table_count || collect.write_count || 0) + ' mini-signals written to Datasette'
} }];