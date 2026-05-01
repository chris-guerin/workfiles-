// signal-engine-api — thin HTTP layer over hypothesis-db for n8n workflows.
//
// Endpoints (all require Authorization: Bearer <API_KEY>):
//   POST   /news           Body: news columns. Computes content_hash from title+url+pub_date.
//                          Checks news + mini_signals for hash. Returns inserted | duplicate.
//   GET    /news           Returns all news rows ordered by pub_date DESC.
//   DELETE /news/:id       Hard-deletes the row.
//   POST   /mini_signals   Body: mini_signals columns + optional heat_map_increments[]
//                          array of {sector_tag, company, signal_type}. API upserts each
//                          increment into heat_map_aggregates with date = today.
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

  // Build the INSERT dynamically over the canonical column list
  const values = MINI_SIGNAL_COLS.map((c) => (b[c] === undefined ? null : b[c]));
  const placeholders = MINI_SIGNAL_COLS.map((_, i) => `$${i + 1}`).join(', ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insert = await client.query(
      `INSERT INTO mini_signals (${MINI_SIGNAL_COLS.join(', ')})
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

// ---------- 404 fallthrough ----------
app.use((req, res) => {
  res.status(404).json({ status: 'not_found', path: req.path });
});

// ---------- start ----------
app.listen(PORT, () => {
  console.log(`signal-engine-api listening on :${PORT}`);
});
