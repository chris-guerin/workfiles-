// node: Prepare Today
// id:   f248ea94-8c5b-471f-9c55-441479b80d1d
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const today = new Date().toISOString().slice(0, 10);
return [{ json: { today: today, step: 'read_campaign_master' } }];