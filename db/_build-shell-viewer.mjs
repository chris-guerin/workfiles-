// One-off build script for /docs/client_view/shell_executive.html
// Fetches the live catalogue, embeds as offline fallback JSON, writes the
// self-contained viewer. Disposable — re-run to refresh embedded snapshot.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadKeyFromSettings() {
  const p = join(__dirname, '..', '.claude', 'settings.local.json');
  if (!existsSync(p)) return null;
  const txt = await readFile(p, 'utf8');
  const m = txt.match(/Bearer\s+([a-f0-9]{64})/);
  return m ? m[1] : null;
}

const API_BASE = 'https://signal-engine-api-production-0cf1.up.railway.app';
const API_KEY = await loadKeyFromSettings();
if (!API_KEY) { console.error('No API key.'); process.exit(1); }

async function api(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

const COMPANY_ID = 4;

console.log('[1] Fetch catalogue...');
const company        = (await api('/companies')).find((c) => c.id === COMPANY_ID);
const initiatives    = await api(`/initiatives_v2?company_id=${COMPANY_ID}`);
const allComponents  = [];
const componentsByInit = {};
for (const i of initiatives) {
  const comps = await api(`/components?initiative_id=${i.id}`);
  componentsByInit[i.id] = comps;
  allComponents.push(...comps);
}
const attrDefs = await api('/attribute_definitions');
const attrDefById = Object.fromEntries(attrDefs.map((d) => [d.id, d]));
const techFns = await api('/tech_functions');
const techFnById = Object.fromEntries(techFns.map((t) => [t.id, t]));
const attrsByCompId = {};
for (const c of allComponents) {
  const rows = await api(`/component_attributes?component_id=${c.id}`);
  rows.sort((a, b) => (attrDefById[a.attribute_def_id]?.display_order || 0) - (attrDefById[b.attribute_def_id]?.display_order || 0));
  attrsByCompId[c.id] = rows;
}
const allClaims = [];
for (const i of initiatives) {
  const claims = await api(`/claims_v2?initiative_id=${i.id}`);
  for (const c of claims) c.initiative_id = i.id;
  allClaims.push(...claims);
}

console.log(`[1]   company=${company.name}, initiatives=${initiatives.length}, components=${allComponents.length}, attrs=${Object.values(attrsByCompId).reduce((s,a)=>s+a.length,0)}, claims=${allClaims.length}, techFns=${techFns.length}, attrDefs=${attrDefs.length}`);

console.log('[2] Read executive summary...');
const summaryMd = await readFile(join(__dirname, '..', 'docs', 'client_view', 'shell_executive_summary.md'), 'utf8');

// Convert summary md -> simplified HTML (paragraphs, headings, em). Light handling.
function mdToHtml(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let inPara = [];
  const flush = () => { if (inPara.length) { out.push(`<p>${inPara.join(' ')}</p>`); inPara = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^---\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if (/^# /.test(line))      { flush(); out.push(`<h1>${escHtml(line.slice(2))}</h1>`); continue; }
    if (/^## /.test(line))     { flush(); out.push(`<h2>${inlineMd(line.slice(3))}</h2>`); continue; }
    if (/^### /.test(line))    { flush(); out.push(`<h3>${inlineMd(line.slice(4))}</h3>`); continue; }
    if (/^\s*$/.test(line))    { flush(); continue; }
    inPara.push(inlineMd(line));
  }
  flush();
  return out.join('\n');
}
function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function inlineMd(s) {
  // Light: bold, italic, em, code
  let h = escHtml(s);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  return h;
}

const summaryHtml = mdToHtml(summaryMd);

// =================================
// Build the page
// =================================
console.log('[3] Render HTML...');

const fallbackData = {
  generated_at: new Date().toISOString(),
  company,
  initiatives,
  components_by_init: componentsByInit,
  attrs_by_comp: attrsByCompId,
  attr_defs: attrDefs,
  tech_fns: techFns,
  claims: allClaims,
  summary_html: summaryHtml,
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shell — strategic posture, May 2026 · FutureBridge</title>
<style>
:root {
  --ink: #0a0a0a;
  --ink-soft: #1f1f1f;
  --muted: #666666;
  --faint: #a0a0a0;
  --rule: #e5e5e5;
  --rule-soft: #f0f0f0;
  --bg: #ffffff;
  --bg-soft: #fafafa;
  --bg-panel: #ffffff;
  --red: #d12027;
  --rag-red: #dc2626;
  --rag-amber: #fbbf24;
  --rag-green: #10b981;
  --pal-purple: #7c3aed;
  --pal-yellow: #fbbf24;
  --pal-green: #10b981;
  --pal-lblue: #60a5fa;
  --pal-blue: #2563eb;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Circular Std", "Helvetica Neue", Arial, sans-serif;
  color: var(--ink);
  background: var(--bg);
  line-height: 1.55;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
}
header.brand {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 48px 16px;
  border-bottom: 1px solid var(--rule);
}
.device {
  display: flex;
  gap: 4px;
}
.device span {
  width: 16px;
  height: 5px;
  background: var(--ink);
  display: block;
}
.logotype {
  font-family: Arial, sans-serif;
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.01em;
  color: var(--ink);
}
main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 48px 96px;
}
h1.page-title {
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.015em;
  margin: 8px 0 4px;
  color: var(--ink);
}
.subtitle {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 32px;
}
.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-soft);
  border: 1px solid var(--rule);
  border-radius: 100px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--muted);
  margin-left: 12px;
}
.live-badge .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--pal-green); display: inline-block; }
.live-badge.offline .dot { background: var(--rag-amber); }
.live-badge.error .dot { background: var(--rag-red); }
.summary {
  background: var(--bg-panel);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--ink);
  padding: 28px 36px;
  margin-bottom: 48px;
  font-size: 15.5px;
  line-height: 1.7;
}
.summary h1 { display: none; } /* page already has its own title */
.summary h2 { font-size: 17px; margin: 28px 0 8px; font-weight: 600; }
.summary h3 { font-size: 15px; margin: 22px 0 4px; font-weight: 600; color: var(--ink-soft); letter-spacing: -0.005em; }
.summary p { margin: 12px 0; color: var(--ink-soft); }
.summary hr { border: none; border-top: 1px solid var(--rule); margin: 28px 0; }
.summary code {
  background: var(--bg-soft);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 13.5px;
}
.summary em { color: var(--muted); font-style: italic; }
.summary strong { color: var(--ink); font-weight: 600; }

.rag-section h2.section-title {
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin: 0 0 16px;
}
.rag-strip {
  border-top: 1px solid var(--rule);
}
.init-row {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(220px, 280px) auto auto auto;
  align-items: center;
  gap: 20px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  transition: background 80ms;
}
.init-row:hover { background: var(--bg-soft); }
.init-row.open { background: var(--bg-soft); }
.init-name {
  font-weight: 500;
  font-size: 15px;
  color: var(--ink);
}
.init-name .horizon {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 1px 6px;
  margin-right: 8px;
  vertical-align: middle;
}
.rag-bar {
  height: 8px;
  background: linear-gradient(90deg, var(--rag-red) 0%, var(--rag-amber) 50%, var(--rag-green) 100%);
  border-radius: 4px;
  position: relative;
  width: 100%;
}
.rag-marker {
  position: absolute;
  top: -4px;
  width: 4px;
  height: 16px;
  background: var(--ink);
  border-radius: 2px;
  transform: translateX(-50%);
}
.rag-bar-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rag-conf {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: right;
}
.state-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 3px;
  font-weight: 500;
  display: inline-block;
  border: 1px solid var(--rule);
  background: var(--bg);
  color: var(--ink-soft);
}
.state-badge.holding       { background: #f3f4f6; color: #374151; border-color: #d1d5db; }
.state-badge.strengthening { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
.state-badge.weakening     { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
.state-badge.broken        { background: var(--red); color: #ffffff; border-color: var(--red); }
.state-badge.ambiguous     { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.state-badge.new           { background: #eff6ff; color: #1e3a8a; border-color: #bfdbfe; }
.traj {
  font-size: 18px;
  font-weight: 500;
  color: var(--ink-soft);
  width: 24px;
  text-align: center;
}
.traj.improving { color: var(--pal-green); }
.traj.deteriorating { color: var(--red); }
.traj.volatile { color: var(--pal-purple); }
.traj.stable { color: var(--muted); }
.chev { color: var(--faint); font-size: 14px; transition: transform 120ms; }
.init-row.open .chev { transform: rotate(90deg); }

.init-detail { display: none; padding: 0 16px 16px; border-bottom: 1px solid var(--rule); background: var(--bg-soft); }
.init-row.open + .init-detail { display: block; }

.init-detail .hyp {
  background: var(--bg-panel);
  border-left: 3px solid var(--ink);
  padding: 18px 24px;
  margin: 16px 0 20px;
  font-size: 15px;
  color: var(--ink-soft);
}
.init-detail .hyp .lbl {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.init-detail .why { margin: 12px 0 24px; color: var(--ink-soft); font-size: 14.5px; }
.init-detail .meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}
.init-detail .meta-cell {
  background: var(--bg-panel);
  border: 1px solid var(--rule);
  padding: 10px 14px;
}
.init-detail .meta-cell .lbl {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: block;
  margin-bottom: 3px;
}
.init-detail .meta-cell .val { font-size: 14px; color: var(--ink); }

.vector-group { margin: 20px 0; }
.vector-group .vec-header {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin: 0 0 8px;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 4px;
}
.comp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.comp-card {
  background: var(--bg-panel);
  border: 1px solid var(--rule);
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 80ms, background 80ms;
}
.comp-card:hover { border-color: var(--ink); }
.comp-card.open { border-color: var(--ink); background: var(--bg-panel); }
.comp-card .name {
  font-weight: 500;
  font-size: 14px;
  color: var(--ink);
  margin-bottom: 6px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 13px;
  letter-spacing: -0.01em;
}
.comp-card .row { display: flex; gap: 8px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
.comp-card .label-tiny {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.comp-card .completeness {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.comp-card .completeness strong { color: var(--ink); font-weight: 600; }
.xc-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.xc-badge {
  font-size: 10px;
  background: var(--bg-soft);
  color: var(--muted);
  padding: 1px 6px;
  border-radius: 2px;
  border: 1px solid var(--rule);
}
.comp-detail { display: none; margin-top: 12px; padding: 16px 20px; background: var(--bg-soft); border: 1px solid var(--rule); }
.comp-card.open + .comp-detail { display: block; }

.comp-detail .desc { font-size: 14px; color: var(--ink-soft); margin: 0 0 8px; }
.comp-detail .src { font-size: 12px; color: var(--muted); margin: 0 0 18px; }
.comp-detail h4 {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin: 16px 0 8px;
}
.attr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.attr-table th, .attr-table td {
  text-align: left;
  padding: 8px 10px;
  vertical-align: top;
  border-bottom: 1px solid var(--rule);
}
.attr-table th {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  background: var(--bg-soft);
}
.attr-table td.attr-name {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.attr-table td.value-cell {
  color: var(--ink);
  max-width: 320px;
}
.attr-table td.source-cell {
  color: var(--muted);
  font-size: 12px;
  max-width: 320px;
}
.status-pill {
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 2px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: inline-block;
  white-space: nowrap;
}
.status-pill.populated     { background: #ecfdf5; color: #065f46; }
.status-pill.not_in_source { background: #fef3c7; color: #92400e; }
.status-pill.not_applicable{ background: #f3f4f6; color: #4b5563; }
.status-pill.pending       { background: #fef2f2; color: #991b1b; }
.conf-pill {
  font-size: 10px;
  color: var(--muted);
  text-transform: lowercase;
}

.claims-table { margin-top: 20px; }
.claim-row {
  background: var(--bg-panel);
  border-left: 3px solid var(--rule);
  padding: 10px 14px;
  margin-bottom: 8px;
  font-size: 13.5px;
}
.claim-row.principal       { border-left-color: var(--ink); }
.claim-row.enabling        { border-left-color: var(--pal-blue); }
.claim-row.external_threat { border-left-color: var(--red); }
.claim-row .claim-meta {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

footer {
  max-width: 1280px;
  margin: 48px auto 0;
  padding: 24px 48px 48px;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 900px) {
  header.brand { padding: 16px 20px 12px; }
  main { padding: 20px 20px 64px; }
  h1.page-title { font-size: 24px; }
  .init-row { grid-template-columns: 1fr; gap: 8px; }
  .rag-bar-wrap { width: 100%; }
}
</style>
</head>
<body>
<header class="brand">
  <div class="device" aria-hidden="true">
    <span></span><span></span><span></span>
  </div>
  <div class="logotype">FutureBridge</div>
</header>

<main>
  <h1 class="page-title">Shell — strategic posture, May 2026<span id="live-status" class="live-badge"><span class="dot"></span><span class="status-text">Loading…</span></span></h1>
  <div class="subtitle">v2 catalogue · 9 initiatives · 29 components · drill three levels.</div>

  <section id="summary" class="summary">${summaryHtml}</section>

  <section class="rag-section">
    <h2 class="section-title">Initiatives — current confidence + state</h2>
    <div class="rag-strip" id="rag-strip"></div>
  </section>
</main>

<footer>
  <div>FutureBridge analysis. Catalogue queried live from PG via the v2 API; embedded snapshot is from <span id="snapshot-ts">${fallbackData.generated_at}</span>.</div>
  <div style="margin-top:6px">Click any initiative to see components by vector. Click a component to see every attribute, source, and confidence.</div>
</footer>

<!-- offline-fallback snapshot -->
<script id="fallback-data" type="application/json">${JSON.stringify(fallbackData).replace(/<\\/g, '<\\\\').replace(/<\//g, '<\\/')}</script>

<script>
"use strict";

const API_BASE = "${API_BASE}";

// ===== data loading =====
function tokenFromHash() {
  // Support live refresh by passing #key=... in the URL hash.
  // Token is NEVER committed to the file; only the user supplies it at runtime.
  const m = location.hash.match(/key=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

async function fetchLive() {
  const key = tokenFromHash();
  if (!key) throw new Error('no key in URL hash; using embedded snapshot');
  const H = { Authorization: 'Bearer ' + key };
  const j = (path) => fetch(API_BASE + path, { headers: H }).then(r => { if (!r.ok) throw new Error(path + ' -> ' + r.status); return r.json(); });
  const COMPANY_ID = 4;
  const company = (await j('/companies')).find(c => c.id === COMPANY_ID);
  const initiatives = await j('/initiatives_v2?company_id=' + COMPANY_ID);
  const components_by_init = {};
  const attrs_by_comp = {};
  const allComps = [];
  for (const i of initiatives) {
    const cs = await j('/components?initiative_id=' + i.id);
    components_by_init[i.id] = cs;
    allComps.push(...cs);
  }
  for (const c of allComps) {
    attrs_by_comp[c.id] = await j('/component_attributes?component_id=' + c.id);
  }
  const attr_defs = await j('/attribute_definitions');
  const tech_fns = await j('/tech_functions');
  const claims = [];
  for (const i of initiatives) {
    const cs = await j('/claims_v2?initiative_id=' + i.id);
    cs.forEach(c => c.initiative_id = i.id);
    claims.push(...cs);
  }
  return {
    generated_at: new Date().toISOString(),
    company, initiatives, components_by_init, attrs_by_comp, attr_defs, tech_fns, claims,
    summary_html: loadFallback().summary_html,  // re-use snapshot summary
  };
}

function loadFallback() {
  const el = document.getElementById('fallback-data');
  return JSON.parse(el.textContent || el.innerText);
}

let DATA = null;

async function bootstrap() {
  const status = document.getElementById('live-status');
  const text = status.querySelector('.status-text');
  // Try live first if a key was passed in URL hash; fall back to embedded snapshot.
  try {
    DATA = await fetchLive();
    status.classList.remove('offline'); status.classList.remove('error');
    text.textContent = 'live ' + new Date().toISOString().slice(11, 16) + ' UTC';
  } catch (e) {
    try {
      DATA = loadFallback();
      status.classList.add('offline');
      text.textContent = 'snapshot ' + DATA.generated_at.slice(0, 10);
    } catch (e2) {
      status.classList.remove('offline');
      status.classList.add('error');
      text.textContent = 'load error';
      console.error(e2);
      return;
    }
  }
  render();
}

// ===== rendering =====
function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
}

function trajGlyph(t) {
  return ({
    improving: '↗', stable: '→', deteriorating: '↘', volatile: '⇅', unknown: '?',
  })[t] || '·';
}

function compAttrCounts(comp) {
  const rows = (DATA.attrs_by_comp[comp.id] || []);
  const populated = rows.filter(r => r.value_status === 'populated').length;
  return { total: rows.length, populated };
}

function vectorOrder(v) {
  return ({ tech:1, regulation:2, market:3, ecosystem:4, competition:5 }[v] || 99);
}

function render() {
  const strip = document.getElementById('rag-strip');
  const inits = DATA.initiatives.slice().sort((a, b) => a.id - b.id);
  const html = [];
  for (const init of inits) {
    const conf = init.current_confidence == null ? (init.baseline_confidence == null ? 0.5 : Number(init.baseline_confidence)) : Number(init.current_confidence);
    const pct = Math.max(0, Math.min(1, conf)) * 100;
    const state = init.state || 'ambiguous';
    const traj = init.trajectory || 'unknown';

    html.push(\`
      <div class="init-row" data-init-id="\${init.id}" tabindex="0" role="button" aria-expanded="false">
        <div class="init-name">\${init.horizon ? \`<span class="horizon">\${esc(init.horizon)}</span>\` : ''}\${esc(init.name)}</div>
        <div class="rag-bar-wrap">
          <div class="rag-bar" aria-label="confidence \${conf.toFixed(2)}"><div class="rag-marker" style="left: \${pct}%"></div></div>
          <div class="rag-conf">\${conf.toFixed(2)}</div>
        </div>
        <div class="traj \${esc(traj)}" title="trajectory: \${esc(traj)}">\${trajGlyph(traj)}</div>
        <div class="state-badge \${esc(state)}">\${esc(state)}</div>
        <div class="chev">▸</div>
      </div>
      <div class="init-detail" data-init-id="\${init.id}"></div>
    \`);
  }
  strip.innerHTML = html.join('');
  strip.querySelectorAll('.init-row').forEach((row) => {
    row.addEventListener('click', () => toggleInit(Number(row.dataset.initId)));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInit(Number(row.dataset.initId)); } });
  });
}

function toggleInit(initId) {
  const row = document.querySelector(\`.init-row[data-init-id="\${initId}"]\`);
  const detail = document.querySelector(\`.init-detail[data-init-id="\${initId}"]\`);
  if (row.classList.contains('open')) {
    row.classList.remove('open');
    row.setAttribute('aria-expanded', 'false');
    detail.innerHTML = '';
    return;
  }
  // Optionally close others; for our use we let multiple be open.
  row.classList.add('open');
  row.setAttribute('aria-expanded', 'true');
  renderInitDetail(initId, detail);
}

function renderInitDetail(initId, mount) {
  const init = DATA.initiatives.find(i => i.id === initId);
  const comps = (DATA.components_by_init[initId] || []).slice().sort((a,b) => vectorOrder(a.vector) - vectorOrder(b.vector) || a.id - b.id);
  const claims = DATA.claims.filter(c => c.initiative_id === initId);

  const meta = [];
  if (init.horizon) meta.push({ lbl: 'Horizon', val: init.horizon });
  if (init.persona) meta.push({ lbl: 'Persona', val: init.persona });
  if (init.time_horizon_year) meta.push({ lbl: 'Year', val: String(init.time_horizon_year) });
  if (init.baseline_confidence != null) meta.push({ lbl: 'Baseline', val: Number(init.baseline_confidence).toFixed(3) });
  if (init.current_confidence != null) meta.push({ lbl: 'Current', val: Number(init.current_confidence).toFixed(3) });
  if (init.decision_threshold) meta.push({ lbl: 'Decision threshold', val: init.decision_threshold });

  // Group components by vector
  const byVec = { tech: [], regulation: [], market: [], ecosystem: [], competition: [] };
  for (const c of comps) (byVec[c.vector] || (byVec[c.vector] = [])).push(c);

  const vectorBlocks = [];
  for (const v of ['tech','regulation','market','ecosystem','competition']) {
    if (!byVec[v] || !byVec[v].length) continue;
    const cards = byVec[v].map(comp => {
      const ct = compAttrCounts(comp);
      const xc = comp.cross_industry ? '<span class="xc-badge">cross-industry</span>' : '';
      return \`
        <div class="comp-card" data-comp-id="\${comp.id}" tabindex="0" role="button" aria-expanded="false">
          <div class="name">\${esc(comp.name)}</div>
          <div class="row">
            \${comp.state ? \`<span class="state-badge \${esc(comp.state)}">\${esc(comp.state)}</span>\` : ''}
            \${comp.trajectory ? \`<span class="traj \${esc(comp.trajectory)}" style="font-size:14px">\${trajGlyph(comp.trajectory)}</span>\` : ''}
            <span class="completeness"><strong>\${ct.populated}</strong> / \${ct.total} populated</span>
          </div>
          <div class="row">
            <span class="label-tiny">\${esc(comp.component_type)}</span>
            \${xc}
          </div>
        </div>
        <div class="comp-detail" data-comp-id="\${comp.id}"></div>
      \`;
    }).join('');
    vectorBlocks.push(\`
      <div class="vector-group">
        <h3 class="vec-header">\${v} · \${byVec[v].length}</h3>
        <div class="comp-grid">\${cards}</div>
      </div>
    \`);
  }

  // Claims summary
  const claimRows = claims.length === 0 ? '' : \`
    <div class="claims-table">
      <h4 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#666;font-weight:600;margin:24px 0 8px">claims (\${claims.length})</h4>
      \${claims.map(c => \`
        <div class="claim-row \${esc(c.role)}">
          <div>\${esc(c.claim_text)}</div>
          <div class="claim-meta">
            \${esc(c.role)} · \${esc(c.criticality)} · \${c.threshold_op ? \`\${esc(c.threshold_op)} \${c.threshold_value_numeric ?? c.threshold_value_text ?? ''} \${esc(c.threshold_unit || '')}\` : ''}\${c.deadline_date ? \` · by \${esc(String(c.deadline_date).slice(0,10))}\` : ''}
          </div>
        </div>\`).join('')}
    </div>\`;

  mount.innerHTML = \`
    \${init.hypothesis_statement ? \`<div class="hyp"><span class="lbl">Hypothesis</span>\${esc(init.hypothesis_statement)}</div>\` : ''}
    \${init.why_it_matters ? \`<div class="why"><strong>Why it matters:</strong> \${esc(init.why_it_matters)}</div>\` : ''}
    <div class="meta-grid">
      \${meta.map(m => \`<div class="meta-cell"><span class="lbl">\${esc(m.lbl)}</span><span class="val">\${esc(m.val)}</span></div>\`).join('')}
    </div>
    \${vectorBlocks.join('')}
    \${claimRows}
  \`;

  // Wire component click handlers
  mount.querySelectorAll('.comp-card').forEach((card) => {
    card.addEventListener('click', () => toggleComp(Number(card.dataset.compId), mount));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleComp(Number(card.dataset.compId), mount); } });
  });
}

function toggleComp(compId, mount) {
  const card = mount.querySelector(\`.comp-card[data-comp-id="\${compId}"]\`);
  const detail = mount.querySelector(\`.comp-detail[data-comp-id="\${compId}"]\`);
  if (card.classList.contains('open')) {
    card.classList.remove('open');
    card.setAttribute('aria-expanded', 'false');
    detail.innerHTML = '';
    return;
  }
  card.classList.add('open');
  card.setAttribute('aria-expanded', 'true');
  renderCompDetail(compId, detail);
}

function renderCompDetail(compId, mount) {
  let comp = null;
  for (const arr of Object.values(DATA.components_by_init)) {
    const m = arr.find(c => c.id === compId);
    if (m) { comp = m; break; }
  }
  if (!comp) { mount.innerHTML = '<em>component not found</em>'; return; }
  const rows = (DATA.attrs_by_comp[comp.id] || []);
  const defs = DATA.attr_defs.reduce((m, d) => (m[d.id] = d, m), {});
  const tfns = DATA.tech_fns.reduce((m, t) => (m[t.id] = t, m), {});
  const sorted = rows.slice().sort((a, b) => (defs[a.attribute_def_id]?.display_order || 0) - (defs[b.attribute_def_id]?.display_order || 0));

  const attrRows = sorted.map(r => {
    const def = defs[r.attribute_def_id];
    if (!def) return '';
    let valueCell = '';
    if (r.value_status === 'populated') {
      if (r.value_numeric != null) valueCell = esc(String(r.value_numeric)) + (def.unit ? ' <span style="color:#666;font-size:11px">' + esc(def.unit) + '</span>' : '');
      else if (r.value_categorical) valueCell = '<code>' + esc(r.value_categorical) + '</code>';
      else if (r.value_controlled_vocab_id) {
        const tf = tfns[r.value_controlled_vocab_id];
        valueCell = tf ? '<code>' + esc(tf.function_name) + '</code>' : '<code>vocab#' + esc(r.value_controlled_vocab_id) + '</code>';
      }
      else valueCell = esc(r.value_text || '');
    } else {
      valueCell = '<span style="color:#999">—</span>';
    }
    let sourceCell = '';
    if (r.value_status === 'populated') sourceCell = esc(r.source_citation || '');
    else if (r.value_status === 'not_in_source') sourceCell = '<em>NIS:</em> ' + esc(r.not_in_source_reason || '');
    else if (r.value_status === 'not_applicable') sourceCell = '<em>NA:</em> ' + esc(r.not_applicable_reason || '');

    return \`
      <tr>
        <td class="attr-name">\${esc(def.attribute_name)}</td>
        <td><span class="status-pill \${esc(r.value_status)}">\${esc(r.value_status)}</span></td>
        <td class="value-cell">\${valueCell}</td>
        <td class="source-cell">\${sourceCell}</td>
        <td class="conf-pill">\${r.value_status === 'populated' && r.confidence_band ? esc(r.confidence_band) : ''}</td>
      </tr>
    \`;
  }).join('');

  mount.innerHTML = \`
    <p class="desc">\${esc(comp.description || '')}</p>
    <p class="src"><strong>Source:</strong> \${esc(comp.source_citation || '')}</p>
    <h4>Attributes (\${rows.length})</h4>
    <table class="attr-table">
      <thead>
        <tr>
          <th>Attribute</th>
          <th>Status</th>
          <th>Value</th>
          <th>Source / Reason</th>
          <th>Conf</th>
        </tr>
      </thead>
      <tbody>\${attrRows}</tbody>
    </table>
  \`;
}

bootstrap();
</script>
</body>
</html>
`;

// =================================
// Write
// =================================
const outDir = join(__dirname, '..', 'docs', 'client_view');
if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
const outPath = join(outDir, 'shell_executive.html');
await writeFile(outPath, html);
console.log(`[4] wrote ${outPath} (${html.length} chars)`);
