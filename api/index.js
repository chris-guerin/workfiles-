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

// ---------- /components ----------
const COMPONENT_COLS = [
  'initiative_id', 'parent_component_id', 'name', 'description',
  'component_type', 'vector', 'horizon', 'asset_replacement_cycle_years',
  'cross_industry', 'draft_status', 'source_citation',
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

// ---------- 404 fallthrough ----------
app.use((req, res) => {
  res.status(404).json({ status: 'not_found', path: req.path });
});

// ---------- start ----------
app.listen(PORT, () => {
  console.log(`signal-engine-api listening on :${PORT}`);
});
