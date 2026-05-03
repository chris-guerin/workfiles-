// db/population/_runner.mjs
// Generic populator for initiative-model phase 1.
//
// Takes structured arrays of initiatives, entities, links — validates step-10
// completion criteria per initiative, marks each draft_status accordingly,
// and inserts to PG with conflict-aware upserts.
//
// Conflict policy:
//   - entities by id: ON CONFLICT (id) DO UPDATE — supports BP reusing Shell entities
//     but updating note/sources/state if newer source data is provided.
//   - initiatives by id: ON CONFLICT (id) DO UPDATE — re-runs of the same company
//     overwrite (by design, since this is draft population).
//   - links by id: ON CONFLICT (id) DO UPDATE — same reason.
//
// Step 10 completion criteria from /docs/INITIATIVE_METHODOLOGY.md section 3 step 10:
//   - 1-3 principal links
//   - 3-5 enabling links (soft cap 8)
//   - 0-2 external threat links
//   - All links have role, impact, criticality, claim, claim_basis (no blanks)
//   - All entities have current_state, threshold, state, note, sources (no stubs)
//   - Baseline confidence set with reasoning visible
//   - Biggest-risk query produces credible result (manual review — flagged in notes)

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
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '..', '.env'));
await loadEnv(join(__dirname, '..', '..', 'n8n', '.env'));

export async function pgClient() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

// Step 10 completion checks. Returns {pass: bool, draft_status: string, failures: []}.
export function step10Check(initiative, links, entityIndex) {
  const failures = [];
  const initLinks = links.filter((l) => l.initiative_id === initiative.id);
  const principal = initLinks.filter((l) => l.role === 'principal');
  const enabling = initLinks.filter((l) => l.role === 'enabling');
  const external = initLinks.filter((l) => l.role === 'external');
  const optional = initLinks.filter((l) => l.role === 'optional');

  if (principal.length < 1 || principal.length > 3) {
    failures.push(`principal count ${principal.length} (must be 1-3)`);
  }
  if (enabling.length < 1 || enabling.length > 8) {
    failures.push(`enabling count ${enabling.length} (must be 1-8; soft target 3-5)`);
  }
  if (external.length > 2) {
    failures.push(`external count ${external.length} (must be 0-2)`);
  }
  for (const l of initLinks) {
    if (!l.role || !l.impact || !l.criticality || !l.claim || !l.claim_basis) {
      failures.push(`link ${l.id} has blank required field(s)`);
    }
  }
  // Validate every link's entity exists and is fully populated.
  for (const l of initLinks) {
    const e = entityIndex[l.entity_id];
    if (!e) {
      failures.push(`link ${l.id} references missing entity ${l.entity_id}`);
      continue;
    }
    if (!e.current_state || !e.threshold || !e.state || !e.note || !e.sources) {
      failures.push(`entity ${e.id} has blank required field(s)`);
    }
  }
  // Baseline confidence reasoning must be present in notes.
  if (typeof initiative.baseline_confidence !== 'number' || isNaN(initiative.baseline_confidence)) {
    failures.push('baseline_confidence not a number');
  }
  if (!initiative.notes || initiative.notes.trim().length === 0) {
    failures.push('initiative.notes blank — baseline_confidence reasoning required');
  }

  const draft_status = failures.length === 0 ? 'draft_unreviewed' : 'draft_incomplete';
  return { pass: failures.length === 0, draft_status, failures };
}

const INIT_COLS = [
  'id','name','company','segment','register','hypothesis_statement',
  'time_horizon','decision_window','decision_threshold',
  'baseline_confidence','current_confidence','notes','draft_status',
];
const ENT_COLS = [
  'id','name','type','current_state','threshold','state','baseline_state',
  'note','sources','draft_status',
];
const LINK_COLS = [
  'id','initiative_id','entity_id','role','impact','criticality',
  'claim','claim_basis','draft_status',
];

function buildUpsert(table, cols, conflictKey) {
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols
    .filter((c) => c !== conflictKey)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  const updateLastUpdated = (table === 'initiatives' || table === 'entities' || table === 'links')
    ? ', last_updated_at = NOW()'
    : '';
  return `INSERT INTO ${table} (${cols.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (${conflictKey}) DO UPDATE SET ${updates}${updateLastUpdated}`;
}

export async function insertAll({ initiatives, entities, links, dryRun = false }) {
  const c = await pgClient();
  const ent = Object.fromEntries(entities.map((e) => [e.id, e]));

  // Step 10 per initiative
  const gateResults = initiatives.map((init) => ({
    id: init.id,
    ...step10Check(init, links, ent),
  }));

  // Apply draft_status from gate to initiative + its links
  for (const init of initiatives) {
    const g = gateResults.find((x) => x.id === init.id);
    init.draft_status = g.draft_status;
  }
  for (const l of links) {
    const init = initiatives.find((i) => i.id === l.initiative_id);
    l.draft_status = init?.draft_status || 'draft_incomplete';
  }
  // Entities default to draft_unreviewed if not already set; do not regress if reviewed.
  for (const e of entities) {
    if (!e.draft_status) e.draft_status = 'draft_unreviewed';
  }

  console.log('=== Step 10 quality gate per initiative ===');
  for (const g of gateResults) {
    if (g.pass) console.log(`  ✓ ${g.id} → draft_unreviewed`);
    else {
      console.log(`  ✗ ${g.id} → draft_incomplete`);
      for (const f of g.failures) console.log(`      - ${f}`);
    }
  }

  if (dryRun) {
    console.log('\n[dry-run] no inserts performed');
    await c.end();
    return { gateResults };
  }

  await c.query('BEGIN');
  try {
    let n = 0;
    // Order: initiatives → entities → links (links FK both)
    const initSql = buildUpsert('initiatives', INIT_COLS, 'id');
    for (const init of initiatives) {
      const vals = INIT_COLS.map((c) => init[c] ?? null);
      await c.query(initSql, vals);
      n++;
    }
    const entSql = buildUpsert('entities', ENT_COLS, 'id');
    for (const e of entities) {
      const vals = ENT_COLS.map((c) => e[c] ?? null);
      await c.query(entSql, vals);
      n++;
    }
    const linkSql = buildUpsert('links', LINK_COLS, 'id');
    for (const l of links) {
      const vals = LINK_COLS.map((c) => l[c] ?? null);
      await c.query(linkSql, vals);
      n++;
    }
    await c.query('COMMIT');
    console.log(`\n[pg] COMMIT — ${n} rows upserted (${initiatives.length} initiatives, ${entities.length} entities, ${links.length} links)`);
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('\n[pg] ROLLBACK due to error:', err.message);
    throw err;
  } finally {
    await c.end();
  }

  return { gateResults };
}

export async function reportCatalogueOverlap(companyToPopulate) {
  const c = await pgClient();
  try {
    const r = await c.query(`SELECT count(*)::int AS n FROM entities`);
    const total = r.rows[0].n;
    return { existing_entities: total };
  } finally {
    await c.end();
  }
}
