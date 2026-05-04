#!/usr/bin/env node
// 009_runner.js — applies db/migrations/009_contact_extensions.sql.
// Schema effect: v8.0 → v8.1. Additive.

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
await loadEnv(join(__dirname, '..', '.env'));
await loadEnv(join(__dirname, '..', '..', 'n8n', '.env'));

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const CONFIRM = args.includes('--confirm-yes');
const WILL_COMMIT = COMMIT && CONFIRM;
if (COMMIT && !CONFIRM) { console.error('--commit requires --confirm-yes'); process.exit(1); }

const sql = await readFile(join(__dirname, '009_contact_extensions.sql'), 'utf8');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log(`=== Migration 009 — contact_extensions (v8.0 → v8.1) ===  Mode: ${WILL_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);

try {
  await c.query('BEGIN');
  await c.query(sql);

  console.log('\n=== Verification ===');
  let n = 1;

  // contacts new columns
  const expected = ['datasette_contact_id','datasette_entity_id','datasette_persona_id','original_company_name','linkedin_url','dept','seniority','tier','hq_location','comm_style','content_depth','tech_interests','strategies','signal_types'];
  const { rows: cols } = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name = ANY($1::text[])`, [expected]);
  const got = new Set(cols.map(r => r.column_name));
  const missing = expected.filter(e => !got.has(e));
  if (missing.length) throw new Error(`contacts missing columns: ${missing.join(', ')}`);
  console.log(`  (${n}) contacts: +${expected.length} columns ✓`); n++;

  // companies sector enum
  const { rows: cs } = await c.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='companies_sector_check'`);
  if (!cs[0]?.def?.includes("'unknown'")) throw new Error('companies_sector_check does not include unknown');
  console.log(`  (${n}) companies.sector enum extended (+'unknown') ✓`); n++;

  // unique idx on datasette_contact_id
  const { rows: idx } = await c.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='idx_contacts_datasette_id'`);
  if (idx.length === 0) throw new Error('idx_contacts_datasette_id not present');
  console.log(`  (${n}) idx_contacts_datasette_id (UNIQUE WHERE NOT NULL) ✓`); n++;

  // schema_migrations row 9
  const { rows: sm } = await c.query(`SELECT version, name FROM schema_migrations WHERE version=9`);
  if (sm.length === 0) throw new Error('schema_migrations v9 missing');
  console.log(`  (${n}) schema_migrations v9 = ${sm[0].name} ✓`); n++;

  // idempotency
  await c.query(sql);
  console.log(`  (${n}) idempotency: re-applied SQL inside transaction ✓`); n++;

  console.log(`\nAll ${n - 1} verification checks passed.`);

  if (WILL_COMMIT) { await c.query('COMMIT'); console.log('\n[pg] COMMIT — schema 009 persisted'); }
  else             { await c.query('ROLLBACK'); console.log('\n[pg] ROLLBACK (dry-run)'); }
} catch (err) {
  await c.query('ROLLBACK').catch(() => {});
  console.error(`\n[pg] ROLLBACK due to error: ${err.message}`);
  await c.end(); process.exit(1);
}
await c.end();
