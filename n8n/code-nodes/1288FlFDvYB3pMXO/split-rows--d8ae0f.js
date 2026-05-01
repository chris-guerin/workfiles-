// node: Split Rows
// id:   d8ae0fb7-0852-42ab-bf75-bd14901108df
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const payload = $input.first().json.datasette_payload || [];
return payload.map(row => ({ json: row }));