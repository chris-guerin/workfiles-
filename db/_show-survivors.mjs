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
const r = await c.query(`
  SELECT id, signal_id, event_type, companies, technologies, geography,
         left(headline, 130) AS headline, left(short_summary, 240) AS short_summary,
         left(evidence_snippet, 120) AS evidence_snippet
  FROM mini_signals WHERE id > 86 ORDER BY id
`);
for (const row of r.rows) {
  console.log('id=' + row.id + ' type=' + row.event_type);
  console.log('  headline: ' + row.headline);
  if (row.companies)        console.log('  companies:    ' + row.companies);
  if (row.technologies)     console.log('  technologies: ' + row.technologies);
  if (row.geography)        console.log('  geography:    ' + row.geography);
  if (row.short_summary)    console.log('  summary:      ' + row.short_summary);
  if (row.evidence_snippet) console.log('  evidence:     ' + row.evidence_snippet);
  console.log('');
}
await c.end();
