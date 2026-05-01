// node: Build Alert Email
// id:   a32fef72-7377-433c-a96e-b7f25c9bf293
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const items = $input.all();

if (items.length === 0) {
  return [{ json: { skip: true, subject: 'Signal Engine: No alerts this week', html: '<p>No HIGH or MEDIUM signals detected this week.</p>' } }];
}

// Separate by priority and type
const highItems = items.filter(i => i.json.relevance_score === 'HIGH');
const medItems  = items.filter(i => i.json.relevance_score === 'MEDIUM' || i.json.relevance_score !== 'HIGH');
const newsItems = items.filter(i => !['EUR-Lex','UK Legislation','UK Parliament'].includes(i.json.source));
const legItems  = items.filter(i => ['EUR-Lex','UK Legislation','UK Parliament'].includes(i.json.source));

const buildTable = (rows, title, headerColor) => {
  if (rows.length === 0) return '';
  const r = rows.map(i => {
    const j = i.json;
    const priorityBadge = j.relevance_score === 'HIGH'
      ? "<span style='background:#c0392b;color:white;padding:2px 6px;border-radius:3px;font-size:10px'>HIGH</span>"
      : "<span style='background:#e67e22;color:white;padding:2px 6px;border-radius:3px;font-size:10px'>MED</span>";
    return `<tr>
      <td style='padding:8px;border:1px solid #ddd'>${priorityBadge}</td>
      <td style='padding:8px;border:1px solid #ddd'>${j.signal_type}</td>
      <td style='padding:8px;border:1px solid #ddd'><a href='${j.url}'>${(j.title||'').substring(0,80)}...</a></td>
      <td style='padding:8px;border:1px solid #ddd'>${j.companies_mentioned}</td>
      <td style='padding:8px;border:1px solid #ddd'>${j.tech_tags}</td>
      <td style='padding:8px;border:1px solid #ddd'>${j.geography}</td>
    </tr>`;
  }).join('');
  return `<h3 style='color:${headerColor};margin-top:24px'>${title} (${rows.length})</h3>
  <table style='border-collapse:collapse;width:100%;font-size:12px'>
    <tr style='background:${headerColor};color:white'>
      <th style='padding:8px'>Priority</th><th style='padding:8px'>Type</th>
      <th style='padding:8px'>Signal</th><th style='padding:8px'>Companies</th>
      <th style='padding:8px'>Tech</th><th style='padding:8px'>Geo</th>
    </tr>${r}</table>`;
};

const legTable  = buildTable(legItems,  '\u2696\ufe0f Legislation & Regulation', '#1F4E79');
const newsTable = buildTable(newsItems, '\ud83d\udcf0 News & Market Signals',     '#2E4057');

const html = `<div style='font-family:Arial,sans-serif;max-width:960px'>
  <h2>\ud83d\udea8 Signal Engine: Weekly Intelligence Alert</h2>
  <p style='color:#666'>Week of ${new Date().toLocaleDateString('en-GB')} &nbsp;|&nbsp;
     ${items.length} signals &nbsp;|&nbsp; ${highItems.length} HIGH &nbsp;|&nbsp; ${medItems.length} MEDIUM</p>
  ${legTable}<br/>${newsTable}
  <hr style='margin-top:30px'>
  <p style='color:#999;font-size:11px'>Signal Engine | FutureBridge | Auto-generated</p>
</div>`;

return [{ json: {
  subject: `\ud83d\udea8 Signal Engine: ${highItems.length} HIGH + ${medItems.length} MEDIUM signals (${legItems.length} regulatory)`,
  html,
  skip: false
}}];