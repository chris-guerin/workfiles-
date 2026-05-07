// db/_accept_path_a.mjs — read-only acceptance query for Path A.
// Confirms (1) all 8 client companies have initiatives in v2, (2) the 15a
// hypothesis query returns rows for all 8 companies, (3) total components +
// claims counts match the population scripts' COMMIT output.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
async function loadEnv(p){if(!existsSync(p))return; for(const l of (await readFile(p,'utf8')).split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const eq=t.indexOf('=');if(eq<0)continue;const k=t.slice(0,eq).trim(),v=t.slice(eq+1).trim().replace(/^["']|["']$/g,'');if(!process.env[k])process.env[k]=v;}}
await loadEnv(join(__dirname,'.env'));
await loadEnv(join(__dirname,'..','n8n','.env'));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log('=== Initiatives_v2 row count by company (Path A target list) ===');
const r = await c.query(`
  SELECT co.name AS company, count(iv.*)::int AS initiatives,
         count(iv.*) FILTER (WHERE iv.draft_status='draft_unreviewed')::int AS draft_unreviewed
  FROM catalogue.companies co
  LEFT JOIN catalogue.initiatives_v2 iv ON iv.company_id = co.id
  WHERE co.name IN ('Shell','BP plc','Volkswagen Group','Skoda Auto','Porsche AG','Equinor ASA','Vattenfall AB')
  GROUP BY co.name
  ORDER BY co.name
`);
for (const x of r.rows) console.log(`  ${x.company.padEnd(28)} initiatives=${x.initiatives} (draft_unreviewed=${x.draft_unreviewed})`);

console.log('\n=== 15a hypothesis query simulation (ALL clients) ===');
const r2 = await c.query(`
  SELECT co.name AS company, count(iv.*)::int AS initiatives_for_15a
  FROM catalogue.initiatives_v2 iv
  JOIN catalogue.companies co ON co.id = iv.company_id
  WHERE iv.hypothesis_statement IS NOT NULL
    AND iv.draft_status IN ('draft_unreviewed','reviewed','promoted')
  GROUP BY co.name
  ORDER BY initiatives_for_15a DESC, co.name
`);
for (const x of r2.rows) console.log(`  ${x.company.padEnd(28)} ${x.initiatives_for_15a}`);

console.log('\n=== Components + claims_v2 totals across path A new initiatives ===');
const r3 = await c.query(`
  SELECT
    (SELECT count(*) FROM catalogue.initiatives_v2 iv
       JOIN catalogue.companies co ON co.id=iv.company_id
       WHERE co.name IN ('BP plc','Volkswagen Group','Skoda Auto','Porsche AG')
         AND iv.id >= 23)::int AS path_a_initiatives,
    (SELECT count(*) FROM catalogue.components comp
       JOIN catalogue.initiatives_v2 iv ON iv.id=comp.initiative_id
       JOIN catalogue.companies co ON co.id=iv.company_id
       WHERE co.name IN ('BP plc','Volkswagen Group','Skoda Auto','Porsche AG')
         AND iv.id >= 23)::int AS path_a_components,
    (SELECT count(*) FROM catalogue.claims_v2 cl
       JOIN catalogue.initiatives_v2 iv ON iv.id=cl.initiative_id
       JOIN catalogue.companies co ON co.id=iv.company_id
       WHERE co.name IN ('BP plc','Volkswagen Group','Skoda Auto','Porsche AG')
         AND iv.id >= 23)::int AS path_a_claims,
    (SELECT count(*) FROM catalogue.component_attributes ca
       JOIN catalogue.components comp ON comp.id=ca.component_id
       JOIN catalogue.initiatives_v2 iv ON iv.id=comp.initiative_id
       JOIN catalogue.companies co ON co.id=iv.company_id
       WHERE co.name IN ('BP plc','Volkswagen Group','Skoda Auto','Porsche AG')
         AND iv.id >= 23
         AND ca.value_status='pending')::int AS pending_attribute_rows
`);
console.log(`  initiatives:        ${r3.rows[0].path_a_initiatives} (target 12)`);
console.log(`  components:         ${r3.rows[0].path_a_components} (target 49)`);
console.log(`  claims_v2:          ${r3.rows[0].path_a_claims} (target 46)`);
console.log(`  pending attr rows:  ${r3.rows[0].pending_attribute_rows} (target 0 — v2 discipline)`);

console.log('\n=== Sample: each new initiative confirmed live ===');
const r4 = await c.query(`
  SELECT iv.id, co.name AS company, iv.name, iv.horizon, iv.persona,
         iv.time_horizon_year, iv.baseline_confidence, iv.state, iv.trajectory
  FROM catalogue.initiatives_v2 iv
  JOIN catalogue.companies co ON co.id=iv.company_id
  WHERE iv.id >= 23
  ORDER BY co.name, iv.id
`);
for (const x of r4.rows) {
  console.log(`  [${x.company}] id=${x.id} H=${x.horizon} P=${x.persona} Y=${x.time_horizon_year} c=${x.baseline_confidence} state=${x.state}/${x.trajectory}`);
  console.log(`    ${x.name.slice(0,100)}`);
}

await c.end();
