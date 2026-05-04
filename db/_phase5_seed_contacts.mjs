// db/_phase5_seed_contacts.mjs — seeds 3 test contacts at Shell across persona
// types and links them to the appropriate Shell initiatives, so Phase 5
// /generate_emails has someone to address.
// Uses _PHASE5_TEST email prefix for clean identification + cleanup.
//
// Run: node db/_phase5_seed_contacts.mjs --commit

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
    const eq = t.indexOf('='); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv(join(__dirname, '.env'));
await loadEnv(join(__dirname, '..', 'n8n', '.env'));

const COMMIT = process.argv.includes('--commit');
const SHELL_ID = 4;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log(`=== Phase 5 seeded contacts ===  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

if (!COMMIT) { console.log('  (dry-run; no inserts)'); await c.end(); process.exit(0); }

// Three contacts spanning the persona spectrum at Shell
const contacts = [
  { full_name: 'A. Carter (test)',  email: 'PHASE5_TEST_strategy@example.invalid', role_title: 'VP Hydrogen & CCUS',
    responsibility_area: 'Hydrogen + CCUS portfolio strategy', persona_match: 'strategy' },
  { full_name: 'B. Mendes (test)',  email: 'PHASE5_TEST_operations@example.invalid', role_title: 'Director, EV Network',
    responsibility_area: 'Shell Recharge European EV charging operations', persona_match: 'operations' },
  { full_name: 'C. Andersen (test)', email: 'PHASE5_TEST_board@example.invalid',     role_title: 'Group CFO',
    responsibility_area: 'Group financial position; LNG + upstream cash generation', persona_match: 'board' },
];

const contactIds = [];
for (const ct of contacts) {
  const ins = await c.query(`
    INSERT INTO contacts (company_id, full_name, email, role_title, responsibility_area, persona_match, active, imported_from)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE, '_phase5_test')
    ON CONFLICT (email) DO UPDATE SET responsibility_area = EXCLUDED.responsibility_area
    RETURNING id, full_name`,
    [SHELL_ID, ct.full_name, ct.email, ct.role_title, ct.responsibility_area, ct.persona_match]
  );
  contactIds.push({ id: ins.rows[0].id, persona: ct.persona_match, full_name: ins.rows[0].full_name });
  console.log(`  contact ${ins.rows[0].id}: ${ins.rows[0].full_name} (${ct.persona_match})`);
}

// Map each contact to relevant Shell initiatives
const { rows: inits } = await c.query(`SELECT id, name, persona FROM initiatives_v2 WHERE company_id = $1`, [SHELL_ID]);

for (const cid of contactIds) {
  // Primary: initiatives matching persona; secondary: rest
  for (const init of inits) {
    let strength;
    if (cid.persona === init.persona) strength = 'primary';
    else if (cid.persona === 'strategy' && init.persona) strength = 'secondary';
    else strength = 'watching';
    await c.query(`
      INSERT INTO contact_initiative_interests (contact_id, initiative_id, interest_strength)
      VALUES ($1, $2, $3)
      ON CONFLICT (contact_id, initiative_id) DO UPDATE SET interest_strength = EXCLUDED.interest_strength`,
      [cid.id, init.id, strength]
    );
  }
  console.log(`  ${cid.full_name}: linked to ${inits.length} Shell initiatives`);
}

await c.end();
console.log('Phase 5 contacts seeded.');
