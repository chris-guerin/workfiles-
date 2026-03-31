/**
 * hyp-loader.js  —  Signal Engine · Hypothesis Live Loader
 * 
 * Commit once to your GitHub repo root.
 * Each brief includes:
 *   <div id="hyp-root" data-entity="SHELL"></div>
 *   <script src="../hyp-loader.js"></script>
 * 
 * Set HYP_API_URL to your deployed Apps Script web app URL.
 */

const HYP_API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

(function () {
  const root = document.getElementById('hyp-root');
  if (!root) return;

  const entity = (root.dataset.entity || '').toUpperCase();
  if (!entity) { root.innerHTML = '<p style="color:#4a6278">No entity specified.</p>'; return; }

  // ── Loading state ────────────────────────────────────────────────────────
  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:32px 0;color:#4a6278;
                font-family:Courier New,monospace;font-size:0.7rem;letter-spacing:0.1em">
      <span style="animation:spin 1.2s linear infinite;display:inline-block">◌</span>
      LOADING LIVE HYPOTHESES…
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;

  // ── Fetch ────────────────────────────────────────────────────────────────
  fetch(`${HYP_API_URL}?entity=${entity}&register=ACCOUNT&limit=3`)
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      if (!data.hypotheses || data.hypotheses.length === 0) {
        root.innerHTML = renderEmpty(entity);
        return;
      }

      // Summary strip
      const avg = Math.round(
        data.hypotheses.reduce((s, h) => s + h.probability_current, 0) / data.hypotheses.length
      );

      let html = renderSummaryStrip(data.hypotheses.length, avg, data.updated_at);
      data.hypotheses.forEach(h => { html += renderCard(h); });
      root.innerHTML = html;
    })
    .catch(err => {
      root.innerHTML = renderError(err.message);
    });

  // ── Renderers ────────────────────────────────────────────────────────────

  function renderSummaryStrip(count, avg, date) {
    return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border,#1c2e3e);
                border:1px solid var(--border,#1c2e3e);margin-bottom:40px">
      <div style="background:var(--panel,#131f2b);padding:16px">
        <div style="font-family:Courier New,monospace;font-size:1.4rem;font-weight:700;color:var(--text,#e8eef5);margin-bottom:2px">${count}</div>
        <div style="font-size:0.75rem;color:#4a6278">Active hypotheses</div>
        <div style="font-family:Courier New,monospace;font-size:0.55rem;color:#4a6278;margin-top:2px">Live from Signal Engine</div>
      </div>
      <div style="background:var(--panel,#131f2b);padding:16px">
        <div style="font-family:Courier New,monospace;font-size:1.4rem;font-weight:700;color:var(--text,#e8eef5);margin-bottom:2px">${avg}%</div>
        <div style="font-size:0.75rem;color:#4a6278">Average probability</div>
        <div style="font-family:Courier New,monospace;font-size:0.55rem;color:#4a6278;margin-top:2px">Across all active</div>
      </div>
      <div style="background:var(--panel,#131f2b);padding:16px">
        <div style="font-family:Courier New,monospace;font-size:1.4rem;font-weight:700;color:#22AE8A;margin-bottom:2px">● LIVE</div>
        <div style="font-size:0.75rem;color:#4a6278">Signal Engine feed</div>
        <div style="font-family:Courier New,monospace;font-size:0.55rem;color:#4a6278;margin-top:2px">Updated ${date || 'today'}</div>
      </div>
    </div>`;
  }

  function renderCard(h) {
    const delta    = h.probability_current - h.probability_previous;
    const arrow    = h.velocity_direction === 'rising'  ? '↑' :
                     h.velocity_direction === 'falling' ? '↓' : '→';
    const velColor = h.velocity_direction === 'rising'  ? '#22AE8A' :
                     h.velocity_direction === 'falling' ? '#F84E5D' : '#4a6278';
    const deltaStr = delta > 0 ? `+${delta}pt` : delta < 0 ? `${delta}pt` : 'stable';
    const prob     = Math.round(h.probability_current);

    const wntbtHtml = (h.wntbt || []).map(w =>
      `<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #1c2e3e">
        <span style="color:#d4a230;font-size:12px;flex-shrink:0;line-height:1.4">☐</span>
        <span style="font-family:Arial,sans-serif;font-size:0.82rem;color:#e8eef5;line-height:1.55">${esc(w)}</span>
      </div>`
    ).join('');

    const decisionHtml = [
      { label: '6 M',  color: '#9D7AD2', bg: 'rgba(157,122,210,0.18)', text: h.decision_6m  },
      { label: '12 M', color: '#22AE8A', bg: 'rgba(34,174,138,0.18)',  text: h.decision_12m },
      { label: '18 M', color: '#d4a230', bg: 'rgba(212,162,48,0.18)',  text: h.decision_18m },
    ].filter(d => d.text).map(d => `
      <div style="padding:10px 12px;border-bottom:1px solid #1c2e3e">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-family:Courier New,monospace;font-size:0.65rem;font-weight:700;
                       color:${d.color};background:${d.bg};padding:2px 8px;border-radius:10px">${d.label}</span>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:0.8rem;color:#8fa3b5;line-height:1.5">${esc(d.text)}</div>
      </div>`
    ).join('');

    return `
    <div style="margin:0 0 44px 0;border:1px solid #243444;border-top:2px solid #d4a230">

      <!-- Card header -->
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#131f2b;border-bottom:1px solid #1c2e3e">
        <span style="font-family:Courier New,monospace;font-size:0.6rem;letter-spacing:0.15em;color:#d4a230;font-weight:700">${esc(h.id)}</span>
        <span style="font-family:Courier New,monospace;font-size:0.55rem;color:#4a6278;border:1px solid #1c2e3e;padding:2px 8px">${esc(h.horizon)}</span>
        <span style="font-family:Courier New,monospace;font-size:0.55rem;color:${velColor};margin-left:8px">${arrow} ${deltaStr}</span>
        <span style="font-family:Courier New,monospace;font-size:0.55rem;color:#4a6278;margin-left:auto">Confidence: ${esc(h.confidence)}</span>
      </div>

      <!-- Main grid -->
      <div style="display:grid;grid-template-columns:1.6fr 1.2fr;border-bottom:1px solid #1c2e3e">

        <!-- Hypothesis + probability -->
        <div style="padding:16px;border-right:1px solid #1c2e3e;display:flex;flex-direction:column;justify-content:center">
          <div style="font-family:Courier New,monospace;font-size:0.55rem;letter-spacing:0.08em;color:#4a6278;margin-bottom:12px">HYPOTHESIS</div>
          <div style="font-family:Georgia,serif;font-size:1.05rem;font-style:italic;color:#e8eef5;line-height:1.55;margin-bottom:16px">${esc(h.title)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <div style="flex:1;height:3px;background:#1c2e3e;border-radius:2px">
              <div style="width:${prob}%;height:100%;background:#d4a230;border-radius:2px;transition:width 0.6s ease"></div>
            </div>
            <span style="font-family:Courier New,monospace;font-size:0.65rem;color:#d4a230;font-weight:700">${prob}%</span>
          </div>
          ${h.probability_previous !== h.probability_current ? `
          <div style="font-family:Courier New,monospace;font-size:0.55rem;color:${velColor};margin-top:6px">
            ${arrow} ${deltaStr} from ${Math.round(h.probability_previous)}% prev
          </div>` : ''}
        </div>

        <!-- Decisions -->
        <div>
          <div style="font-family:Courier New,monospace;font-size:0.55rem;letter-spacing:0.08em;color:#4a6278;padding:14px 12px 10px">DECISIONS</div>
          ${decisionHtml || '<div style="padding:12px;color:#4a6278;font-size:0.75rem">No decisions recorded</div>'}
        </div>
      </div>

      <!-- WNTBT -->
      <div style="background:#0f1922">
        <div style="display:flex;align-items:center;gap:16px;padding:12px 16px 8px;border-bottom:1px solid #1c2e3e">
          <span style="font-family:Courier New,monospace;font-size:0.6rem;letter-spacing:0.1em;font-weight:700;color:#d4a230">WHAT NEEDS TO BE TRUE</span>
          <span style="flex:1;height:1px;background:#1c2e3e"></span>
        </div>
        <div style="padding:4px 16px 12px">
          ${wntbtHtml || '<div style="padding:9px 0;color:#4a6278;font-size:0.75rem">No conditions recorded</div>'}
        </div>
        ${h.engagement_implication ? `
        <div style="padding:10px 16px 14px;border-top:1px solid #1c2e3e">
          <div style="font-family:Courier New,monospace;font-size:0.5rem;letter-spacing:0.08em;color:#4a6278;margin-bottom:5px">ENGAGEMENT IMPLICATION</div>
          <div style="font-family:Arial,sans-serif;font-size:0.82rem;color:#8fa3b5;line-height:1.6;
                      padding-left:12px;border-left:2px solid #d4a230">${esc(h.engagement_implication)}</div>
        </div>` : ''}
      </div>

    </div>`;
  }

  function renderEmpty(entity) {
    return `<div style="padding:32px;color:#4a6278;font-family:Courier New,monospace;font-size:0.75rem">
      No hypotheses found for entity: ${esc(entity)}
    </div>`;
  }

  function renderError(msg) {
    return `<div style="padding:20px;border:1px solid #F84E5D;color:#F84E5D;
                        font-family:Courier New,monospace;font-size:0.7rem;margin-bottom:20px">
      ⚠ Failed to load live hypotheses: ${esc(msg)}<br>
      <span style="color:#4a6278;margin-top:6px;display:block">Static hypotheses are shown below if available.</span>
    </div>`;
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
