// db/_datasette_contact_import.mjs — normalises and imports the Datasette
// raw export into PG contacts.
//
// Run:
//   node db/_datasette_contact_import.mjs                # dry-run, reports
//   node db/_datasette_contact_import.mjs --commit       # actually inserts

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
async function loadEnv(p) {
  if (!existsSync(p)) return;
  const raw = await readFile(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '.env'));
await loadEnv(join(__dirname, '..', 'n8n', '.env'));

const COMMIT = process.argv.includes('--commit');
const RAW_PATH = join(__dirname, '..', 'docs', 'draft_review', 'datasette_contacts_raw.json');
const IMPORT_TAG = 'datasette_export_2026_05_04';

if (!existsSync(RAW_PATH)) { console.error(`Raw export not found at ${RAW_PATH}; run _datasette_contact_export.mjs first.`); process.exit(1); }

const raw = JSON.parse(await readFile(RAW_PATH, 'utf8'));
console.log(`=== Datasette contact import ===  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
console.log(`Raw export: ${raw.total_fetched} rows from ${raw.exported_at}`);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// ============================================================================
// Helpers
// ============================================================================

function normaliseEmail(e) {
  if (!e || typeof e !== 'string') return null;
  const t = e.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}

function inferPersonaFromTitle(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  // board: C-suite + Board + Chair (per spec)
  if (/\b(ceo|cfo|coo|cto|cio|chro|chief\s+\w+\s+officer|chairman|chair\b|board|c-level|c-suite|president\b(?!.*vice))/i.test(title)) return 'board';
  // strategy: VP / SVP / Director / Head of / Vice President
  if (/\b(vp|svp|evp|vice\s+president|director|head\s+of|managing\s+director|md\b)/i.test(title)) return 'strategy';
  // operations: Manager / Lead / Senior / Principal
  if (/\b(manager|lead|senior|principal|sr\.|engineer|specialist|architect|consultant)\b/i.test(title)) return 'operations';
  return null;
}

function inferPersonaFromDatasette(persona_id, title) {
  if (persona_id && typeof persona_id === 'string') {
    const p = persona_id.toUpperCase();
    // Datasette persona_id values are underscore-delimited (e.g.
    // STRATEGY_DIRECTOR, EXECUTIVE_STRATEGIC, TECH_SCOUT). Match each token
    // bounded by start, end, or underscore so 'CTO' doesn't match DIRECTOR.
    const has = (re) => re.test('_' + p + '_');
    // Most-specific first: STRATEG* wins over EXEC* so EXECUTIVE_STRATEGIC -> strategy
    if (has(/_(STRATEGY|STRATEGIC|STRATEGIST)_/))                                            return 'strategy';
    if (has(/_(C-LEVEL|C_LEVEL|CHIEF|CEO|CFO|COO|CTO|CIO|CHRO|BOARD|CHAIR|CHAIRMAN)_/))      return 'board';
    if (has(/_(DIRECTOR|VP|SVP|EVP|HEAD|MANAGING|VICE)_/))                                   return 'strategy';
    if (has(/_(BD|COMMERCIAL|BUSINESS|GROWTH)_/))                                            return 'strategy';
    if (has(/_(TECH|ENGINEER|SCOUT|R&D|RND|OPERATIONS|MANAGER|SPECIALIST|ANALYST|PRINCIPAL|LEAD|SENIOR)_/)) return 'operations';
    if (has(/_(EXEC|EXECUTIVE)_/))                                                           return 'board';
  }
  return inferPersonaFromTitle(title);
}

function mapDatasetteSector(s) {
  if (!s || typeof s !== 'string') return 'unknown';
  const t = s.toUpperCase();
  if (t === 'MOBILITY' || t === 'AUTOMOTIVE' || t === 'TRANSPORT') return 'mobility';
  if (t === 'ENERGY' || t === 'OIL_GAS' || t === 'POWER' || t === 'UTILITIES' || t === 'CHEMICALS') return 'energy';
  if (t === 'BOTH' || t === 'INDUSTRIAL') return 'both';
  return 'unknown';
}

function safeJsonParse(s) {
  if (s === null || s === undefined || s === '') return [];
  if (Array.isArray(s)) return s;
  if (typeof s === 'string') { try { const j = JSON.parse(s); return Array.isArray(j) ? j : []; } catch { return []; } }
  return [];
}

// ============================================================================
// Step A — collect unique Datasette companies, bulk-upsert to PG companies
// ============================================================================

const datasetteCompanyMap = new Map();  // dsCompanyName -> { name, sector, entity_id, count }
for (const row of raw.rows) {
  const cn = (row.company || '').trim();
  if (!cn) continue;
  const key = cn.toLowerCase();
  if (!datasetteCompanyMap.has(key)) {
    datasetteCompanyMap.set(key, {
      name: cn,
      sector: mapDatasetteSector(row.sector),
      datasette_sector_raw: row.sector || '',
      entity_id: row.entity_id || '',
      count: 0,
    });
  }
  datasetteCompanyMap.get(key).count++;
}
console.log(`unique Datasette companies: ${datasetteCompanyMap.size}`);

// Pre-load existing PG companies (case-insensitive name -> id)
const { rows: existingCompanies } = await c.query(`SELECT id, name, sector FROM companies`);
const pgCompanyByLowerName = new Map();
for (const ec of existingCompanies) pgCompanyByLowerName.set(ec.name.toLowerCase(), ec);
console.log(`existing PG companies: ${existingCompanies.length}`);

const companiesToCreate = [];
for (const [key, info] of datasetteCompanyMap) {
  if (!pgCompanyByLowerName.has(key)) {
    companiesToCreate.push(info);
  }
}
console.log(`companies to auto-create: ${companiesToCreate.length}`);

if (COMMIT && companiesToCreate.length > 0) {
  // Bulk INSERT companies in batches of 500
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < companiesToCreate.length; i += BATCH) {
    const slice = companiesToCreate.slice(i, i + BATCH);
    const valuesSql = slice.map((_, j) => `($${j*3+1}, $${j*3+2}, $${j*3+3})`).join(',');
    const params = [];
    for (const co of slice) {
      params.push(co.name, co.sector, `Auto-created from Datasette ${IMPORT_TAG}; original sector="${co.datasette_sector_raw}"; entity_id="${co.entity_id}"; first seen on ${co.count} contact(s)`);
    }
    const r = await c.query(
      `INSERT INTO companies (name, sector, notes) VALUES ${valuesSql} ON CONFLICT (name) DO NOTHING RETURNING id, name`,
      params
    );
    inserted += r.rowCount;
  }
  console.log(`  inserted: ${inserted} companies`);

  // Refresh the PG companies map
  const { rows: refreshed } = await c.query(`SELECT id, name, sector FROM companies`);
  pgCompanyByLowerName.clear();
  for (const ec of refreshed) pgCompanyByLowerName.set(ec.name.toLowerCase(), ec);
  console.log(`  PG companies after auto-create: ${refreshed.length}`);
}

// ============================================================================
// Step B — normalise each Datasette row, bulk-upsert into PG contacts
// ============================================================================

const totals = {
  total_rows: raw.rows.length,
  email_missing: 0,
  email_invalid: 0,
  duplicate_in_batch: 0,
  prepared: 0,
  inserted: 0,
  skipped_conflict: 0,
  persona_distribution: { board: 0, strategy: 0, operations: 0, null: 0 },
  datasette_persona_id_distribution: {},
};

const seenEmails = new Set();
const prepared = [];

for (const row of raw.rows) {
  const email = normaliseEmail(row.email);
  if (!email) {
    if (!row.email) totals.email_missing++;
    else totals.email_invalid++;
    continue;
  }
  if (seenEmails.has(email)) { totals.duplicate_in_batch++; continue; }
  seenEmails.add(email);

  const company_name = (row.company || '').trim();
  const company_id = company_name ? (pgCompanyByLowerName.get(company_name.toLowerCase())?.id ?? null) : null;
  const persona_match = inferPersonaFromDatasette(row.persona_id, row.title);
  totals.persona_distribution[persona_match || 'null']++;
  if (row.persona_id) {
    totals.datasette_persona_id_distribution[row.persona_id] = (totals.datasette_persona_id_distribution[row.persona_id] || 0) + 1;
  }

  prepared.push({
    company_id,
    full_name: (row.name || '').trim() || '(unknown)',
    email,
    role_title: row.title || null,
    responsibility_area: null,  // Datasette does not have this field directly
    persona_match,
    active: true,
    imported_from: IMPORT_TAG,
    datasette_contact_id: row.contact_id || null,
    datasette_entity_id: row.entity_id || null,
    datasette_persona_id: row.persona_id || null,
    original_company_name: company_name || null,
    linkedin_url: row.linkedin || null,
    dept: row.dept || null,
    seniority: row.seniority || null,
    tier: typeof row.tier === 'number' ? row.tier : (row.tier ? parseInt(row.tier) : null),
    hq_location: row.hq || null,
    comm_style: row.comm_style || null,
    content_depth: row.content_depth || null,
    tech_interests: JSON.stringify(safeJsonParse(row.tech_interests)),
    strategies: JSON.stringify(safeJsonParse(row.strategies)),
    signal_types: JSON.stringify(safeJsonParse(row.signal_types)),
  });
}
totals.prepared = prepared.length;

console.log(`prepared rows: ${totals.prepared}`);
console.log(`  email missing : ${totals.email_missing}`);
console.log(`  email invalid : ${totals.email_invalid}`);
console.log(`  dupes in batch: ${totals.duplicate_in_batch}`);
console.log(`persona_match distribution: ${JSON.stringify(totals.persona_distribution)}`);

// Top 10 datasette_persona_id values for visibility
const topDsPersonas = Object.entries(totals.datasette_persona_id_distribution).sort((a,b)=>b[1]-a[1]).slice(0,10);
console.log(`top Datasette persona_ids: ${topDsPersonas.map(([k,v])=>`${k}=${v}`).join(', ')}`);

if (!COMMIT) {
  console.log('\n[dry-run] no inserts performed. Re-run with --commit to insert.');
  await c.end();
  process.exit(0);
}

// Bulk INSERT contacts in batches of 200 (24 cols × 200 = 4800 placeholders, well under PG limit)
const BATCH = 200;
const COLS = [
  'company_id','full_name','email','role_title','responsibility_area','persona_match','active','imported_from',
  'datasette_contact_id','datasette_entity_id','datasette_persona_id','original_company_name','linkedin_url',
  'dept','seniority','tier','hq_location','comm_style','content_depth','tech_interests','strategies','signal_types',
];

let inserted = 0, skipped = 0;
for (let i = 0; i < prepared.length; i += BATCH) {
  const slice = prepared.slice(i, i + BATCH);
  const valuesSql = slice.map((_, j) => '(' + COLS.map((_, k) => `$${j*COLS.length + k + 1}`).join(',') + ')').join(',');
  const params = [];
  for (const r of slice) {
    for (const col of COLS) params.push(r[col]);
  }
  const sql = `INSERT INTO contacts (${COLS.join(',')}) VALUES ${valuesSql} ON CONFLICT (email) DO NOTHING RETURNING id`;
  const res = await c.query(sql, params);
  inserted += res.rowCount;
  skipped += slice.length - res.rowCount;
  if ((i / BATCH) % 10 === 0) {
    console.log(`  batch ${Math.floor(i / BATCH) + 1}: cumulative inserted=${inserted}, skipped(conflict)=${skipped}`);
  }
}
totals.inserted = inserted;
totals.skipped_conflict = skipped;

console.log('\n=== Summary ===');
console.log(JSON.stringify(totals, null, 2));

// Final verification
const { rows: final } = await c.query(`SELECT count(*)::int AS n FROM contacts`);
const { rows: byImport } = await c.query(`SELECT imported_from, count(*)::int AS n FROM contacts GROUP BY imported_from ORDER BY n DESC`);
const { rows: byPersona } = await c.query(`SELECT persona_match, count(*)::int AS n FROM contacts GROUP BY persona_match ORDER BY n DESC`);
console.log(`\nfinal PG contacts row count: ${final[0].n}`);
console.log('by imported_from:', byImport);
console.log('by persona_match:', byPersona);

await c.end();
