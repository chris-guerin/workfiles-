// node: Build YAMM CSV — Wire Contacts Here
// id:   a0f20b0b-5dc9-4bf4-b3c1-9e0f970413b0
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
const data = $('Parse YAMM Response').first().json;
const variants = data.email_variants;
const today = data.today;
const topic = data.today_topic;
const signal = variants.signal_summary_one_line;

const raw = $('Get Energy Contacts').first().json;
const contacts = raw.rows || [];

const personaMap = {
  'EXECUTIVE_STRATEGIC': { subject: variants.subject_executive, body: variants.body_executive },
  'STRATEGY_DIRECTOR':   { subject: variants.subject_strategy,  body: variants.body_strategy },
  'TECH_SCOUT':          { subject: variants.subject_tech,       body: variants.body_tech }
};

const rows = contacts
  .filter(c => personaMap[c[2]] && c[1])
  .map(c => {
    const nameParts = (c[0] || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const variant = personaMap[c[2]];
    return [firstName, lastName, c[1], c[2], variant.subject, variant.body, signal, topic, today]
      .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
  });

const header = '"First Name","Last Name","Email","Persona","Subject","Body","Signal","Topic","Date"';
const csv = [header, ...rows].join('\n');

return [{ json: { yamm_csv: csv, row_count: rows.length, today, topic, suggested_filename: 'YAMM_' + today + '_' + topic.replace(/\s+/g, '_') + '.csv' } }];