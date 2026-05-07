// node: Map to Canonical Schema
// id:   b2e1d09a-0001-4b00-9000-000000000001
// type: n8n-nodes-base.code
// --- code below this line is what runs in n8n ---
// WeeklyNews — Map to Canonical Schema — 2026-05-07
// MAP TO CANONICAL SCHEMA — Fallback (no crypto)
// Mode: Run Once for Each Item

const row = $input.item.json || {};
const today = new Date().toISOString().slice(0, 10);

function pick(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}

function clean(v) {
  return String(v || '').replace(/\s+/g, ' ').replace(/\u0000/g, '').trim();
}

function dateOnly(v) {
  const raw = clean(v);
  if (!raw) return today;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10) || today;
  return d.toISOString().slice(0, 10);
}

function sourceHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36).padStart(8, '0');
}

const title = clean(pick(row.sector_tags, row.title, row.headline, row.signal_title));
const summary = clean(pick(row.notes, row.Notes, row.tech_tags, row.summary, row.description, row.raw_text));
const raw_text = [title, summary].filter(Boolean).join(' — ').slice(0, 6000);

if (!title && !raw_text) {
  return { json: { skip: true, skip_reason: 'EMPTY_CONTENT' } };
}

const url = clean(pick(row.url, row.link, row.article_url));
const source = clean(pick(row.source, row.publication, row.publisher, sourceHost(url)));
const published_date = dateOnly(pick(row.pub_date, row.published_date, row.date, row.pubDate));
const source_type = clean(pick(row.source_type, row.signal_type, 'news')).toLowerCase() || 'news';
const sector_tags = clean(pick(row.sector_tags, row.sectors, row.topic));
const companies_mentioned = clean(pick(row.companies_mentioned, row.company, row.entities));
const geography = clean(pick(row.geography, row.region, row.country));

const fingerprint = simpleHash(title.toLowerCase() + '|' + published_date);
const signal_id = pick(row.signal_id, 'SIG_' + published_date.replace(/-/g, '') + '_' + fingerprint);

return {
  json: {
    signal_id, title, source, source_host: sourceHost(url), url, published_date,
    raw_text, source_type, sector_tags, companies_mentioned, geography,
    prescore: 0, prescore_band: 'UNSCORED', fingerprint, skip: false,
    news_id: row.id || null,
    news_content_hash: row.content_hash || null,
  }
};