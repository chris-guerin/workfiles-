// signal-engine-api — thin HTTP layer over hypothesis-db for n8n workflows
// and v2 catalogue population.
//
// v1 (signal-pipeline) endpoints:
//   POST   /news           Body: news columns. Computes content_hash from title+url+pub_date.
//                          Checks news + mini_signals for hash. Returns inserted | duplicate.
//   GET    /news           Returns all news rows ordered by pub_date DESC.
//   DELETE /news/:id       Hard-deletes the row.
//   POST   /mini_signals   Body: mini_signals columns + optional heat_map_increments[]
//                          array of {sector_tag, company, signal_type}. API upserts each
//                          increment into heat_map_aggregates with date = today.
//
// v2 (initiative-model) endpoints — see /docs/SCHEMA_V2.md:
//   /companies                       POST | GET | GET /:id
//   /initiatives_v2                  POST | GET (?company_id) | GET /:id
//   /components                      POST | GET (?initiative_id) | GET /:id
//   /component_attributes            POST (single or array, idempotent upsert) | GET (?component_id)
//   /attribute_definitions           GET (?vector) | GET /:id
//   /tech_functions                  GET | POST
//   /claims_v2                       POST | GET (?initiative_id, ?component_id)
//   /components_incomplete           GET
//   /components_with_full_record     GET (?company_id, ?initiative_id)
//
// All endpoints require Authorization: Bearer <API_KEY>.
//
// Health:
//   GET    /health         Public, returns {ok: true} for Railway healthcheck.

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!API_KEY) {
  console.error('Missing API_KEY env var. Aborting.');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL env var. Aborting.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[pg pool error]', err);
});

const app = express();

// CORS — allow GitHub Pages (where account_plans_v8.html lives) and local
// dev origins. Must be applied BEFORE the body parser so preflight OPTIONS
// requests short-circuit cleanly (204) without express trying to read a body.
// Server-to-server callers (n8n, population scripts, smoke tests) don't hit
// CORS — only browser callers do — so this is purely additive.
app.use(cors({
  origin: [
    'https://chris-guerin.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'anthropic-dangerous-direct-browser-access',
  ],
}));

app.use(express.json({ limit: '2mb' }));

// ---------- auth middleware ----------
function requireApiKey(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = match ? match[1].trim() : '';
  if (!provided || provided !== API_KEY) {
    return res.status(401).json({ status: 'unauthorised' });
  }
  next();
}

// ---------- health (public) ----------
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ---------- POST /news ----------
function computeContentHash(title, url, pubDate) {
  const input = `${title || ''}|${url || ''}|${pubDate || ''}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

app.post('/news', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.url || !b.source) {
    return res.status(400).json({ status: 'invalid', error: 'title, url, source required' });
  }

  const content_hash = computeContentHash(b.title, b.url, b.pub_date);

  const client = await pool.connect();
  try {
    // Check both tables for the hash
    const dupNews = await client.query(
      'SELECT id FROM news WHERE content_hash = $1 LIMIT 1',
      [content_hash]
    );
    if (dupNews.rowCount > 0) {
      return res.json({ status: 'duplicate', table: 'news', existing_id: dupNews.rows[0].id });
    }
    const dupMini = await client.query(
      'SELECT id FROM mini_signals WHERE content_hash = $1 LIMIT 1',
      [content_hash]
    );
    if (dupMini.rowCount > 0) {
      return res.json({ status: 'duplicate', table: 'mini_signals', existing_id: dupMini.rows[0].id });
    }

    const insert = await client.query(
      `INSERT INTO news (
        signal_id, source, signal_type, title, sector_tags, tech_tags, geography,
        companies_mentioned, relevance_score, url, pub_date, processed_at, content_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
      RETURNING id`,
      [
        b.signal_id || `news_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        b.source,
        b.signal_type ?? null,
        b.title,
        b.sector_tags ?? null,
        b.tech_tags ?? null,
        b.geography ?? null,
        b.companies_mentioned ?? null,
        b.relevance_score ?? null,
        b.url,
        b.pub_date ?? null,
        content_hash,
      ]
    );
    res.json({ status: 'inserted', id: insert.rows[0].id, content_hash });
  } catch (err) {
    console.error('[POST /news]', err);
    res.status(500).json({ status: 'error', error: err.message });
  } finally {
    client.release();
  }
});

// ---------- GET /news ----------
app.get('/news', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM news ORDER BY pub_date DESC NULLS LAST, id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /news]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- DELETE /news/:id ----------
app.delete('/news/:id', requireApiKey, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ status: 'invalid', error: 'id must be a positive integer' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM news WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ status: 'not_found', id });
    }
    res.json({ status: 'deleted', id });
  } catch (err) {
    console.error('[DELETE /news/:id]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- POST /mini_signals ----------
const MINI_SIGNAL_COLS = [
  'signal_id', 'extracted_at', 'published_date', 'source', 'source_type', 'url',
  'headline', 'companies', 'technologies', 'geography', 'event_type',
  'value_chain_position', 'short_summary', 'evidence_snippet', 'content_density',
  'confidence', 'extraction_model', 'reasoning_classification', 'reasoning_at',
  'hypothesis_matches', 'novelty_assessment', 'candidate_hypothesis',
  'pattern_cluster_id', 'source_news_id', 'content_hash',
];

app.post('/mini_signals', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.signal_id || !b.headline || !b.content_hash) {
    return res.status(400).json({
      status: 'invalid',
      error: 'signal_id, headline, content_hash required',
    });
  }

  // Build the INSERT only over columns the body actually provides.
  // Omitted columns fall through to their DDL DEFAULT (e.g. extracted_at = NOW()).
  const providedCols = MINI_SIGNAL_COLS.filter((c) => b[c] !== undefined);
  const values = providedCols.map((c) => b[c]);
  const placeholders = providedCols.map((_, i) => `$${i + 1}`).join(', ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insert = await client.query(
      `INSERT INTO mini_signals (${providedCols.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
      values
    );
    const miniSignalId = insert.rows[0].id;

    // Heat map increments: array of {sector_tag, company, signal_type}.
    // Date is today (date of POST). Upsert with count = count + 1.
    const increments = Array.isArray(b.heat_map_increments) ? b.heat_map_increments : [];
    let incCount = 0;
    for (const inc of increments) {
      await client.query(
        `INSERT INTO heat_map_aggregates (date, sector_tag, company, signal_type, count)
         VALUES (CURRENT_DATE, $1, $2, $3, 1)
         ON CONFLICT (date, sector_tag, company, signal_type)
         DO UPDATE SET count = heat_map_aggregates.count + 1`,
        [inc.sector_tag ?? null, inc.company ?? null, inc.signal_type ?? null]
      );
      incCount++;
    }

    await client.query('COMMIT');
    res.json({
      status: 'inserted',
      id: miniSignalId,
      heat_map_increments_applied: incCount,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /mini_signals]', err);
    res.status(500).json({ status: 'error', error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================================
// v2 endpoints (initiative-model — see /docs/SCHEMA_V2.md)
// ============================================================================

// ---------- helpers ----------

// Pick only allowed keys from body. Returns object suitable for column-driven INSERT.
function pickFields(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

// Build a positional-parameter INSERT from a {col: val} object.
function buildInsert(table, obj, returningCols = ['*']) {
  const cols = Object.keys(obj);
  if (cols.length === 0) {
    throw new Error(`buildInsert: no columns supplied for ${table}`);
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING ${returningCols.join(', ')}`;
  return { sql, values: cols.map((c) => obj[c]) };
}

function parsePositiveInt(s) {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// 404-friendly fetch-by-id helper.
async function getRowById(res, table, id, label = table) {
  const numId = parsePositiveInt(id);
  if (numId === null) {
    return res.status(400).json({ status: 'invalid', error: `${label} id must be a positive integer` });
  }
  try {
    const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [numId]);
    if (rows.length === 0) {
      return res.status(404).json({ status: 'not_found', table: label, id: numId });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(`[GET ${label}/:id]`, err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

// ---------- /companies ----------
const COMPANY_COLS = ['name', 'sector', 'notes'];

app.post('/companies', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.sector) {
    return res.status(400).json({ status: 'invalid', error: 'name and sector required' });
  }
  if (!['energy', 'mobility', 'both'].includes(b.sector)) {
    return res.status(400).json({ status: 'invalid', error: "sector must be 'energy', 'mobility', or 'both'" });
  }
  const fields = pickFields(b, COMPANY_COLS);
  try {
    const { sql, values } = buildInsert('companies', fields);
    const { rows } = await pool.query(sql, values);
    res.status(201).json({ status: 'inserted', row: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ status: 'conflict', error: `company name '${b.name}' already exists` });
    }
    console.error('[POST /companies]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/companies', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM companies ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('[GET /companies]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/companies/:id', requireApiKey, async (req, res) => {
  return getRowById(res, 'companies', req.params.id, 'companies');
});

// ---------- /initiatives_v2 ----------
const INITIATIVE_V2_COLS = [
  'company_id', 'name', 'strategy_context', 'brief_description',
  'hypothesis_statement', 'why_it_matters', 'horizon', 'persona',
  'time_horizon_year', 'time_horizon_source', 'decision_threshold',
  'baseline_confidence', 'current_confidence', 'draft_status',
  'state', 'trajectory', 'last_state_change_date',
];

const INITIATIVE_V2_PATCH_COLS = [
  'strategy_context', 'brief_description', 'hypothesis_statement',
  'why_it_matters', 'horizon', 'persona', 'time_horizon_year',
  'time_horizon_source', 'decision_threshold', 'baseline_confidence',
  'current_confidence', 'draft_status', 'state', 'trajectory',
  'last_state_change_date',
];

app.post('/initiatives_v2', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.company_id || !b.name) {
    return res.status(400).json({ status: 'invalid', error: 'company_id and name required' });
  }
  const fields = pickFields(b, INITIATIVE_V2_COLS);
  try {
    const { sql, values } = buildInsert('initiatives_v2', fields);
    const { rows } = await pool.query(sql, values);
    res.status(201).json({ status: 'inserted', row: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ status: 'conflict', error: `initiative '${b.name}' already exists for company_id=${b.company_id}` });
    }
    if (err.code === '23503') {
      return res.status(400).json({ status: 'invalid', error: `company_id=${b.company_id} does not exist` });
    }
    if (err.code === '23514') {
      return res.status(400).json({ status: 'invalid', error: `CHECK constraint violation: ${err.message}` });
    }
    console.error('[POST /initiatives_v2]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/initiatives_v2', requireApiKey, async (req, res) => {
  const companyId = req.query.company_id ? parsePositiveInt(req.query.company_id) : null;
  if (req.query.company_id && companyId === null) {
    return res.status(400).json({ status: 'invalid', error: 'company_id must be a positive integer' });
  }
  try {
    const sql = companyId
      ? 'SELECT * FROM initiatives_v2 WHERE company_id = $1 ORDER BY id ASC'
      : 'SELECT * FROM initiatives_v2 ORDER BY id ASC';
    const { rows } = await pool.query(sql, companyId ? [companyId] : []);
    res.json(rows);
  } catch (err) {
    console.error('[GET /initiatives_v2]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/initiatives_v2/:id', requireApiKey, async (req, res) => {
  return getRowById(res, 'initiatives_v2', req.params.id, 'initiatives_v2');
});

app.patch('/initiatives_v2/:id', requireApiKey, async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) return res.status(400).json({ status: 'invalid', error: 'id must be a positive integer' });
  const body = req.body || {};
  const fields = pickFields(body, INITIATIVE_V2_PATCH_COLS);
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ status: 'invalid', error: 'no updatable fields provided' });
  }
  const setCols = Object.keys(fields);
  const placeholders = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const values = setCols.map((c) => fields[c]);
  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE initiatives_v2 SET ${placeholders}, last_updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ status: 'not_found', table: 'initiatives_v2', id });
    res.json({ status: 'updated', row: rows[0] });
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ status: 'invalid', error: `CHECK constraint violation: ${err.message}` });
    console.error('[PATCH /initiatives_v2/:id]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- /components ----------
const COMPONENT_COLS = [
  'initiative_id', 'parent_component_id', 'name', 'description',
  'component_type', 'vector', 'horizon', 'asset_replacement_cycle_years',
  'cross_industry', 'draft_status', 'source_citation',
  'state', 'trajectory',
];

const COMPONENT_PATCH_COLS = [
  'parent_component_id', 'name', 'description', 'horizon',
  'asset_replacement_cycle_years', 'cross_industry', 'draft_status',
  'source_citation', 'state', 'trajectory',
];

app.post('/components', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.initiative_id || !b.name || !b.component_type || !b.vector || !b.source_citation) {
    return res.status(400).json({
      status: 'invalid',
      error: 'initiative_id, name, component_type, vector, source_citation all required',
    });
  }
  const fields = pickFields(b, COMPONENT_COLS);
  try {
    const { sql, values } = buildInsert('components', fields);
    const { rows } = await pool.query(sql, values);
    res.status(201).json({ status: 'inserted', row: rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ status: 'invalid', error: `FK violation: ${err.detail || err.message}` });
    }
    if (err.code === '23514') {
      return res.status(400).json({ status: 'invalid', error: `CHECK constraint violation: ${err.message}` });
    }
    console.error('[POST /components]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/components', requireApiKey, async (req, res) => {
  const initiativeId = req.query.initiative_id ? parsePositiveInt(req.query.initiative_id) : null;
  if (req.query.initiative_id && initiativeId === null) {
    return res.status(400).json({ status: 'invalid', error: 'initiative_id must be a positive integer' });
  }
  try {
    const sql = initiativeId
      ? 'SELECT * FROM components WHERE initiative_id = $1 ORDER BY id ASC'
      : 'SELECT * FROM components ORDER BY id ASC';
    const { rows } = await pool.query(sql, initiativeId ? [initiativeId] : []);
    res.json(rows);
  } catch (err) {
    console.error('[GET /components]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/components/:id', requireApiKey, async (req, res) => {
  return getRowById(res, 'components', req.params.id, 'components');
});

app.patch('/components/:id', requireApiKey, async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) return res.status(400).json({ status: 'invalid', error: 'id must be a positive integer' });
  const body = req.body || {};
  const fields = pickFields(body, COMPONENT_PATCH_COLS);
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ status: 'invalid', error: 'no updatable fields provided' });
  }
  const setCols = Object.keys(fields);
  const placeholders = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const values = setCols.map((c) => fields[c]);
  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE components SET ${placeholders}, last_updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ status: 'not_found', table: 'components', id });
    res.json({ status: 'updated', row: rows[0] });
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ status: 'invalid', error: `CHECK constraint violation: ${err.message}` });
    console.error('[PATCH /components/:id]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- /component_attributes ----------
// Idempotent upsert on conflict (component_id, attribute_def_id).
// Accepts single object or array of objects in body.
const COMPONENT_ATTR_COLS = [
  'component_id', 'attribute_def_id', 'value_numeric', 'value_text',
  'value_categorical', 'value_controlled_vocab_id', 'value_status',
  'not_in_source_reason', 'not_applicable_reason', 'source_citation',
  'confidence_band', 'measured_at',
];

// Validate one attribute body. Returns null on OK, error message string on failure.
function validateAttributeBody(b) {
  if (!b || typeof b !== 'object') return 'body must be an object';
  if (!b.component_id || !b.attribute_def_id) return 'component_id and attribute_def_id required';
  if (!b.value_status) return 'value_status required';
  const valid = ['populated', 'not_in_source', 'not_applicable', 'pending'];
  if (!valid.includes(b.value_status)) {
    return `value_status must be one of ${valid.join(', ')}`;
  }
  if (b.value_status === 'pending') {
    return 'value_status=pending is not allowed on POST — use a resolved status (populated, not_in_source, not_applicable). pending is only valid as the trigger-created initial state.';
  }
  if (b.value_status === 'populated') {
    if (!b.source_citation || String(b.source_citation).trim() === '') {
      return "value_status='populated' requires source_citation present and non-empty";
    }
  }
  if (b.value_status === 'not_in_source') {
    if (!b.not_in_source_reason || String(b.not_in_source_reason).trim() === '') {
      return "value_status='not_in_source' requires not_in_source_reason present and non-empty";
    }
  }
  if (b.value_status === 'not_applicable') {
    if (!b.not_applicable_reason || String(b.not_applicable_reason).trim() === '') {
      return "value_status='not_applicable' requires not_applicable_reason present and non-empty";
    }
  }
  return null;
}

app.post('/component_attributes', requireApiKey, async (req, res) => {
  const body = req.body;
  const items = Array.isArray(body) ? body : (body ? [body] : []);
  if (items.length === 0) {
    return res.status(400).json({ status: 'invalid', error: 'body must be an object or non-empty array' });
  }
  // Validate every item upfront — fail fast with the first index that's invalid.
  for (let i = 0; i < items.length; i++) {
    const err = validateAttributeBody(items[i]);
    if (err) return res.status(400).json({ status: 'invalid', index: i, error: err });
  }

  const upsertSql = `
    INSERT INTO component_attributes
      (component_id, attribute_def_id, value_numeric, value_text, value_categorical,
       value_controlled_vocab_id, value_status, not_in_source_reason, not_applicable_reason,
       source_citation, confidence_band, measured_at, last_updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
    ON CONFLICT (component_id, attribute_def_id) DO UPDATE SET
      value_numeric             = EXCLUDED.value_numeric,
      value_text                = EXCLUDED.value_text,
      value_categorical         = EXCLUDED.value_categorical,
      value_controlled_vocab_id = EXCLUDED.value_controlled_vocab_id,
      value_status              = EXCLUDED.value_status,
      not_in_source_reason      = EXCLUDED.not_in_source_reason,
      not_applicable_reason     = EXCLUDED.not_applicable_reason,
      source_citation           = EXCLUDED.source_citation,
      confidence_band           = EXCLUDED.confidence_band,
      measured_at               = EXCLUDED.measured_at,
      last_updated_at           = NOW()
    RETURNING *`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = [];
    for (const b of items) {
      const fields = pickFields(b, COMPONENT_ATTR_COLS);
      const { rows } = await client.query(upsertSql, [
        fields.component_id,
        fields.attribute_def_id,
        fields.value_numeric ?? null,
        fields.value_text ?? null,
        fields.value_categorical ?? null,
        fields.value_controlled_vocab_id ?? null,
        fields.value_status,
        fields.not_in_source_reason ?? null,
        fields.not_applicable_reason ?? null,
        fields.source_citation ?? null,
        fields.confidence_band ?? null,
        fields.measured_at ?? null,
      ]);
      out.push(rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ status: 'upserted', count: out.length, rows: out });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23503') {
      return res.status(400).json({ status: 'invalid', error: `FK violation: ${err.detail || err.message}` });
    }
    if (err.code === '23514') {
      return res.status(400).json({ status: 'invalid', error: `CHECK constraint violation: ${err.message}` });
    }
    console.error('[POST /component_attributes]', err);
    res.status(500).json({ status: 'error', error: err.message });
  } finally {
    client.release();
  }
});

app.get('/component_attributes', requireApiKey, async (req, res) => {
  const componentId = req.query.component_id ? parsePositiveInt(req.query.component_id) : null;
  if (req.query.component_id && componentId === null) {
    return res.status(400).json({ status: 'invalid', error: 'component_id must be a positive integer' });
  }
  try {
    const sql = componentId
      ? 'SELECT * FROM component_attributes WHERE component_id = $1 ORDER BY attribute_def_id ASC'
      : 'SELECT * FROM component_attributes ORDER BY component_id ASC, attribute_def_id ASC';
    const { rows } = await pool.query(sql, componentId ? [componentId] : []);
    res.json(rows);
  } catch (err) {
    console.error('[GET /component_attributes]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- /attribute_definitions (read-only) ----------
app.get('/attribute_definitions', requireApiKey, async (req, res) => {
  const vector = req.query.vector;
  const valid = ['tech', 'regulation', 'market', 'ecosystem', 'competition'];
  if (vector && !valid.includes(vector)) {
    return res.status(400).json({ status: 'invalid', error: `vector must be one of ${valid.join(', ')}` });
  }
  try {
    const sql = vector
      ? 'SELECT * FROM attribute_definitions WHERE vector = $1 ORDER BY display_order ASC'
      : 'SELECT * FROM attribute_definitions ORDER BY vector ASC, display_order ASC';
    const { rows } = await pool.query(sql, vector ? [vector] : []);
    res.json(rows);
  } catch (err) {
    console.error('[GET /attribute_definitions]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/attribute_definitions/:id', requireApiKey, async (req, res) => {
  return getRowById(res, 'attribute_definitions', req.params.id, 'attribute_definitions');
});

// ---------- /tech_functions ----------
const TECH_FUNCTION_COLS = ['function_name', 'description', 'physical_principle', 'typical_failure_mode'];

app.get('/tech_functions', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tech_functions ORDER BY function_name ASC');
    res.json(rows);
  } catch (err) {
    console.error('[GET /tech_functions]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/tech_functions', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.function_name || !b.description) {
    return res.status(400).json({ status: 'invalid', error: 'function_name and description required' });
  }
  const fields = pickFields(b, TECH_FUNCTION_COLS);
  try {
    const { sql, values } = buildInsert('tech_functions', fields);
    const { rows } = await pool.query(sql, values);
    res.status(201).json({ status: 'inserted', row: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ status: 'conflict', error: `function_name '${b.function_name}' already exists` });
    }
    console.error('[POST /tech_functions]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- /claims_v2 ----------
const CLAIMS_V2_COLS = [
  'initiative_id', 'component_id', 'claim_text', 'attribute_def_id',
  'threshold_op', 'threshold_value_numeric', 'threshold_value_text',
  'threshold_unit', 'deadline_date', 'role', 'impact', 'criticality',
  'claim_basis', 'draft_status',
];

app.post('/claims_v2', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.initiative_id || !b.component_id || !b.claim_text || !b.role || !b.impact || !b.criticality) {
    return res.status(400).json({
      status: 'invalid',
      error: 'initiative_id, component_id, claim_text, role, impact, criticality all required',
    });
  }
  const fields = pickFields(b, CLAIMS_V2_COLS);
  try {
    const { sql, values } = buildInsert('claims_v2', fields);
    const { rows } = await pool.query(sql, values);
    res.status(201).json({ status: 'inserted', row: rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ status: 'invalid', error: `FK violation: ${err.detail || err.message}` });
    }
    if (err.code === '23514') {
      return res.status(400).json({ status: 'invalid', error: `CHECK constraint violation: ${err.message}` });
    }
    console.error('[POST /claims_v2]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/claims_v2', requireApiKey, async (req, res) => {
  const initiativeId = req.query.initiative_id ? parsePositiveInt(req.query.initiative_id) : null;
  const componentId  = req.query.component_id  ? parsePositiveInt(req.query.component_id)  : null;
  if (req.query.initiative_id && initiativeId === null) {
    return res.status(400).json({ status: 'invalid', error: 'initiative_id must be a positive integer' });
  }
  if (req.query.component_id && componentId === null) {
    return res.status(400).json({ status: 'invalid', error: 'component_id must be a positive integer' });
  }
  try {
    const where = [];
    const args = [];
    if (initiativeId) { args.push(initiativeId); where.push(`initiative_id = $${args.length}`); }
    if (componentId)  { args.push(componentId);  where.push(`component_id = $${args.length}`); }
    const sql = `SELECT * FROM claims_v2 ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id ASC`;
    const { rows } = await pool.query(sql, args);
    res.json(rows);
  } catch (err) {
    console.error('[GET /claims_v2]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- /components_incomplete (audit view) ----------
app.get('/components_incomplete', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM components_incomplete ORDER BY component_id ASC');
    res.json(rows);
  } catch (err) {
    console.error('[GET /components_incomplete]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- /mini_signals_v3 (v3 framework — Haiku-extracted structured signal) ----------
const MINI_SIGNALS_V3_COLS = [
  'source_news_id','signal_text','signal_type','extracted_entities','extracted_attribute_types',
  'extracted_values','extracted_geographic_scope','extracted_temporal_scope_start',
  'extracted_temporal_scope_end','extracted_at','extraction_confidence','extraction_model',
  'source_url','pub_date',
  // Migration 011 soft-signal columns
  'soft_signal_type','soft_signal_subject','soft_signal_direction','soft_signal_reasoning',
];
const VALID_SIGNAL_TYPES = ['announcement','decision','data_release','commitment','commentary','regulatory_change','financial_filing','other'];

app.post('/mini_signals_v3', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.signal_text || !b.signal_type) {
    return res.status(400).json({ status: 'invalid', error: 'signal_text and signal_type required' });
  }
  if (!VALID_SIGNAL_TYPES.includes(b.signal_type)) {
    return res.status(400).json({ status: 'invalid', error: `signal_type must be one of ${VALID_SIGNAL_TYPES.join(', ')}` });
  }
  // Coerce JSONB-shaped fields
  const fields = {};
  for (const c of MINI_SIGNALS_V3_COLS) if (b[c] !== undefined) fields[c] = b[c];
  if (!fields.extracted_at) fields.extracted_at = new Date().toISOString();
  if (!fields.extraction_model) fields.extraction_model = 'claude-haiku-4-5';
  // JSONB fields must be sent as JSON-encoded strings to PG
  for (const j of ['extracted_entities','extracted_attribute_types','extracted_values','extracted_geographic_scope']) {
    if (fields[j] !== undefined && typeof fields[j] !== 'string') {
      fields[j] = JSON.stringify(fields[j]);
    }
  }
  try {
    const cols = Object.keys(fields);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const vals = cols.map((c) => fields[c]);
    const { rows } = await pool.query(
      `INSERT INTO mini_signals_v3 (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    res.status(201).json({ status: 'inserted', row: rows[0] });
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ status: 'invalid', error: `CHECK constraint violation: ${err.message}` });
    if (err.code === '23503') return res.status(400).json({ status: 'invalid', error: `FK violation: ${err.detail || err.message}` });
    console.error('[POST /mini_signals_v3]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/mini_signals_v3', requireApiKey, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM mini_signals_v3 ORDER BY id DESC LIMIT $1`, [limit]
    );
    res.json(rows);
  } catch (err) { console.error('[GET /mini_signals_v3]', err); res.status(500).json({ status: 'error', error: err.message }); }
});

// ---------- /components_with_full_record (worksheet view) ----------
// Filters via JOIN against components + initiatives_v2 since the view itself
// doesn't expose company_id / initiative_id columns directly.
app.get('/components_with_full_record', requireApiKey, async (req, res) => {
  const companyId    = req.query.company_id    ? parsePositiveInt(req.query.company_id)    : null;
  const initiativeId = req.query.initiative_id ? parsePositiveInt(req.query.initiative_id) : null;
  if (req.query.company_id && companyId === null) {
    return res.status(400).json({ status: 'invalid', error: 'company_id must be a positive integer' });
  }
  if (req.query.initiative_id && initiativeId === null) {
    return res.status(400).json({ status: 'invalid', error: 'initiative_id must be a positive integer' });
  }
  try {
    let sql = `
      SELECT cwfr.*
      FROM components_with_full_record cwfr
      JOIN components c     ON c.id = cwfr.component_id
      JOIN initiatives_v2 i ON i.id = c.initiative_id
    `;
    const args = [];
    const where = [];
    if (companyId)    { args.push(companyId);    where.push(`i.company_id = $${args.length}`); }
    if (initiativeId) { args.push(initiativeId); where.push(`c.initiative_id = $${args.length}`); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY cwfr.component_id ASC';
    const { rows } = await pool.query(sql, args);
    res.json(rows);
  } catch (err) {
    console.error('[GET /components_with_full_record]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ============================================================================
// /signal_route/* — v3 matching framework operational pipeline
// ============================================================================

// Matching SQL bodies per /docs/SCHEMA_V3.md section 6.
const SQL_MATCH_DIRECT_NAME = `
  INSERT INTO signal_candidate_matches
    (mini_signal_id, component_id, match_method, match_strength, match_basis_text)
  SELECT DISTINCT
    ms.id,
    cn.reference_id,
    'direct_name',
    0.95,
    'extracted_entity matched component name: ' || entity.value
  FROM mini_signals_v3 ms
  CROSS JOIN LATERAL jsonb_array_elements_text(ms.extracted_entities) AS entity(value)
  JOIN catalogue_names cn ON (
    LOWER(cn.entity_name) = LOWER(entity.value)
    OR LOWER(entity.value) = ANY(SELECT LOWER(unnest(cn.aliases)))
  )
  WHERE cn.entity_type = 'component'
    AND cn.reference_table = 'components'
    AND ms.id = $1
  RETURNING id`;

const SQL_MATCH_ATTRIBUTE_REFERENCE = `
  INSERT INTO signal_candidate_matches
    (mini_signal_id, component_id, match_method, match_strength, match_basis_text)
  SELECT DISTINCT
    ms.id, c.id, 'attribute_reference', 0.7,
    'extracted_attribute_types overlapped with populated attributes on component'
  FROM mini_signals_v3 ms
  CROSS JOIN LATERAL jsonb_array_elements_text(ms.extracted_attribute_types) AS attr_type(value)
  JOIN attribute_definitions ad ON ad.attribute_name = attr_type.value
  JOIN component_attributes ca ON ca.attribute_def_id = ad.id AND ca.value_status = 'populated'
  JOIN components c ON c.id = ca.component_id
  WHERE ms.id = $1
  RETURNING id`;

const SQL_MATCH_TECH_FUNCTION = `
  INSERT INTO signal_candidate_matches
    (mini_signal_id, component_id, tech_function_id, match_method, match_strength, match_basis_text)
  SELECT DISTINCT
    ms.id, c.id, tf.id, 'tech_function', 0.6,
    'extracted_entity matched tech_function shared by this component'
  FROM mini_signals_v3 ms
  CROSS JOIN LATERAL jsonb_array_elements_text(ms.extracted_entities) AS entity(value)
  JOIN tech_functions tf ON LOWER(tf.function_name) = LOWER(entity.value)
  JOIN component_attributes ca ON ca.value_controlled_vocab_id = tf.id
  JOIN components c ON c.id = ca.component_id
  WHERE ms.id = $1
  RETURNING id`;

const SQL_MATCH_DEPENDENCY_CHAIN = `
  INSERT INTO signal_candidate_matches
    (mini_signal_id, component_id, match_method, match_strength, match_basis_text)
  SELECT DISTINCT
    scm.mini_signal_id,
    cd.target_component_id,
    'dependency_chain',
    CASE cd.dependency_strength
      WHEN 'critical' THEN 0.5
      WHEN 'high'     THEN 0.4
      WHEN 'medium'   THEN 0.3
      ELSE 0.2
    END,
    'matched via dependency_type=' || cd.dependency_type || ' from already-matched component'
  FROM signal_candidate_matches scm
  JOIN component_dependencies cd ON cd.source_component_id = scm.component_id
  WHERE scm.mini_signal_id = $1
    AND scm.match_method != 'dependency_chain'
    AND NOT EXISTS (
      SELECT 1 FROM signal_candidate_matches existing
      WHERE existing.mini_signal_id = scm.mini_signal_id
        AND existing.component_id = cd.target_component_id
    )
  RETURNING id`;

app.post('/signal_route/match', requireApiKey, async (req, res) => {
  const id = parsePositiveInt(req.body?.mini_signal_id);
  if (id === null) return res.status(400).json({ status: 'invalid', error: 'mini_signal_id required (positive integer)' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const direct = await client.query(SQL_MATCH_DIRECT_NAME, [id]);
    const attrRef = await client.query(SQL_MATCH_ATTRIBUTE_REFERENCE, [id]);
    const techFn = await client.query(SQL_MATCH_TECH_FUNCTION, [id]);
    const depChain = await client.query(SQL_MATCH_DEPENDENCY_CHAIN, [id]);
    await client.query('COMMIT');
    res.status(201).json({
      status: 'matched',
      mini_signal_id: id,
      counts: {
        direct_name: direct.rowCount,
        attribute_reference: attrRef.rowCount,
        tech_function: techFn.rowCount,
        dependency_chain: depChain.rowCount,
        total: direct.rowCount + attrRef.rowCount + techFn.rowCount + depChain.rowCount,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /signal_route/match]', err);
    res.status(500).json({ status: 'error', error: err.message });
  } finally { client.release(); }
});

// ===== Anthropic helper for Sonnet calls =====
async function callSonnet(systemPrompt, userPrompt, maxTokens = 1500) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY env var not set on Railway');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  return j.content?.[0]?.text || '';
}

function tryExtractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const s = fenced ? fenced[1] : text;
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

// POST /signal_route/assess_impact — Sonnet evaluates whether the candidate
// match's component's claims are moved by the signal; writes signal_claim_impacts.
app.post('/signal_route/assess_impact', requireApiKey, async (req, res) => {
  const candidateId = parsePositiveInt(req.body?.candidate_match_id);
  if (candidateId === null) return res.status(400).json({ status: 'invalid', error: 'candidate_match_id required' });
  try {
    // Load context: candidate match + signal + component + claims + populated attributes
    const { rows: ctxRows } = await pool.query(`
      SELECT
        scm.id AS match_id, scm.mini_signal_id, scm.component_id, scm.match_method, scm.match_strength,
        scm.match_basis_text,
        ms.signal_text, ms.signal_type, ms.extracted_values,
        c.name AS component_name, c.vector, c.state AS component_state,
        i.name AS initiative_name, i.persona, i.current_confidence
      FROM signal_candidate_matches scm
      JOIN mini_signals_v3 ms ON ms.id = scm.mini_signal_id
      LEFT JOIN components c ON c.id = scm.component_id
      LEFT JOIN initiatives_v2 i ON i.id = c.initiative_id
      WHERE scm.id = $1
    `, [candidateId]);
    if (ctxRows.length === 0) return res.status(404).json({ status: 'not_found', candidate_match_id: candidateId });
    const ctx = ctxRows[0];
    if (ctx.component_id == null) return res.json({ status: 'skipped', reason: 'tech_function-only match has no component to assess claims against', impacts: [] });

    const { rows: claims } = await pool.query(`
      SELECT id, claim_text, role, criticality, threshold_op, threshold_value_numeric,
             threshold_value_text, threshold_unit, deadline_date, threshold_direction
      FROM claims_v2 WHERE component_id = $1`, [ctx.component_id]);

    if (claims.length === 0) return res.json({ status: 'no_claims', candidate_match_id: candidateId, impacts: [] });

    const SYSTEM = `You are a senior energy/mobility analyst. Given a market signal and a component-claim assessment context, output STRICT JSON. For each claim, decide: does this signal move the claim? Output:
{
  "impacts": [
    {
      "claim_id": <int>,
      "impact_direction": "toward_threshold" | "away_from_threshold" | "crossed_threshold" | "no_change",
      "impact_magnitude": <number 0-1>,
      "is_material": <boolean>,
      "reasoning_text": "<2-3 sentences, analyst voice, FT Alphaville register>"
    }
  ]
}
Be honest. Most signals don't materially move most claims. is_material=true only when the signal moves a claim direction with magnitude >=0.3 OR crosses a threshold OR materially changes assessment confidence. No fabrication; if signal doesn't bear on a claim, say no_change with magnitude 0.`;

    const userPrompt = `Component: ${ctx.component_name} (vector=${ctx.vector}, state=${ctx.component_state || '—'})
Initiative: ${ctx.initiative_name} (persona=${ctx.persona || '—'}, current_confidence=${ctx.current_confidence || '—'})
Match method: ${ctx.match_method} (strength=${ctx.match_strength})
Match basis: ${ctx.match_basis_text}

Signal:
"""${ctx.signal_text}"""
Signal type: ${ctx.signal_type}
Extracted values: ${JSON.stringify(ctx.extracted_values).slice(0, 800)}

Claims to assess:
${claims.map((c) => JSON.stringify({id: c.id, claim_text: c.claim_text, role: c.role, criticality: c.criticality, threshold_op: c.threshold_op, threshold_value: c.threshold_value_numeric ?? c.threshold_value_text, threshold_unit: c.threshold_unit, deadline_date: c.deadline_date, threshold_direction: c.threshold_direction})).join('\n')}

Output the impacts JSON.`;

    const text = await callSonnet(SYSTEM, userPrompt, 2000);
    const parsed = tryExtractJson(text);
    if (!parsed || !Array.isArray(parsed.impacts)) {
      return res.status(500).json({ status: 'sonnet_parse_failed', raw: text.slice(0, 400) });
    }

    const inserted = [];
    for (const imp of parsed.impacts) {
      const cId = parseInt(imp.claim_id);
      if (!claims.find((c) => c.id === cId)) continue;
      const ins = await pool.query(`
        INSERT INTO signal_claim_impacts
          (mini_signal_id, candidate_match_id, claim_id, impact_direction,
           impact_magnitude, is_material, reasoning_text, assessment_model)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'claude-sonnet-4-6')
        RETURNING *`,
        [ctx.mini_signal_id, ctx.match_id, cId,
         imp.impact_direction || 'no_change',
         Math.max(0, Math.min(1, Number(imp.impact_magnitude) || 0)),
         Boolean(imp.is_material),
         imp.reasoning_text || '(no reasoning)',
        ]
      );
      inserted.push(ins.rows[0]);
    }
    res.status(201).json({ status: 'assessed', candidate_match_id: candidateId, impacts: inserted });
  } catch (err) {
    console.error('[POST /signal_route/assess_impact]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST /signal_route/generate_signal — for material claim impacts, generate
// the operational signal row with severity + persona + framing_text.
app.post('/signal_route/generate_signal', requireApiKey, async (req, res) => {
  const impactId = parsePositiveInt(req.body?.claim_impact_id);
  if (impactId === null) return res.status(400).json({ status: 'invalid', error: 'claim_impact_id required' });
  try {
    const { rows: ctxRows } = await pool.query(`
      SELECT sci.id AS impact_id, sci.mini_signal_id, sci.claim_id, sci.impact_direction,
             sci.impact_magnitude, sci.is_material, sci.reasoning_text,
             ms.signal_text, ms.signal_type,
             cl.claim_text, cl.role, cl.criticality, cl.deadline_date,
             c.name AS component_name, c.vector,
             i.id AS initiative_id, i.name AS initiative_name, i.persona,
             co.id AS company_id, co.name AS company_name
      FROM signal_claim_impacts sci
      JOIN claims_v2 cl ON cl.id = sci.claim_id
      JOIN components c ON c.id = cl.component_id
      JOIN initiatives_v2 i ON i.id = cl.initiative_id
      JOIN companies co ON co.id = i.company_id
      JOIN mini_signals_v3 ms ON ms.id = sci.mini_signal_id
      WHERE sci.id = $1
    `, [impactId]);
    if (ctxRows.length === 0) return res.status(404).json({ status: 'not_found', claim_impact_id: impactId });
    const x = ctxRows[0];
    if (!x.is_material) return res.json({ status: 'skipped_immaterial', claim_impact_id: impactId });

    // Severity rules per spec
    let severity;
    if (x.impact_direction === 'crossed_threshold' && x.criticality === 'critical') severity = 'alert';
    else if (x.impact_direction === 'toward_threshold' && (x.criticality === 'critical' || x.criticality === 'high')) severity = 'brief';
    else severity = 'watch';

    const persona = x.persona || 'strategy';

    const SYSTEM = `You are a senior FutureBridge analyst. Write a single short paragraph (60-120 words) framing a market signal for an executive. Voice: FT Alphaville / Bloomberg Intelligence register, sentence target 10-18 words, no consultant clichés ("leverage", "operationalise", "ecosystem", "framework"). Name the signal, name the component impact, name the deadline if there is one, name what to watch next. Defensible, terse, high-density.`;
    const userPrompt = `Company: ${x.company_name}
Initiative: ${x.initiative_name}
Component: ${x.component_name} (vector=${x.vector})
Severity: ${severity}; Persona: ${persona}

Signal: "${x.signal_text}"
Signal type: ${x.signal_type}

Claim that moved: "${x.claim_text}" (role=${x.role}, criticality=${x.criticality}${x.deadline_date ? ', deadline=' + x.deadline_date : ''})
Impact direction: ${x.impact_direction}; magnitude=${x.impact_magnitude}
Reasoning from impact assessment: ${x.reasoning_text}

Write the framing paragraph.`;

    const framing = await callSonnet(SYSTEM, userPrompt, 400);
    const framingText = framing.trim();

    const ins = await pool.query(`
      INSERT INTO generated_signals
        (mini_signal_id, claim_impact_id, initiative_id, company_id, severity, persona_target, framing_text, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')
      RETURNING *`,
      [x.mini_signal_id, x.impact_id, x.initiative_id, x.company_id, severity, persona, framingText]
    );
    res.status(201).json({ status: 'generated', signal: ins.rows[0] });
  } catch (err) {
    console.error('[POST /signal_route/generate_signal]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST /signal_route/generate_emails — for a signal, find matching contacts
// (via contact_initiative_interests) and Sonnet-generate one email per contact.
app.post('/signal_route/generate_emails', requireApiKey, async (req, res) => {
  const signalId = parsePositiveInt(req.body?.signal_id);
  if (signalId === null) return res.status(400).json({ status: 'invalid', error: 'signal_id required' });
  try {
    const { rows: sigRows } = await pool.query(`
      SELECT gs.*, i.name AS initiative_name, co.name AS company_name
      FROM generated_signals gs
      JOIN initiatives_v2 i ON i.id = gs.initiative_id
      JOIN companies co ON co.id = gs.company_id
      WHERE gs.id = $1`, [signalId]);
    if (sigRows.length === 0) return res.status(404).json({ status: 'not_found', signal_id: signalId });
    const sig = sigRows[0];

    const { rows: contacts } = await pool.query(`
      SELECT c.id, c.full_name, c.email, c.role_title, c.responsibility_area, c.persona_match,
             cii.interest_strength
      FROM contacts c
      JOIN contact_initiative_interests cii ON cii.contact_id = c.id
      WHERE cii.initiative_id = $1 AND c.active = TRUE
      ORDER BY CASE cii.interest_strength WHEN 'primary' THEN 1 WHEN 'secondary' THEN 2 ELSE 3 END
    `, [sig.initiative_id]);

    if (contacts.length === 0) return res.json({ status: 'no_contacts', signal_id: signalId, emails: [] });

    const SYSTEM = `You are a senior FutureBridge analyst writing a personalised market signal email to a named contact at a client. Voice: senior analyst, FT Alphaville register, 10-18 word sentences, no consultant clichés, no obsequious openers ("I hope this finds you well"). 80-150 words. Output STRICT JSON: {"subject": "...", "body": "..."}. Subject is terse and specific (under 70 chars, names the catalogue impact). Body opens with the signal, names the catalogue impact specifically, ties to the recipient's responsibility area, closes with what to watch.`;

    const inserted = [];
    for (const ct of contacts) {
      const userPrompt = `Recipient: ${ct.full_name} (${ct.role_title || 'role unknown'}); responsibility area: ${ct.responsibility_area || '—'}; persona: ${ct.persona_match || '—'}; interest strength: ${ct.interest_strength}.

Company: ${sig.company_name}
Initiative: ${sig.initiative_name}
Severity: ${sig.severity}
Persona target: ${sig.persona_target}

Signal framing (already drafted):
"""${sig.framing_text}"""

Generate a personalised email JSON.`;

      try {
        const out = await callSonnet(SYSTEM, userPrompt, 800);
        const parsed = tryExtractJson(out);
        if (!parsed || !parsed.subject || !parsed.body) continue;
        const ins = await pool.query(`
          INSERT INTO generated_emails (signal_id, contact_id, email_subject, email_body, generation_model)
          VALUES ($1, $2, $3, $4, 'claude-sonnet-4-6')
          ON CONFLICT (signal_id, contact_id) DO NOTHING
          RETURNING *`,
          [signalId, ct.id, parsed.subject, parsed.body]
        );
        if (ins.rows[0]) inserted.push(ins.rows[0]);
      } catch (e) {
        console.error(`[email gen failed for contact ${ct.id}]`, e.message);
      }
    }
    res.status(201).json({ status: 'generated', signal_id: signalId, emails: inserted });
  } catch (err) {
    console.error('[POST /signal_route/generate_emails]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ============================================================================
// /signal_route/assess_soft_impact + /signal_route/unprocessed_soft_signals
// (Migration 011 soft data layer — spec section 13.7)
// ============================================================================

// GET unprocessed soft signals — mini_signals_v3 with soft_signal_type set
// that don't yet have a signal_soft_impacts row.
app.get('/signal_route/unprocessed_soft_signals', requireApiKey, async (req, res) => {
  const since = req.query.since;
  try {
    const params = [];
    let where = `ms.soft_signal_type IS NOT NULL AND ms.soft_signal_type != 'none'
                  AND NOT EXISTS (SELECT 1 FROM signal_soft_impacts ssi WHERE ssi.mini_signal_id = ms.id)`;
    if (since && /^\d{4}-\d{2}-\d{2}/.test(since)) {
      params.push(since);
      where += ` AND ms.created_at >= $${params.length}`;
    }
    const sql = `
      SELECT ms.id, ms.signal_text, ms.signal_type, ms.soft_signal_type,
             ms.soft_signal_subject, ms.soft_signal_direction,
             ms.soft_signal_reasoning, ms.extracted_at, ms.created_at
      FROM mini_signals_v3 ms
      WHERE ${where}
      ORDER BY ms.created_at DESC LIMIT 500`;
    const { rows } = await pool.query(sql, params);
    res.json({ count: rows.length, since: since || null, rows });
  } catch (err) {
    console.error('[GET /signal_route/unprocessed_soft_signals]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST assess_soft_impact — input: {mini_signal_id, auto_create_record?: boolean}
// Matches the soft_signal_subject against existing
// assumptions/tensions/reframings via Sonnet; if matched, INSERTs into
// signal_soft_impacts. If no match and auto_create_record=true, creates the
// record (best-effort with draft_status='draft_unreviewed') and links.
// Default auto_create_record is FALSE — orphans surface for analyst review.
app.post('/signal_route/assess_soft_impact', requireApiKey, async (req, res) => {
  const msId = parsePositiveInt(req.body?.mini_signal_id);
  const autoCreate = Boolean(req.body?.auto_create_record);
  if (msId === null) return res.status(400).json({ status: 'invalid', error: 'mini_signal_id required (positive integer)' });

  try {
    // Load the mini_signal
    const { rows: msRows } = await pool.query(`
      SELECT id, signal_text, signal_type, soft_signal_type, soft_signal_subject,
             soft_signal_direction, soft_signal_reasoning, extracted_entities
      FROM mini_signals_v3 WHERE id = $1`, [msId]);
    if (msRows.length === 0) return res.status(404).json({ status: 'not_found', mini_signal_id: msId });
    const ms = msRows[0];

    if (!ms.soft_signal_type || ms.soft_signal_type === 'none') {
      return res.json({ status: 'no_soft_signal', mini_signal_id: msId });
    }

    // Map soft_signal_type -> impact_type + target table
    const typeMap = {
      assumption_evidence: { impactType: 'assumption', table: 'initiative_assumptions', textCols: ['assumption_text'] },
      tension_evidence:    { impactType: 'tension',    table: 'strategic_tensions',     textCols: ['tension_name', 'tension_statement'] },
      reframe_evidence:    { impactType: 'reframing',  table: 'reframings',             textCols: ['subject_name', 'reframe_text'] },
    };
    const cfg = typeMap[ms.soft_signal_type];
    if (!cfg) return res.status(400).json({ status: 'invalid', error: `unknown soft_signal_type: ${ms.soft_signal_type}` });

    // Pull candidate records (limit to a reasonable set; full table for now since populations are small/zero)
    let existing = [];
    if (cfg.table === 'initiative_assumptions') {
      const { rows } = await pool.query(`
        SELECT a.id, a.assumption_text, a.assumption_role, a.horizon, a.status, a.fragility_score,
               i.id AS initiative_id, i.name AS initiative_name
        FROM initiative_assumptions a
        JOIN initiatives_v2 i ON i.id = a.initiative_id
        WHERE a.status != 'obsolete' ORDER BY a.id LIMIT 200`);
      existing = rows;
    } else if (cfg.table === 'strategic_tensions') {
      const { rows } = await pool.query(`
        SELECT id, tension_name, tension_statement, tension_type, scope, primary_horizon, status
        FROM strategic_tensions WHERE status NOT IN ('resolved','dismissed') ORDER BY id LIMIT 200`);
      existing = rows;
    } else if (cfg.table === 'reframings') {
      const { rows } = await pool.query(`
        SELECT id, subject_type, subject_name, reframe_text, from_frame, to_frame, status
        FROM reframings WHERE status NOT IN ('rejected') ORDER BY id LIMIT 200`);
      existing = rows;
    }

    // Sonnet prompt — match + assess + propose
    const SYSTEM = `You match soft signals to existing soft-data records (assumptions/tensions/reframings) for an analytical catalogue.

Output STRICT JSON:
{
  "match_found": boolean,
  "match_id": <int> | null,
  "match_score": <number 0-1>,
  "match_reasoning": "<short text>",
  "impact": {
    "impact_direction": "reinforces" | "contradicts" | "clarifies" | "marginal",
    "impact_magnitude": <number 0-1>,
    "is_material": boolean,
    "reasoning_text": "<2-3 sentences, analyst voice>"
  },
  "suggested_new_record": <object | null>
}

Match rule: a record matches if its core text (assumption_text / tension_name+statement / subject_name+reframe_text) plausibly refers to the same conceptual subject as the soft_signal_subject. Score >= 0.5 means match. If multiple records score >= 0.5, pick the highest. If none reach 0.5, match_found=false.

When match_found=false, propose a suggested_new_record with the fields the table requires:
- assumption: {initiative_id (null if uncertain), assumption_text, assumption_role (supports/constrains/enables/protects/threatens), horizon (H1/H2/H3), contradiction_mechanism, fragility_score (0-1)}
- tension: {tension_name, tension_statement, tension_type (substitution/timing/capital_allocation/demand_shift/regulatory_arbitrage/regime_change/cross_horizon), scope (within_initiative/cross_initiative/cross_company/cross_industry/portfolio_level), primary_horizon (H1/H2/H3), primary_company_id (null if industry-wide), reasoning_text}
- reframing: {subject_type (tech_function/market/component/regulatory_domain/industry), subject_name, reframe_text, from_frame, to_frame, confidence_band (high/medium/low)}

Always assess the impact regardless of match — the impact assessment uses the matched record (or the proposed new one) as the target.

Voice for reasoning_text: senior analyst, FT Alphaville register, 10-18 word sentences, no consultant clichés.`;

    const userPrompt = `Soft signal from mini_signal_id=${ms.id}:
  type: ${ms.soft_signal_type}
  subject: "${ms.soft_signal_subject || ''}"
  direction: ${ms.soft_signal_direction || '(none)'}
  reasoning: "${(ms.soft_signal_reasoning || '').slice(0, 600)}"
  signal_text: "${(ms.signal_text || '').slice(0, 400)}"
  extracted_entities: ${JSON.stringify(ms.extracted_entities || [])}

Existing ${cfg.impactType} records (${existing.length}):
${existing.length === 0 ? '  (none — table empty; match_found must be false)' : existing.map(r => '  ' + JSON.stringify(r)).join('\n')}

Match the soft signal against the existing records, assess impact, and (if no match) propose a new record. Output the JSON.`;

    const text = await callSonnet(SYSTEM, userPrompt, 1500);
    const parsed = tryExtractJson(text);
    if (!parsed) return res.status(500).json({ status: 'sonnet_parse_failed', raw: text.slice(0, 400) });

    let matchedId = null;
    let createdRecord = null;

    if (parsed.match_found && parsed.match_id) {
      const candidateId = parseInt(parsed.match_id);
      if (existing.find(r => r.id === candidateId)) matchedId = candidateId;
    }

    // If no match and auto-create requested, create the record
    if (!matchedId && autoCreate && parsed.suggested_new_record) {
      try {
        const sn = parsed.suggested_new_record;
        if (cfg.impactType === 'assumption' && sn.initiative_id && sn.assumption_text && sn.assumption_role && sn.horizon && sn.contradiction_mechanism) {
          const { rows: cr } = await pool.query(`
            INSERT INTO initiative_assumptions
              (initiative_id, assumption_text, assumption_role, horizon, contradiction_mechanism,
               fragility_score, draft_status, source_citation, reasoning_text)
            VALUES ($1,$2,$3,$4,$5,$6,'draft_unreviewed',$7,$8) RETURNING id`,
            [sn.initiative_id, sn.assumption_text, sn.assumption_role, sn.horizon, sn.contradiction_mechanism,
             typeof sn.fragility_score === 'number' ? sn.fragility_score : null,
             `Auto-created from mini_signal_id=${ms.id}`, parsed.match_reasoning || null]);
          matchedId = cr[0].id;
          createdRecord = { table: 'initiative_assumptions', id: matchedId };
        } else if (cfg.impactType === 'tension' && sn.tension_name && sn.tension_statement && sn.tension_type && sn.scope && sn.primary_horizon) {
          const { rows: cr } = await pool.query(`
            INSERT INTO strategic_tensions
              (tension_name, tension_statement, tension_type, scope, primary_horizon,
               primary_company_id, reasoning_text, draft_status, source_citation)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'draft_unreviewed',$8) RETURNING id`,
            [sn.tension_name, sn.tension_statement, sn.tension_type, sn.scope, sn.primary_horizon,
             sn.primary_company_id || null,
             sn.reasoning_text || parsed.match_reasoning || `Created from mini_signal_id=${ms.id}`,
             `Auto-created from mini_signal_id=${ms.id}`]);
          matchedId = cr[0].id;
          createdRecord = { table: 'strategic_tensions', id: matchedId };
        } else if (cfg.impactType === 'reframing' && sn.subject_type && sn.subject_name && sn.reframe_text && sn.from_frame && sn.to_frame) {
          const { rows: cr } = await pool.query(`
            INSERT INTO reframings
              (subject_type, subject_name, reframe_text, from_frame, to_frame,
               confidence_band, draft_status, source_citation)
            VALUES ($1,$2,$3,$4,$5,$6,'draft_unreviewed',$7) RETURNING id`,
            [sn.subject_type, sn.subject_name, sn.reframe_text, sn.from_frame, sn.to_frame,
             ['high','medium','low'].includes(sn.confidence_band) ? sn.confidence_band : null,
             `Auto-created from mini_signal_id=${ms.id}`]);
          matchedId = cr[0].id;
          createdRecord = { table: 'reframings', id: matchedId };
        }
      } catch (e) {
        // Auto-create failed (validation, etc.); fall through to orphan path
        console.error('[assess_soft_impact auto_create]', e.message);
      }
    }

    // INSERT signal_soft_impacts only when we have a target id
    let inserted = null;
    if (matchedId) {
      const cols = ['mini_signal_id', 'impact_type'];
      const vals = [ms.id, cfg.impactType];
      if (cfg.impactType === 'assumption') { cols.push('assumption_id'); vals.push(matchedId); }
      if (cfg.impactType === 'tension')    { cols.push('tension_id');    vals.push(matchedId); }
      if (cfg.impactType === 'reframing')  { cols.push('reframing_id');  vals.push(matchedId); }
      const imp = parsed.impact || {};
      const dir = ['reinforces','contradicts','clarifies','marginal'].includes(imp.impact_direction) ? imp.impact_direction : 'marginal';
      const mag = Math.max(0, Math.min(1, Number(imp.impact_magnitude) || 0));
      const mat = Boolean(imp.is_material);
      const reason = imp.reasoning_text || parsed.match_reasoning || '(no reasoning)';
      cols.push('impact_direction','impact_magnitude','is_material','reasoning_text');
      vals.push(dir, mag, mat, reason);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
      const { rows: ins } = await pool.query(
        `INSERT INTO signal_soft_impacts (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      inserted = ins[0];
    }

    res.status(matchedId ? 201 : 200).json({
      status: matchedId ? 'assessed' : 'orphan_for_analyst_review',
      mini_signal_id: ms.id,
      soft_signal_type: ms.soft_signal_type,
      match_found: parsed.match_found || false,
      match_id: matchedId,
      match_score: parsed.match_score || 0,
      match_reasoning: parsed.match_reasoning || null,
      impact: parsed.impact || null,
      suggested_new_record: matchedId ? null : (parsed.suggested_new_record || null),
      auto_created: createdRecord,
      signal_soft_impact_inserted: inserted,
    });
  } catch (err) {
    console.error('[POST /signal_route/assess_soft_impact]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /signal_route/pipeline/run — orchestrator for any ?days=7 window of mini_signals
// not yet matched. Runs match → assess_impact (per match) → generate_signal (per
// material impact) → generate_emails (per signal). Returns summary.
app.get('/signal_route/pipeline/run', requireApiKey, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  try {
    const { rows: pending } = await pool.query(`
      SELECT ms.id FROM mini_signals_v3 ms
      WHERE ms.created_at > NOW() - ($1 || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM signal_candidate_matches scm WHERE scm.mini_signal_id = ms.id)
      ORDER BY ms.id`, [String(days)]);

    const totals = { mini_signals_processed: 0, matches_created: 0, material_impacts: 0, signals_generated: 0, emails_generated: 0, errors: [] };

    for (const { id: msId } of pending) {
      totals.mini_signals_processed++;
      // match
      const matchClient = await pool.connect();
      let candidateIds = [];
      try {
        await matchClient.query('BEGIN');
        const direct = await matchClient.query(SQL_MATCH_DIRECT_NAME, [msId]);
        const attrRef = await matchClient.query(SQL_MATCH_ATTRIBUTE_REFERENCE, [msId]);
        const techFn = await matchClient.query(SQL_MATCH_TECH_FUNCTION, [msId]);
        const depChain = await matchClient.query(SQL_MATCH_DEPENDENCY_CHAIN, [msId]);
        const created = direct.rowCount + attrRef.rowCount + techFn.rowCount + depChain.rowCount;
        totals.matches_created += created;
        const { rows: cm } = await matchClient.query(`SELECT id FROM signal_candidate_matches WHERE mini_signal_id = $1`, [msId]);
        candidateIds = cm.map((r) => r.id);
        await matchClient.query('COMMIT');
      } catch (e) {
        await matchClient.query('ROLLBACK').catch(() => {});
        totals.errors.push({ stage: 'match', mini_signal_id: msId, message: e.message.slice(0, 200) });
        continue;
      } finally { matchClient.release(); }

      // assess each candidate (best-effort; don't break the run on individual failures)
      for (const candId of candidateIds) {
        try {
          const r = await fetch(`http://localhost:${PORT}/signal_route/assess_impact`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ candidate_match_id: candId }),
          });
          if (!r.ok) continue;
          const j = await r.json();
          for (const impact of (j.impacts || [])) {
            if (impact.is_material) {
              totals.material_impacts++;
              try {
                const sg = await fetch(`http://localhost:${PORT}/signal_route/generate_signal`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
                  body: JSON.stringify({ claim_impact_id: impact.id }),
                });
                if (!sg.ok) continue;
                const sgj = await sg.json();
                if (sgj.signal?.id) {
                  totals.signals_generated++;
                  const em = await fetch(`http://localhost:${PORT}/signal_route/generate_emails`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
                    body: JSON.stringify({ signal_id: sgj.signal.id }),
                  });
                  if (em.ok) {
                    const emj = await em.json();
                    totals.emails_generated += (emj.emails || []).length;
                  }
                }
              } catch (e) { totals.errors.push({ stage: 'generate_signal', message: e.message.slice(0, 200) }); }
            }
          }
        } catch (e) { totals.errors.push({ stage: 'assess_impact', message: e.message.slice(0, 200) }); }
      }
    }

    res.json({ status: 'pipeline_complete', window_days: days, totals });
  } catch (err) {
    console.error('[GET /signal_route/pipeline/run]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ============================================================================
// v8 read-only routes — backing the unified account_plans_v8 frontend.
// Search_path (pipeline, ontology, catalogue, contacts, public) is set on the
// database + role per migration 017 — unprefixed table names resolve correctly
// across schemas, including contacts.contacts.
//
// Schema deviations from the original spec (documented for audit):
//   - initiatives_v2 has no `strategic_priority` — ORDER BY uses current_confidence
//   - technology_application_pairs has no `is_cross_client_edge` (it lives on
//     pair_adjacencies); we surface it via a correlated EXISTS subquery
//   - column aliases applied for spec-compatible field names: name AS
//     initiative_name, hypothesis_statement AS hypothesis, horizon AS horizon,
//     current_confidence AS confidence_level, draft_status AS status,
//     technology_label AS technology, application_label AS application,
//     confidence_band AS confidence, link_role AS link_type
// ============================================================================

// GET /v8/companies — companies that have >=1 initiative_v2 row.
// Implemented as a separate path to avoid breaking the existing
// /companies route used by n8n + population scripts (returns ALL companies).
app.get('/v8/companies', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT co.id, co.name, co.sector,
             COUNT(iv.id)::int AS initiative_count
      FROM companies co
      JOIN initiatives_v2 iv ON iv.company_id = co.id
      GROUP BY co.id, co.name, co.sector
      ORDER BY co.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('[GET /v8/companies]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /v8/hypotheses?company=<name> — initiatives + components for a company.
app.get('/v8/hypotheses', requireApiKey, async (req, res) => {
  const companyName = (req.query.company || '').toString().trim();
  if (!companyName) {
    return res.status(400).json({ status: 'invalid', error: 'company query parameter required' });
  }
  try {
    const { rows } = await pool.query(`
      SELECT iv.id,
             iv.name AS initiative_name,
             iv.hypothesis_statement AS hypothesis,
             iv.why_it_matters,
             iv.horizon,
             iv.persona,
             iv.time_horizon_year,
             iv.decision_threshold,
             iv.baseline_confidence,
             iv.current_confidence AS confidence_level,
             iv.draft_status AS status,
             iv.state,
             iv.trajectory,
             iv.state_reasoning,
             iv.trajectory_reasoning,
             COALESCE(
               (SELECT json_agg(json_build_object(
                          'id', c.id,
                          'name', c.name,
                          'component_type', c.component_type,
                          'vector', c.vector,
                          'description', c.description,
                          'state', c.state,
                          'trajectory', c.trajectory,
                          'source_citation', c.source_citation
                       ) ORDER BY c.id)
                FROM components c WHERE c.initiative_id = iv.id),
               '[]'::json
             ) AS components
      FROM initiatives_v2 iv
      JOIN companies co ON co.id = iv.company_id
      WHERE co.name ILIKE $1
      ORDER BY iv.current_confidence DESC NULLS LAST, iv.id ASC
    `, [`%${companyName}%`]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /v8/hypotheses]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /v8/ontology-pairs?company=<name> — ontology pairs the company touches.
// is_cross_client_edge computed via correlated subquery against pair_adjacencies.
app.get('/v8/ontology-pairs', requireApiKey, async (req, res) => {
  const companyName = (req.query.company || '').toString().trim();
  if (!companyName) {
    return res.status(400).json({ status: 'invalid', error: 'company query parameter required' });
  }
  try {
    const { rows } = await pool.query(`
      WITH pair_set AS (
        SELECT DISTINCT
          tap.id,
          tap.pair_label,
          t.technology_name,
          t.technology_label AS technology,
          a.application_name,
          a.application_label AS application,
          a.application_domain,
          tap.horizon,
          tap.confidence_band AS confidence,
          tap.trajectory,
          tap.hard_evidence_count,
          tap.is_flagged_for_review,
          cpl.link_role AS link_type,
          cpl.reasoning_text AS link_reasoning,
          EXISTS (
            SELECT 1 FROM pair_adjacencies pa
            WHERE (pa.source_pair_id = tap.id OR pa.target_pair_id = tap.id)
              AND pa.is_cross_client_edge = TRUE
          ) AS is_cross_client_edge
        FROM technology_application_pairs tap
        JOIN technologies t ON t.id = tap.technology_id
        JOIN applications a ON a.id = tap.application_id
        JOIN component_pair_links cpl ON cpl.pair_id = tap.id
        JOIN components c ON c.id = cpl.component_id
        JOIN initiatives_v2 iv ON iv.id = c.initiative_id
        JOIN companies co ON co.id = iv.company_id
        WHERE co.name ILIKE $1
      )
      SELECT * FROM pair_set
      ORDER BY horizon ASC,
               CASE confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END ASC,
               pair_label ASC
    `, [`%${companyName}%`]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /v8/ontology-pairs]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /v8/signals?company=<name>&limit=<n> — recent signal_horizon_log rows
// matched to any of this company's initiatives_v2 rows.
// matched_hypothesis_ids is TEXT[] (signal_horizon_log column), so we cast.
app.get('/v8/signals', requireApiKey, async (req, res) => {
  const companyName = (req.query.company || '').toString().trim();
  if (!companyName) {
    return res.status(400).json({ status: 'invalid', error: 'company query parameter required' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
  try {
    const { rows } = await pool.query(`
      SELECT shl.id,
             shl.signal_id,
             shl.signal_title,
             shl.signal_summary,
             shl.signal_date,
             shl.source_url,
             shl.matched_hypothesis_ids,
             shl.matched_hypothesis_labels,
             shl.horizon_classifications,
             shl.overall_classification,
             shl.probability_delta,
             shl.ontology_gap,
             shl.processed_by_15b,
             shl.created_at
      FROM signal_horizon_log shl
      WHERE shl.matched_hypothesis_ids && (
        SELECT COALESCE(array_agg(iv.id::text), ARRAY[]::text[])
        FROM initiatives_v2 iv
        JOIN companies co ON co.id = iv.company_id
        WHERE co.name ILIKE $1
      )
      ORDER BY shl.created_at DESC
      LIMIT $2
    `, [`%${companyName}%`, limit]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /v8/signals]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /v8/contacts?company=<name>&limit=<n> — contacts for the company
// from the 2026-05-04 datasette import.
app.get('/v8/contacts', requireApiKey, async (req, res) => {
  const companyName = (req.query.company || '').toString().trim();
  if (!companyName) {
    return res.status(400).json({ status: 'invalid', error: 'company query parameter required' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  try {
    const { rows } = await pool.query(`
      SELECT c.id,
             c.full_name,
             c.email,
             c.role_title,
             c.persona_match,
             c.seniority,
             c.tier,
             c.linkedin_url,
             c.dept,
             c.hq_location,
             c.original_company_name,
             c.comm_style,
             c.content_depth,
             c.tech_interests,
             c.strategies,
             c.signal_types
      FROM contacts c
      JOIN companies co ON co.id = c.company_id
      WHERE co.name ILIKE $1
        AND c.active = TRUE
        AND c.imported_from = 'datasette_export_2026_05_04'
      ORDER BY c.tier ASC NULLS LAST, c.id ASC
      LIMIT $2
    `, [`%${companyName}%`, limit]);
    res.json(rows);
  } catch (err) {
    console.error('[GET /v8/contacts]', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ---------- 404 fallthrough ----------
app.use((req, res) => {
  res.status(404).json({ status: 'not_found', path: req.path });
});

// ---------- start ----------
app.listen(PORT, () => {
  console.log(`signal-engine-api listening on :${PORT}`);
});
