// db/population/_populator_v2.mjs
// Direct-PG populator for the v2 framework (initiatives_v2 + components +
// claims_v2 + component_attributes). Mirrors the data model and idempotency
// semantics of shell_v2.mjs but uses direct PG rather than the Signal Engine
// API — chosen because the API Bearer token state is unverified and the
// memory rule on credential interception (.claude/settings.local.json) keeps
// us out of that path until the user confirms.
//
// Usage from a population script:
//   import { runPopulation } from './_populator_v2.mjs';
//   await runPopulation({ company, initiatives, dryRun });
//
// All inserts are wrapped in a transaction; --commit triggers the actual
// writes, dry-run reports counts only.
//
// Conflict / idempotency:
//   - companies: ON CONFLICT (name) DO NOTHING then SELECT — reuses existing row
//   - initiatives_v2: ON CONFLICT (company_id, name) DO UPDATE on the
//     hypothesis_statement / horizon / persona / time_horizon_year /
//     decision_threshold / baseline_confidence / state_reasoning /
//     trajectory_reasoning fields (re-runs of the same population update prose
//     but never lose existing IDs)
//   - components: no unique constraint on (initiative_id, name) in schema, so
//     we SELECT before INSERT to avoid duplicates
//   - component_attributes: trigger creates one pending row per attribute_def
//     for the component's vector; this populator updates rows by
//     (component_id, attribute_def_id) rather than re-inserting
//   - claims_v2: SELECT by (initiative_id, component_id, role, claim_text)
//     before INSERT (no schema unique key, dedup is procedural)

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

// Step-10 equivalent gate for v2 initiatives. Returns failures array.
// Discipline mirrors shell_v2.mjs:
//   - 1 principal claim required (a "primary" component is the principal anchor)
//   - 2-6 enabling claims (not >8)
//   - hypothesis_statement, horizon, persona, time_horizon_year, decision_threshold,
//     baseline_confidence all required
//   - every component must have source_citation (NOT NULL in schema, but check anyway)
function gateInitiative(init) {
  const f = [];
  for (const k of ['name','hypothesis_statement','horizon','persona','time_horizon_year','decision_threshold','baseline_confidence','state','trajectory','state_reasoning','trajectory_reasoning']) {
    if (init[k] === undefined || init[k] === null || init[k] === '') f.push(`init.${k} blank`);
  }
  if (typeof init.baseline_confidence !== 'number' || init.baseline_confidence < 0 || init.baseline_confidence > 1) f.push('baseline_confidence not in [0,1]');
  if (!['H1','H2','H3'].includes(init.horizon)) f.push(`horizon not H1/H2/H3 (got ${init.horizon})`);
  if (!['operations','strategy','board'].includes(init.persona)) f.push(`persona invalid (got ${init.persona})`);

  const comps = init.components || [];
  if (comps.length < 2) f.push(`components count ${comps.length} (must be >=2)`);
  for (const c of comps) {
    for (const k of ['name','vector','component_type','source_citation']) {
      if (!c[k]) f.push(`component ${c.name||'?'}.${k} blank`);
    }
    if (!['tech','regulation','market','ecosystem','competition'].includes(c.vector)) f.push(`component ${c.name} vector invalid (${c.vector})`);
  }

  const claims = init.claims || [];
  const principal = claims.filter((x) => x.role === 'principal');
  const enabling = claims.filter((x) => x.role === 'enabling');
  if (principal.length < 1) f.push(`claims principal count ${principal.length} (must be >=1)`);
  if (enabling.length > 8) f.push(`claims enabling count ${enabling.length} (must be <=8)`);
  for (const cl of claims) {
    for (const k of ['claim_text','role','impact','criticality','claim_basis','component_name']) {
      if (!cl[k]) f.push(`claim role=${cl.role} missing ${k}`);
    }
  }

  return f;
}

async function getOrCreateCompany(client, payload) {
  const sel = await client.query('SELECT id, name FROM catalogue.companies WHERE name = $1', [payload.name]);
  if (sel.rows[0]) {
    console.log(`  [reuse] companies.id=${sel.rows[0].id} name=${payload.name}`);
    return sel.rows[0];
  }
  const ins = await client.query(
    `INSERT INTO catalogue.companies (name, sector, notes) VALUES ($1,$2,$3) RETURNING id, name`,
    [payload.name, payload.sector, payload.notes || null]
  );
  console.log(`  [insert] companies.id=${ins.rows[0].id} name=${payload.name}`);
  return ins.rows[0];
}

async function getOrCreateInitiative(client, companyId, init) {
  const sel = await client.query(
    'SELECT id FROM catalogue.initiatives_v2 WHERE company_id=$1 AND name=$2',
    [companyId, init.name]
  );
  const cols = [
    'company_id','name','strategy_context','brief_description','hypothesis_statement',
    'why_it_matters','horizon','persona','time_horizon_year','time_horizon_source',
    'decision_threshold','baseline_confidence','current_confidence','draft_status',
    'state','trajectory','state_reasoning','trajectory_reasoning',
  ];
  const vals = [
    companyId, init.name, init.strategy_context || null, init.brief_description || null,
    init.hypothesis_statement, init.why_it_matters || null, init.horizon, init.persona,
    init.time_horizon_year, init.time_horizon_source || null, init.decision_threshold,
    init.baseline_confidence, init.current_confidence ?? init.baseline_confidence,
    init.draft_status || 'draft_unreviewed',
    init.state, init.trajectory, init.state_reasoning, init.trajectory_reasoning,
  ];

  if (sel.rows[0]) {
    const id = sel.rows[0].id;
    const updateSets = cols.slice(2).map((c, i) => `${c} = $${i + 3}`).join(', ');
    await client.query(
      `UPDATE catalogue.initiatives_v2 SET ${updateSets}, last_updated_at = NOW() WHERE id = $1`,
      [id, companyId, ...vals.slice(2)]
    );
    console.log(`    [update] initiatives_v2.id=${id} ${init.name.slice(0,70)}`);
    return { id, reused: true };
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const ins = await client.query(
    `INSERT INTO catalogue.initiatives_v2 (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    vals
  );
  const id = ins.rows[0].id;
  console.log(`    [insert] initiatives_v2.id=${id} ${init.name.slice(0,70)}`);
  return { id, reused: false };
}

async function getOrCreateComponent(client, initiativeId, comp) {
  const sel = await client.query(
    'SELECT id FROM catalogue.components WHERE initiative_id=$1 AND name=$2',
    [initiativeId, comp.name]
  );
  if (sel.rows[0]) {
    const id = sel.rows[0].id;
    await client.query(
      `UPDATE catalogue.components
         SET description=$2, component_type=$3, vector=$4, horizon=$5,
             cross_industry=$6, source_citation=$7,
             state=$8, trajectory=$9, state_reasoning=$10, trajectory_reasoning=$11,
             last_updated_at=NOW()
       WHERE id=$1`,
      [id, comp.description || null, comp.component_type, comp.vector, comp.horizon || null,
        comp.cross_industry ?? false, comp.source_citation,
        comp.state || null, comp.trajectory || null,
        comp.state_reasoning || null, comp.trajectory_reasoning || null]
    );
    console.log(`      [update] components.id=${id} ${comp.name} (vec=${comp.vector})`);
    return { id, reused: true };
  }
  const ins = await client.query(
    `INSERT INTO catalogue.components
      (initiative_id, name, description, component_type, vector, horizon,
       cross_industry, draft_status, source_citation,
       state, trajectory, state_reasoning, trajectory_reasoning)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [initiativeId, comp.name, comp.description || null, comp.component_type, comp.vector,
      comp.horizon || null, comp.cross_industry ?? false, comp.draft_status || 'draft_unreviewed',
      comp.source_citation,
      comp.state || null, comp.trajectory || null,
      comp.state_reasoning || null, comp.trajectory_reasoning || null]
  );
  const id = ins.rows[0].id;
  console.log(`      [insert] components.id=${id} ${comp.name} (vec=${comp.vector})`);
  return { id, reused: false };
}

// After component insert, the trigger has created `pending` rows in
// component_attributes — one per attribute_definition for the vector.
// We resolve every pending row to `not_in_source` with a citation-anchored
// reason, except where the component's `populated_attributes` map provides
// a populated value. This satisfies the v2 discipline (zero pending after
// population) without inventing attribute values the brief does not
// support.
async function resolvePendingAttributes(client, componentId, comp, fallbackReason) {
  const populated = comp.populated_attributes || {};

  const pending = await client.query(
    `SELECT ca.id, ca.value_status, ad.attribute_name
       FROM catalogue.component_attributes ca
       JOIN catalogue.attribute_definitions ad ON ad.id = ca.attribute_def_id
      WHERE ca.component_id = $1 AND ca.value_status = 'pending'`,
    [componentId]
  );

  let popCount = 0, nisCount = 0;
  for (const row of pending.rows) {
    const popVal = populated[row.attribute_name];
    if (popVal && popVal.value_status === 'populated') {
      const fields = {
        value_status: 'populated',
        value_text: popVal.value_text ?? null,
        value_numeric: typeof popVal.value_numeric === 'number' ? popVal.value_numeric : null,
        value_categorical: popVal.value_categorical ?? null,
        source_citation: popVal.source_citation || comp.source_citation,
        confidence_band: popVal.confidence_band || 'medium',
      };
      await client.query(
        `UPDATE catalogue.component_attributes
            SET value_status=$2, value_text=$3, value_numeric=$4, value_categorical=$5,
                source_citation=$6, confidence_band=$7, last_updated_at=NOW()
          WHERE id=$1`,
        [row.id, fields.value_status, fields.value_text, fields.value_numeric,
          fields.value_categorical, fields.source_citation, fields.confidence_band]
      );
      popCount++;
    } else {
      const reason = (popVal && popVal.not_in_source_reason) || fallbackReason;
      await client.query(
        `UPDATE catalogue.component_attributes
            SET value_status='not_in_source', not_in_source_reason=$2, last_updated_at=NOW()
          WHERE id=$1`,
        [row.id, reason]
      );
      nisCount++;
    }
  }
  if (popCount + nisCount > 0) {
    console.log(`        attrs: ${popCount} populated, ${nisCount} not_in_source`);
  }
}

async function getOrCreateClaim(client, initiativeId, componentId, claim) {
  const sel = await client.query(
    `SELECT id FROM catalogue.claims_v2
      WHERE initiative_id=$1 AND component_id=$2 AND role=$3 AND claim_text=$4`,
    [initiativeId, componentId, claim.role, claim.claim_text]
  );
  if (sel.rows[0]) {
    return { id: sel.rows[0].id, reused: true };
  }
  const ins = await client.query(
    `INSERT INTO catalogue.claims_v2
       (initiative_id, component_id, claim_text, role, impact, criticality,
        claim_basis, draft_status, threshold_op, threshold_value_numeric,
        threshold_value_text, threshold_unit, deadline_date, threshold_direction,
        criticality_reasoning, impact_reasoning)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [initiativeId, componentId, claim.claim_text, claim.role, claim.impact,
      claim.criticality, claim.claim_basis,
      claim.draft_status || 'draft_unreviewed',
      claim.threshold_op || null, claim.threshold_value_numeric ?? null,
      claim.threshold_value_text || null, claim.threshold_unit || null,
      claim.deadline_date || null, claim.threshold_direction || null,
      claim.criticality_reasoning || null, claim.impact_reasoning || null]
  );
  return { id: ins.rows[0].id, reused: false };
}

export async function runPopulation({ company, initiatives, dryRun = true }) {
  // Gate every initiative first — refuse to write any of them if any fail.
  const allFailures = [];
  for (const init of initiatives) {
    const f = gateInitiative(init);
    if (f.length) allFailures.push({ init: init.name, failures: f });
  }

  console.log(`=== Gate (v2 procedure) for ${initiatives.length} initiatives ===`);
  for (const init of initiatives) {
    const f = gateInitiative(init);
    if (f.length === 0) console.log(`  PASS  ${init.name.slice(0,80)}`);
    else {
      console.log(`  FAIL  ${init.name.slice(0,80)}`);
      for (const x of f) console.log(`        - ${x}`);
    }
  }

  if (allFailures.length) {
    console.error('\n[gate] Refusing to commit — fix gate failures first.');
    if (!dryRun) process.exit(2);
  }

  if (dryRun) {
    console.log('\n[dry-run] no PG writes performed.');
    let totalComps = 0, totalClaims = 0;
    for (const i of initiatives) {
      totalComps += (i.components || []).length;
      totalClaims += (i.claims || []).length;
    }
    console.log(`Would insert: 1 company, ${initiatives.length} initiatives, ${totalComps} components, ${totalClaims} claims_v2.`);
    return;
  }

  const client = await pgClient();
  await client.query('BEGIN');
  try {
    const co = await getOrCreateCompany(client, company);
    let comps = 0, claimsN = 0, attrsResolved = 0;
    for (const init of initiatives) {
      const { id: initId } = await getOrCreateInitiative(client, co.id, init);
      const compIdByName = {};
      for (const comp of init.components) {
        const { id: compId } = await getOrCreateComponent(client, initId, comp);
        compIdByName[comp.name] = compId;
        comps++;
        const fallback = `T1 (${comp.source_citation}): brief does not address this attribute explicitly. T2 (industry sources): out of scope for v0 population.`;
        await resolvePendingAttributes(client, compId, comp, fallback);
        attrsResolved++;
      }
      for (const cl of (init.claims || [])) {
        const compId = compIdByName[cl.component_name];
        if (!compId) {
          throw new Error(`claim references unknown component name "${cl.component_name}" in initiative "${init.name}"`);
        }
        const r = await getOrCreateClaim(client, initId, compId, cl);
        if (!r.reused) claimsN++;
      }
    }
    await client.query('COMMIT');
    console.log(`\n[pg] COMMIT — ${initiatives.length} initiatives, ${comps} components, ${claimsN} new claims, ${attrsResolved} component attribute sets resolved.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('\n[pg] ROLLBACK:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}
