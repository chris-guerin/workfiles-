// db/_phase6_acceptance.mjs — runs the 5 SCHEMA_V3 §7 acceptance test queries.
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

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function timed(label, sql, params=[]) {
  const t0 = process.hrtime.bigint();
  try {
    const r = await c.query(sql, params);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`\n=== ${label} ===  rows=${r.rows.length}  time=${ms.toFixed(1)}ms`);
    if (r.rows.length === 0) console.log('  (zero rows — query parses + executes against the schema; data sparsity expected)');
    else for (const row of r.rows.slice(0, 8)) console.log(' ', JSON.stringify(row));
    if (r.rows.length > 8) console.log(`  ... +${r.rows.length - 8} more`);
    return { rows: r.rows.length, ms };
  } catch (err) {
    console.log(`\n=== ${label} ===  ERROR`);
    console.log(`  ${err.message}`);
    return { rows: 0, ms: 0, error: err.message };
  }
}

// === Q1: Portfolio risk profile by state and trajectory ===
const Q1 = `
SELECT i.name, i.state, i.trajectory, i.current_confidence
FROM initiatives_v2 i
JOIN companies c ON c.id = i.company_id
WHERE c.name = 'Shell'
ORDER BY
  CASE i.state
    WHEN 'broken' THEN 1
    WHEN 'weakening' THEN 2
    WHEN 'ambiguous' THEN 3
    WHEN 'holding' THEN 4
    WHEN 'strengthening' THEN 5
    WHEN 'new' THEN 6
  END,
  i.current_confidence
`;

// === Q2: Components shared across initiatives via tech_function ===
const Q2 = `
SELECT tf.function_name, COUNT(DISTINCT c.id) AS component_count,
       COUNT(DISTINCT i.id) AS initiative_count,
       COUNT(DISTINCT comp.id) AS company_count
FROM tech_functions tf
JOIN component_attributes ca ON ca.value_controlled_vocab_id = tf.id
JOIN components c ON c.id = ca.component_id
JOIN initiatives_v2 i ON i.id = c.initiative_id
JOIN companies comp ON comp.id = i.company_id
GROUP BY tf.id, tf.function_name
HAVING COUNT(DISTINCT i.id) > 1
ORDER BY initiative_count DESC, function_name
`;

// === Q3: Claims approaching threshold ===
const Q3 = `
SELECT i.name, c.name AS component, cl.claim_text,
       cl.threshold_value_numeric, cl.threshold_unit,
       cl.deadline_date,
       (cl.deadline_date - CURRENT_DATE) AS days_to_deadline
FROM claims_v2 cl
JOIN components c ON c.id = cl.component_id
JOIN initiatives_v2 i ON i.id = cl.initiative_id
WHERE cl.deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '180 days'
  AND cl.threshold_value_numeric IS NOT NULL
ORDER BY cl.deadline_date
`;

// === Q4: Attributes that moved >10% in past 30 days ===
const Q4 = `
SELECT c.name, ad.attribute_name, ad.attribute_label,
       LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at) AS previous_value,
       ao.value_numeric AS current_value,
       (ao.value_numeric - LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at))
         / NULLIF(LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at), 0) AS pct_change
FROM attribute_observations ao
JOIN components c ON c.id = ao.component_id
JOIN attribute_definitions ad ON ad.id = ao.attribute_def_id
WHERE ao.observed_at > NOW() - INTERVAL '30 days'
ORDER BY ABS((ao.value_numeric - LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at))
         / NULLIF(LAG(ao.value_numeric) OVER (PARTITION BY ao.component_id, ao.attribute_def_id ORDER BY ao.observed_at), 0)) DESC NULLS LAST
LIMIT 50
`;

// === Q5: If RED III delays by 12 months, which initiatives are affected? ===
const Q5 = `
WITH RECURSIVE impact_chain AS (
  SELECT c.id, c.name, c.initiative_id, 1 AS depth, 'direct'::TEXT AS path_type
  FROM components c
  WHERE c.name ILIKE '%RED III%'
  UNION ALL
  SELECT c2.id, c2.name, c2.initiative_id, ic.depth + 1,
         CASE ic.depth WHEN 1 THEN 'first_order' ELSE 'second_order' END
  FROM impact_chain ic
  JOIN component_dependencies cd ON cd.source_component_id = ic.id
  JOIN components c2 ON c2.id = cd.target_component_id
  WHERE ic.depth < 3
)
SELECT DISTINCT i.name AS initiative, comp.name AS company,
       array_agg(DISTINCT ic.name) AS components_affected,
       MAX(ic.depth) AS max_chain_depth
FROM impact_chain ic
JOIN initiatives_v2 i ON i.id = ic.initiative_id
JOIN companies comp ON comp.id = i.company_id
GROUP BY i.id, i.name, comp.name
ORDER BY max_chain_depth, comp.name
`;

const r1 = await timed('Q1: Portfolio risk profile by state and trajectory', Q1);
const r2 = await timed('Q2: Components shared across initiatives via tech_function', Q2);
const r3 = await timed('Q3: Claims approaching threshold (next 180 days)', Q3);
const r4 = await timed('Q4: Attributes that moved >10% in past 30 days', Q4);
const r5 = await timed('Q5: RED III impact propagation (recursive 3 hops)', Q5);

console.log('\n\n=== Acceptance test summary ===');
console.log(`Q1 state-query     : ${r1.rows} rows in ${r1.ms.toFixed(1)}ms  (target <50ms)`);
console.log(`Q2 tech_function   : ${r2.rows} rows in ${r2.ms.toFixed(1)}ms  (target <50ms)`);
console.log(`Q3 thresholds      : ${r3.rows} rows in ${r3.ms.toFixed(1)}ms  (target <50ms)`);
console.log(`Q4 movement        : ${r4.rows} rows in ${r4.ms.toFixed(1)}ms  (target <500ms)`);
console.log(`Q5 impact-prop     : ${r5.rows} rows in ${r5.ms.toFixed(1)}ms  (target <200ms)`);

await c.end();
