// Phase 3 of migration 008: re-population back-fill of existing Shell data.
// Walks every populated component_attribute, parses prose via Haiku into the
// new v3 structured columns, UPDATEs rows. On parse failure or trigger
// exception, marks row pending_analyst_review and logs to issues file.
// Walks claims_v2 the same way. Back-fills reasoning_text placeholders.
// Populates catalogue_names from current catalogue.
//
// Idempotent — re-running re-parses; rows already pending_analyst_review
// are skipped.
//
// Run:
//   node db/_phase3_backfill.mjs           (dry-run, no writes)
//   node db/_phase3_backfill.mjs --commit  (writes)

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
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
await loadEnv(join(__dirname, '.env'));
await loadEnv(join(__dirname, '..', 'n8n', '.env'));

const COMMIT = process.argv.includes('--commit');
const COMPANY_ID = 4;
const DEFAULT_AS_OF_DATE = '2026-03-01';  // Shell brief publication anchor

// Locate Anthropic key — prefer env var, fall back to extracting from
// gitignored n8n workflow JSON. Never logged or committed.
async function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const candidates = [
    join(__dirname, '..', 'n8n', 'workflows', 'wf-15.json'),
    join(__dirname, '..', 'n8n', 'workflows', 'wf15apg.json'),
    join(__dirname, '..', 'n8n', 'workflows', '1288FlFDvYB3pMXO.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const txt = await readFile(p, 'utf8');
    const m = txt.match(/sk-ant-api03-[A-Za-z0-9_-]{80,300}/);
    if (m) return m[0];
  }
  return null;
}
const ANTHROPIC_KEY = await getAnthropicKey();
if (COMMIT && !ANTHROPIC_KEY) { console.error('No Anthropic key found.'); process.exit(1); }

const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
await pgClient.connect();
console.log(`=== Phase 3 back-fill ===  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
console.log('[pg] connected');

// ===== Issues log =====
const ISSUES_PATH = join(__dirname, '..', 'docs', 'draft_review', 'migration_008_backfill_issues.md');
async function ensureIssuesFile() {
  const dir = dirname(ISSUES_PATH);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  if (!existsSync(ISSUES_PATH)) {
    await writeFile(ISSUES_PATH, `# Migration 008 — Phase 3 back-fill issues\n\n**Generated:** ${new Date().toISOString()}\n\n` +
      `Rows that could not be back-filled cleanly. Each entry: ` +
      `row id, component name, attribute name, original prose, reason. ` +
      `Analyst review queue.\n\n---\n\n`);
  }
}
async function logIssue(line) {
  if (!COMMIT) return;
  await appendFile(ISSUES_PATH, line + '\n');
}
await ensureIssuesFile();

// ===== Anthropic helper =====
async function callHaiku(systemPrompt, userPrompt, maxTokens = 800) {
  if (!COMMIT) {
    return { __dryrun: true, content: '{"parseable":false,"reason":"dry-run"}' };
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.content?.[0]?.text || '';
}

function extractJson(text) {
  // Haiku occasionally wraps JSON in fences or prose; strip and parse.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const objStart = candidate.indexOf('{');
  if (objStart < 0) return null;
  // Brace-balance to find end
  let depth = 0, end = -1;
  for (let i = objStart; i < candidate.length; i++) {
    if (candidate[i] === '{') depth++;
    else if (candidate[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(candidate.slice(objStart, end + 1)); } catch { return null; }
}

// ===== Phase 3a: component_attributes back-fill =====

const ATTR_PARSE_SYSTEM = `You parse analyst prose values into structured fields. Output STRICT JSON with no prose. The fields:
{
  "value_numeric": number or null,
  "value_unit": string or null,
  "velocity_pct_yoy": number or null (negative for declining),
  "velocity_direction": "rising"|"falling"|"stable"|"volatile"|null,
  "as_of_date": "YYYY-MM-DD" or null (use the most recent date the prose names; default null if no date),
  "reasoning_text": string (1 short sentence explaining the parse)
}
If the prose is genuinely unparseable (no quantitative content of any kind), output {"parseable": false, "reason": "..."}.
For numeric attributes specifically: if you can extract any numeric value (even a midpoint of a range), do so. If a range is given, return the midpoint as value_numeric.`;

async function parseAttribute(row) {
  const prose = row.value_text || '';
  const userPrompt = `attribute_name: ${row.attribute_name}
attribute_label: ${row.attribute_label}
expected_value_type: ${row.value_type}
expected_unit: ${row.unit || '(none)'}
prose: """${prose}"""

Parse into structured JSON.`;

  const text = await callHaiku(ATTR_PARSE_SYSTEM, userPrompt, 600);
  const parsed = extractJson(text);
  if (!parsed) return { ok: false, reason: 'haiku output not valid JSON', raw: text.slice(0, 200) };
  if (parsed.parseable === false) return { ok: false, reason: parsed.reason || 'unparseable' };
  return { ok: true, parsed };
}

async function phase3a() {
  console.log('\n=== 3a — component_attributes back-fill ===');

  const { rows } = await pgClient.query(`
    SELECT
      ca.id, ca.component_id, ca.attribute_def_id, ca.value_status, ca.value_text,
      ca.value_numeric, ca.value_categorical, ca.value_controlled_vocab_id,
      ca.source_citation, ca.confidence_band,
      ad.attribute_name, ad.attribute_label, ad.value_type, ad.unit,
      c.name AS component_name, c.vector
    FROM component_attributes ca
    JOIN components c ON c.id = ca.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    JOIN attribute_definitions ad ON ad.id = ca.attribute_def_id
    WHERE i.company_id = $1
      AND ca.value_status = 'populated'
    ORDER BY ca.component_id, ad.display_order
  `, [COMPANY_ID]);
  console.log(`[3a] ${rows.length} populated rows to back-fill`);

  let attempted = 0, ok = 0, marked_review = 0;
  let lastCommitAt = 0;

  for (const row of rows) {
    attempted++;

    let parseRes;
    try {
      parseRes = await parseAttribute(row);
    } catch (e) {
      parseRes = { ok: false, reason: `haiku error: ${e.message.slice(0, 200)}` };
    }

    let updateOk = false;
    let updateError = null;

    if (parseRes.ok) {
      const p = parseRes.parsed;
      // Build update fields, respecting the value-type contract
      const updates = {
        velocity_pct_yoy:    typeof p.velocity_pct_yoy === 'number' ? p.velocity_pct_yoy : null,
        velocity_direction:  ['rising','falling','stable','volatile'].includes(p.velocity_direction) ? p.velocity_direction : null,
        reasoning_text:      p.reasoning_text || `Back-filled from v2 prose: "${(row.value_text || '').slice(0, 120)}"`,
      };

      // value_unit: prefer Haiku, fall back to attribute_definitions.unit
      if (typeof p.value_unit === 'string' && p.value_unit.length > 0 && p.value_unit !== 'none') {
        updates.value_unit = p.value_unit;
      } else if (row.unit) {
        updates.value_unit = row.unit;
      }

      // Type-specific contract enforcement
      if (row.value_type === 'numeric') {
        if (typeof p.value_numeric === 'number') {
          updates.value_numeric = p.value_numeric;
        } else if (typeof row.value_numeric === 'number' || (row.value_numeric !== null && row.value_numeric !== undefined)) {
          // already has value_numeric, keep it
        } else {
          // Cannot populate value_numeric; contract will fail. Mark for review.
          updateError = 'numeric value_type but no value_numeric available from prose';
        }
        // as_of_date — use Haiku-extracted, else default to brief anchor date
        const asOf = (typeof p.as_of_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.as_of_date))
          ? p.as_of_date : DEFAULT_AS_OF_DATE;
        updates.as_of_date = asOf;
      }

      if (!updateError) {
        // Build SQL
        const setCols = Object.keys(updates);
        const placeholders = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
        const vals = setCols.map((c) => updates[c]);
        vals.push(row.id);
        const sql = `UPDATE component_attributes SET ${placeholders}, last_updated_at = NOW() WHERE id = $${vals.length}`;
        if (COMMIT) {
          try {
            await pgClient.query(sql, vals);
            updateOk = true;
          } catch (e) {
            updateError = `trigger or constraint: ${e.message.slice(0, 200)}`;
          }
        } else {
          updateOk = true;
        }
      }
    } else {
      updateError = `haiku parse failed: ${parseRes.reason}`;
    }

    if (updateOk) {
      ok++;
    } else {
      marked_review++;
      if (COMMIT) {
        await pgClient.query(`
          UPDATE component_attributes SET value_status='pending_analyst_review',
            reasoning_text = COALESCE(reasoning_text, '') || $2, last_updated_at = NOW()
          WHERE id = $1
        `, [row.id, ` [phase3 issue: ${updateError}]`]).catch(() => {});
      }
      await logIssue(`- ca_id=${row.id} | component=\`${row.component_name}\` | attr=\`${row.attribute_name}\` (${row.value_type}) | reason: ${updateError} | prose: "${(row.value_text || '').slice(0, 200)}"`);
    }

    if (attempted % 20 === 0) {
      console.log(`  [3a] ${attempted}/${rows.length}  ok=${ok}  review=${marked_review}`);
    }

    // Commit progress every ~50 rows
    if (COMMIT && attempted - lastCommitAt >= 50) {
      // PG auto-commits each statement (autocommit mode). Nothing to do.
      lastCommitAt = attempted;
    }
  }

  console.log(`[3a] done — attempted=${attempted}, back-filled=${ok}, marked review=${marked_review}`);
  return { attempted, ok, marked_review };
}

// ===== Phase 3b: claims back-fill =====

async function phase3b() {
  console.log('\n=== 3b — claims_v2 back-fill ===');

  const { rows: attrDefs } = await pgClient.query(`SELECT id, attribute_name, value_type FROM attribute_definitions ORDER BY display_order`);
  const attrIdByName = Object.fromEntries(attrDefs.map((a) => [a.attribute_name, { id: a.id, value_type: a.value_type }]));
  const attrNameList = attrDefs.map((a) => a.attribute_name).join(', ');

  const { rows: claims } = await pgClient.query(`
    SELECT cl.id, cl.initiative_id, cl.component_id, cl.claim_text, cl.role, cl.criticality,
           cl.attribute_def_id, cl.threshold_op, cl.threshold_value_numeric, cl.threshold_value_text,
           cl.threshold_unit, cl.deadline_date, cl.threshold_direction,
           c.name AS component_name, c.vector
    FROM claims_v2 cl
    JOIN components c ON c.id = cl.component_id
    JOIN initiatives_v2 i ON i.id = c.initiative_id
    WHERE i.company_id = $1
    ORDER BY cl.id
  `, [COMPANY_ID]);
  console.log(`[3b] ${claims.length} claims to back-fill`);

  const SYSTEM_CLAIM = `You parse analyst claim prose into structured threshold form. Output STRICT JSON.

Schema:
{
  "attribute_name": string (must be from the provided list, or null if no clear attribute reference),
  "threshold_op": "lt"|"gt"|"eq"|"between"|"not"|null,
  "threshold_value_numeric": number or null,
  "threshold_value_text": string or null,
  "threshold_unit": string or null,
  "deadline_date": "YYYY-MM-DD" or null,
  "threshold_direction": "toward_threshold_increases_confidence"|"toward_threshold_decreases_confidence"|"crossing_falsifies"|"crossing_validates"|null,
  "reasoning": string (1 short sentence)
}

Direction guide:
- principal claim, threshold movement positive for the initiative -> "toward_threshold_increases_confidence"
- principal claim, threshold movement negative -> "toward_threshold_decreases_confidence"
- external_threat, threshold being crossed kills the thesis -> "crossing_falsifies"
- enabling claim, threshold being crossed validates the thesis -> "crossing_validates"

If the prose is unparseable into structured threshold, output {"parseable": false, "reason": "..."}.`;

  let attempted = 0, ok = 0, marked_review = 0;

  for (const cl of claims) {
    attempted++;

    const userPrompt = `claim_text: """${cl.claim_text}"""
role: ${cl.role}
criticality: ${cl.criticality}
component: ${cl.component_name} (vector=${cl.vector})

Available attribute_names: ${attrNameList}

Parse into structured JSON.`;

    let parsed = null, parseError = null;
    try {
      const text = await callHaiku(SYSTEM_CLAIM, userPrompt, 600);
      parsed = extractJson(text);
      if (!parsed) parseError = 'haiku output not valid JSON';
      else if (parsed.parseable === false) parseError = parsed.reason || 'unparseable';
    } catch (e) { parseError = `haiku error: ${e.message.slice(0, 200)}`; }

    if (parseError) {
      marked_review++;
      await logIssue(`- claim_id=${cl.id} | component=\`${cl.component_name}\` | role=${cl.role} | reason: ${parseError} | claim_text: "${cl.claim_text.slice(0, 200)}"`);
      continue;
    }

    // Map attribute_name -> attribute_def_id
    let attrId = null;
    if (parsed.attribute_name && attrIdByName[parsed.attribute_name]) {
      attrId = attrIdByName[parsed.attribute_name].id;
    }

    // Build update — only fill in fields that aren't already set
    const updates = {};
    if (cl.attribute_def_id == null && attrId != null) updates.attribute_def_id = attrId;
    if (cl.threshold_op == null && parsed.threshold_op) updates.threshold_op = parsed.threshold_op;
    if (cl.threshold_value_numeric == null && typeof parsed.threshold_value_numeric === 'number') updates.threshold_value_numeric = parsed.threshold_value_numeric;
    if (cl.threshold_value_text == null && parsed.threshold_value_text) updates.threshold_value_text = parsed.threshold_value_text;
    if (cl.threshold_unit == null && parsed.threshold_unit) updates.threshold_unit = parsed.threshold_unit;
    if (cl.deadline_date == null && parsed.deadline_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline_date)) updates.deadline_date = parsed.deadline_date;
    if (cl.threshold_direction == null && ['toward_threshold_increases_confidence','toward_threshold_decreases_confidence','crossing_falsifies','crossing_validates'].includes(parsed.threshold_direction)) {
      updates.threshold_direction = parsed.threshold_direction;
    }

    if (Object.keys(updates).length === 0) {
      // Already fully structured — count as ok
      ok++;
      continue;
    }

    const setCols = Object.keys(updates);
    const placeholders = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const vals = setCols.map((c) => updates[c]);
    vals.push(cl.id);
    if (COMMIT) {
      try {
        await pgClient.query(`UPDATE claims_v2 SET ${placeholders}, last_updated_at = NOW() WHERE id = $${vals.length}`, vals);
        ok++;
      } catch (e) {
        marked_review++;
        await logIssue(`- claim_id=${cl.id} | UPDATE failed: ${e.message.slice(0, 200)} | claim_text: "${cl.claim_text.slice(0, 200)}"`);
      }
    } else {
      ok++;
    }
  }

  console.log(`[3b] done — attempted=${attempted}, structured=${ok}, marked review=${marked_review}`);
  return { attempted, ok, marked_review };
}

// ===== Phase 3c: reasoning back-fill (placeholder) =====

async function phase3c() {
  console.log('\n=== 3c — reasoning back-fill (placeholders) ===');
  const placeholder = 'Back-filled from v2 — analyst to review and expand';

  if (!COMMIT) {
    console.log('  [dry-run] would back-fill state_reasoning, trajectory_reasoning, criticality_reasoning, impact_reasoning placeholders');
    return { initiatives: 0, components: 0, claims: 0 };
  }

  const r1 = await pgClient.query(`
    UPDATE initiatives_v2 SET state_reasoning=$1, trajectory_reasoning=$1
    WHERE company_id=$2 AND state IS NOT NULL AND state_reasoning IS NULL
  `, [placeholder, COMPANY_ID]);

  const r2 = await pgClient.query(`
    UPDATE components SET state_reasoning=$1, trajectory_reasoning=$1
    WHERE initiative_id IN (SELECT id FROM initiatives_v2 WHERE company_id=$2)
      AND state IS NOT NULL AND state_reasoning IS NULL
  `, [placeholder, COMPANY_ID]);

  const r3 = await pgClient.query(`
    UPDATE claims_v2 SET criticality_reasoning=$1, impact_reasoning=$1
    WHERE component_id IN (
      SELECT c.id FROM components c JOIN initiatives_v2 i ON i.id=c.initiative_id
      WHERE i.company_id=$2
    ) AND criticality_reasoning IS NULL
  `, [placeholder, COMPANY_ID]);

  console.log(`[3c] back-filled: initiatives=${r1.rowCount}, components=${r2.rowCount}, claims=${r3.rowCount}`);
  return { initiatives: r1.rowCount, components: r2.rowCount, claims: r3.rowCount };
}

// ===== Phase 3d: catalogue_names index =====

async function phase3d() {
  console.log('\n=== 3d — catalogue_names index ===');

  if (!COMMIT) {
    console.log('  [dry-run] would populate catalogue_names from components, tech_functions, companies, initiatives_v2');
    return { components: 0, tech_functions: 0, companies: 0, initiatives: 0 };
  }

  const r1 = await pgClient.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT name, 'component', id, 'components'
    FROM components
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = components.id AND cn.reference_table = 'components'
    )
  `);
  const r2 = await pgClient.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT function_name, 'tech_function', id, 'tech_functions'
    FROM tech_functions
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = tech_functions.id AND cn.reference_table = 'tech_functions'
    )
  `);
  const r3 = await pgClient.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT name, 'company', id, 'companies'
    FROM companies
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = companies.id AND cn.reference_table = 'companies'
    )
  `);
  const r4 = await pgClient.query(`
    INSERT INTO catalogue_names (entity_name, entity_type, reference_id, reference_table)
    SELECT name, 'initiative', id, 'initiatives_v2'
    FROM initiatives_v2
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogue_names cn WHERE cn.reference_id = initiatives_v2.id AND cn.reference_table = 'initiatives_v2'
    )
  `);

  console.log(`[3d] populated catalogue_names: components=${r1.rowCount}, tech_functions=${r2.rowCount}, companies=${r3.rowCount}, initiatives=${r4.rowCount}`);
  return { components: r1.rowCount, tech_functions: r2.rowCount, companies: r3.rowCount, initiatives: r4.rowCount };
}

// ===== Run =====

const t0 = Date.now();
const r3a = await phase3a();
const r3b = await phase3b();
const r3c = await phase3c();
const r3d = await phase3d();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log('\n=== Summary ===');
console.log(`elapsed: ${elapsed}s`);
console.log(`3a component_attributes: attempted=${r3a.attempted}, back-filled=${r3a.ok}, marked review=${r3a.marked_review}`);
console.log(`3b claims_v2:            attempted=${r3b.attempted}, structured=${r3b.ok}, marked review=${r3b.marked_review}`);
console.log(`3c reasoning placeholders: initiatives=${r3c.initiatives}, components=${r3c.components}, claims=${r3c.claims}`);
console.log(`3d catalogue_names:      components=${r3d.components}, tech_functions=${r3d.tech_functions}, companies=${r3d.companies}, initiatives=${r3d.initiatives}`);

await pgClient.end();
