// node: Build POST Body
// id:   c3333333-3333-3333-3333-333333333333
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// Build POST Body — assemble heat_map_increments and strip carriers
// Mode: Run Once for Each Item
const item = $input.item.json || {};

const split = (s) => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
const companies = split(item.companies);
const sectors = split(item._news_sector_tags);
const signalType = item.event_type || 'OTHER';

const heat_map_increments = [];
if (companies.length && sectors.length) {
  for (const c of companies) for (const s of sectors) {
    heat_map_increments.push({ sector_tag: s, company: c, signal_type: signalType });
  }
}

const { _news_sector_tags, ...miniSignal } = item;
return { json: { ...miniSignal, heat_map_increments } };
