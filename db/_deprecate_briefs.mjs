// Bulk-add deprecation banner to all *_intelligence_brief*.html files in the
// repo root. Maps filename → company URL parameter where v8 has matching PG
// data; for files without v8 coverage (datwyler, edf, eon, halliburton, woco)
// the banner links to v8 root with a note that the company is not yet in the
// catalogue.
//
// Idempotent: skips files that already have the deprecation banner.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Filename prefix → v8 company URL parameter (must match catalogue.companies.name exactly)
const COMPANY_MAP = {
  'shell':       'Shell',
  'bp':          'BP plc',
  'vw':          'Volkswagen Group',
  'audi':        'Audi AG',
  'porsche':     'Porsche AG',
  'skoda':       'Skoda Auto',
  'seat_cupra':  'SEAT / CUPRA',
  'daimler':     'Mercedes-Benz',  // historic filename → renamed company
  'infineon':    'Infineon Technologies AG',
  'michelin':    'Michelin Group',
  'mol':         'MOL Group',
};
// Files without v8 coverage — banner still added, link to v8 root
const UNCOVERED = new Set(['datwyler','edf','eon','halliburton','woco']);

const BANNER_MARKER = '<!-- v8-deprecation-banner -->';

function banner(companyParam, hasCoverage) {
  const url = hasCoverage
    ? `account_plans_v8.html?company=${encodeURIComponent(companyParam)}`
    : 'account_plans_v8.html';
  const label = hasCoverage ? `Open ${companyParam} in v8 →` : 'Open Account Plans v8 →';
  const note = hasCoverage
    ? `This brief has been superseded by the live account plan tool, which pulls hypotheses, ontology pairs, signal log and contacts directly from the catalogue.`
    : `This brief has been superseded by the live account plan tool. ${companyParam} is not yet populated in the live catalogue — generate hypotheses first then it will appear in v8.`;
  return `${BANNER_MARKER}
<div style="background:#000;color:#fff;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:2px solid #F84E5D">
  <span style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;color:#F84E5D">DEPRECATED</span>
  <span style="flex:1;line-height:1.45">${note}</span>
  <a href="${url}" style="background:#F84E5D;color:#fff;text-decoration:none;padding:7px 14px;font-weight:600;font-size:12px;letter-spacing:0.04em;white-space:nowrap">${label}</a>
</div>
`;
}

const files = (await readdir(repoRoot)).filter(f =>
  /_intelligence_brief.*\.html$/i.test(f)
);

let modified = 0, skipped = 0, unmatched = [];
for (const file of files) {
  const path = join(repoRoot, file);
  const content = await readFile(path, 'utf8');
  if (content.includes(BANNER_MARKER)) {
    skipped++;
    continue;
  }
  // Determine company from filename prefix
  const prefix = file.replace(/_intelligence_brief.*$/i, '').toLowerCase();
  const companyParam = COMPANY_MAP[prefix];
  const hasCoverage = !!companyParam;
  const labelForBanner = companyParam || prefix.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (!hasCoverage && !UNCOVERED.has(prefix)) {
    unmatched.push(prefix);
  }
  // Insert banner immediately after <body>
  const bannerHtml = banner(labelForBanner, hasCoverage);
  if (!content.includes('<body>')) {
    console.log(`  [SKIP] ${file} — no <body> tag found`);
    continue;
  }
  const updated = content.replace('<body>', '<body>\n' + bannerHtml);
  await writeFile(path, updated, 'utf8');
  modified++;
  console.log(`  [+] ${file} → ${hasCoverage ? companyParam : '(uncovered)'}`);
}
console.log(`\nModified: ${modified} · skipped (already deprecated): ${skipped}`);
if (unmatched.length) console.log(`Unmatched prefixes (added with title-cased name as v8 link without ?company=): ${unmatched.join(', ')}`);
