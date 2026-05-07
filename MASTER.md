# FutureBridge Signal Engine — Master Reference
**Version:** 3.0  
**Last updated:** 2026-05-05  
**Owner:** Chris Guerin  
**Status:** Single source of truth. All other docs are superseded by this one.  
**Lives in:** Claude Project "the river" + `docs/MASTER.md` in the workfiles repo  

> **Daily discipline:** At the end of every working session, update the "Current state" and "Open items" sections of this document. Commit and re-upload to the River project. Never let this go stale by more than one day.

---

## 1. What this is and why it exists

FutureBridge Advisory sells intelligence to energy and mobility clients — Shell, BP, TotalEnergies, TechnipFMC, Siemens Energy and others. The intelligence is good but the delivery is manual and slow. A senior analyst reads news, forms a view, writes an email, sends it. That cycle takes days and produces one email per analyst per day.

The Signal Engine automates the intelligence-to-outreach cycle. It monitors news, classifies signals against structured client hypotheses, enriches each signal with technology horizon context, and generates persona-differentiated outreach emails ready for human review. The analyst reviews and sends — the research and drafting is done.

The longer-term aspiration: a technology ontology that compounds across clients. When a signal about CCUS moves, it is assessed once and routed to every client whose hypotheses it touches. The more clients, the more valuable the system becomes per unit of analyst effort.

---

## 2. Use cases

**Today (operational):**
- Weekly news ingestion across 14 RSS feeds (energy, mobility, regulation)
- Signal classification against Shell hypotheses (other clients in build)
- Technology horizon enrichment — H1/H2/H3 per signal
- Campaign email generation — executive, strategy, and tech personas
- Account intelligence briefs — AI-powered, per-account, on demand

**In build:**
- Signal Pipeline 15b — scoring, selection, campaign generation
- Client hypothesis expansion — BP, TotalEnergies, Siemens Energy and others
- Apps Script hypothesis INSERT trigger — gap detection on new hypotheses

**Planned (designed, not built):**
- Quarterly heat map — which technology pairs each client touches, with trajectory
- Hypothesis-informed intelligence briefs — account plans pulling from PG hypotheses
- Cross-client signal routing — one signal assessed once, routed to all exposed clients

---

## 3. Tech stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Workflow automation | n8n on Railway | Signal Pipeline 15a, 15b, WeeklyNews |
| Database | PostgreSQL on Railway | All structured data — pipeline, ontology, catalogue, contacts |
| AI classification | Claude Sonnet (Anthropic API) | Signal classification, email generation |
| AI extraction | Claude Haiku (Anthropic API) | Mini signal extraction from raw news |
| Email delivery | YAMM (Gmail mail merge) | Campaign send |
| Frontend | HTML on GitHub Pages | Account plans, intelligence briefs, tools |
| Sync / dev | Claude Code (local Windows) | Database migrations, workflow builds |
| Scheduling trigger | n8n schedule nodes | Weekly cadences |
| Version control | Git / GitHub | All code, docs, migrations |
| Outreach enrichment | Google Sheets | Campaigns tab (human review before send) |

**Not in use (deprecated):**
- Datasette (futurbridge-signals.onrender.com) — replaced by PG
- Google Sheets as pipeline storage — replaced by PG
- Old n8n WF-15A-PG — deleted
- Google Sheet hypothesis repository (118-row, 49-column schema) — being deprecated

---

## 4. Infrastructure — URLs, IDs, credentials

**n8n**
- URL: `https://n8n-production-86279.up.railway.app`
- API key: stored in `C:\Users\Admin\workfiles-\n8n\.env` — rotate if exposed

**PostgreSQL (Railway)**
- Host: `switchback.proxy.rlwy.net`
- Port: `43986`
- Database: `railway`
- Connection string: in `C:\Users\Admin\workfiles-\db\.env`
- n8n credential name: `hypothesis-db Railway PG` (id: `rgPwSKuC3uXH6fg7`)

**GitHub**
- Repo: `chris-guerin/workfiles-`
- Pages: `https://chris-guerin.github.io/workfiles-/`
- Local: `C:\Users\Admin\workfiles-`
- Deploy: `git add . && git commit -m "update" && git push`

**Google Sheets (hypothesis / campaigns)**
- Sheet ID: `1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM`
- Campaigns tab: where 15b writes; human reviews before send
- Mini_Signals tab: now unused (replaced by PG mini_signals table)

**Claude Code**
- Location: `C:\Users\Admin\.local\bin\claude.exe`
- CLAUDE.md primer: `C:\Users\Admin\workfiles-\CLAUDE.md`
- Read on every session start

**Anthropic API**
- n8n credential: use `SIgnal-engine-api` or the Anthropic credential — never inline keys in workflow JSON
- If a key has been exposed in a JSON file, revoke it at console.anthropic.com immediately

---

## 5. The three workflows

### WF-WeeklyNews-PG
**ID:** `gOwTXiGfkZm5vFTO`  
**Trigger:** Sunday 11pm (`0 23 * * 0`)  
**Job:** Ingest news, extract mini signals, write to PG

```
14 RSS feeds
  → Merge All Feeds
  → Detect Companies & Tag
  → Remove Duplicates
  ├── Branch A: Map → Noise filter → Build extraction payload
  │             → Claude Haiku Extract → Parse → Collect
  │             → INSERT into pipeline.mini_signals (PG)
  └── Branch B: HIGH/MEDIUM filter → Build email → Email to Chris
```

**RSS feeds:** Hydrogen, Batteries, DAC/CCUS, EV Charging, Autonomous Vehicles, Electric Trucks, Geothermal/Nuclear, SDV, EU Parliament, EU Commission, EU Official Journal, UK Acts, UK Statutory Instruments, UK Parliament Bills

---

### Signal Pipeline 15a
**ID:** `3yqglVMObKORQ595`  
**Build script:** `n8n/_build-wf-15a.mjs`  
**Trigger:** Monday 6am (`0 6 * * 1`)  
**Job:** Classify signals against all client hypotheses, enrich with ontology horizon data

```
Monday 6am Trigger
  → Prepare Today (sets date)
  → Postgres: Read mini_signals WHERE extracted_at = today
  → Postgres: All Hypotheses (ALL clients — currently Shell only)
  → Build Classification Context (keyword bags per hypothesis)
  → Combine Payload for Claude (batch up to 10 signals)
  → Claude Sonnet: Classify Signals (ACT / WATCH / IGNORE)
  → Parse Classification
  → Match Signals to Hypotheses (keyword overlap)
  → Postgres: Ontology Enrichment (horizon / confidence / trajectory)
  → Build 15a Output (ACT filter, gap flag, output schema)
  → Postgres: INSERT into pipeline.signal_horizon_log
```

**Key rules:**
- Strictly linear — no branching
- Hypothesis query must cover ALL clients, not just Shell
- Signals where ALL hypotheses have ontology_gap = TRUE are dropped
- API key must be n8n credential, never inline

---

### Signal Pipeline 15b
**ID:** Not yet built  
**Trigger:** Monday 6:30am (after 15a)  
**Job:** Score, select, generate campaign emails, write to Campaigns tab

```
Monday 6:30am Trigger
  → Postgres: Read signal_horizon_log WHERE processed_by_15b = FALSE
  → Code: Score and select best signal
      (probability_delta × 40 + horizon_score × 35 + hypothesis_count × 25)
      Horizon scoring: H2 = 1.0, H1 = 0.6, H3 = 0.4
  → Code: Build Claude prompt
  → Claude Sonnet: Generate 3 persona emails
      (executive / strategy / tech — 5-part, under 120 words, no FB name)
  → Code: Parse + build Campaigns row
  → Google Sheets: Append to Campaigns tab
  → Postgres: UPDATE signal_horizon_log SET processed_by_15b = TRUE
```

---

## 6. Database structure

**Schema version:** v10.4 (after migration 016)  
**Target after migration 017:** four named schemas

### pipeline schema
| Table | Purpose | Written by | Read by |
|-------|---------|------------|---------|
| `mini_signals` | Haiku-extracted signals from RSS | WeeklyNews | Signal Pipeline 15a |
| `signal_horizon_log` | Enriched, classified signals | Signal Pipeline 15a | Signal Pipeline 15b, heat map |

### ontology schema
| Table | Purpose |
|-------|---------|
| `technologies` | 16 canonical technology entries |
| `applications` | 15 canonical application domains |
| `technology_application_pairs` | 33 pairs — H1/H2/H3, confidence, trajectory, hard_evidence_count |
| `pair_evidence` | 101 evidence rows (type, strength, citation, URL) |
| `pair_adjacencies` | 91 adjacency edges between pairs |
| `component_pair_links` | Bridge: client catalogue components → ontology pairs |

### catalogue schema
| Table | Purpose |
|-------|---------|
| `companies` | Client companies |
| `initiatives_v2` | Client strategic initiatives (Shell hypotheses live here) |
| `components` | Sub-components of each initiative |
| `component_attributes` | Structured attributes per component |
| `claims_v2` | Evidence claims |
| `initiative_assumptions` | Hypothesis assumptions (empty — hypotheses in initiatives_v2) |

### contacts schema
| Table | Purpose |
|-------|---------|
| (contact tables) | CRM data migrated from Datasette — ~27,000 contacts |

**Rule for fresh Claude:** pipeline = data in flight. ontology = technology knowledge. catalogue = client intelligence. contacts = CRM. public = empty.

---

## 7. The ontology — what it is

The technology ontology classifies technology × application pairs at the **industry level** by horizon. It is the cross-client compounding asset — when BP and Shell both touch the same pair, a signal is assessed once and routed to both.

**13 modifiers** determine effective horizon beyond TRL alone:
- **Primary:** TRL, TTM, Regulatory Window
- **Ecosystem:** Infrastructure Maturity, Participant Density, Government Funding Ecosystem, Business Case Maturity
- **Market:** Market Readiness, Capital Market Appetite
- **Structural:** Supply Chain Readiness, Skills & Workforce
- **Social/Political:** Social Licence, Geopolitical Exposure
- **Integration:** Asset Replacement Cycle, Platform Integration Window

**Greenfield vs brownfield:** same technology can be H1 greenfield, H3 brownfield (e.g. ammonia marine fuel).

**Cross-client overlap:** 7 pairs currently touched by multiple clients. Four pairs touched by Shell, BP, and Equinor simultaneously. Every new client that adds hypotheses will touch existing pairs more often than creating new ones — that is the compounding.

**Clients with ontology coverage:** Shell, BP, Vattenfall, Equinor (used to build the ontology — they have component_pair_links). Shell is the only client with full hypotheses in PG.

---

## 8. Client hypotheses

**Shell:** 9 initiatives in `catalogue.initiatives_v2` (SHELL_001–009). These are what Signal Pipeline 15a classifies against today.

**Other clients:** BP, TotalEnergies, Siemens Energy, TechnipFMC and others need hypotheses built in PG by Claude Code, modelled on the Shell structure. When built they appear in 15a automatically — no workflow change needed.

**Old Google Sheet hypotheses:** 118 rows, 49-column schema. Deprecated. Delete after all clients have PG hypotheses.

**Hypothesis INSERT discipline (Apps Script):** When a new hypothesis is added, the Apps Script checks the technology reference against the ontology. If the technology is not in the ontology, the hypothesis is flagged `ontology_gap = TRUE` and excluded from signal flow until resolved. Install by running `installOntologyTriggers()` in the Apps Script editor.

---

## 9. Intelligence briefs and account plans

**GitHub Pages tools:**
- `account_plans_v7.html` — account plans for Shell, BP, ExxonMobil, TechnipFMC, Siemens Energy, TotalEnergies and others. Generate intelligence per section via Claude API call.
- Intelligence briefs (per-client HTML) — hosted at `chris-guerin.github.io/workfiles-/`
- `energy_ontology_v1.html` — technology ontology browser
- `war_heatmap_v4.html` — geopolitical conflict monitoring

**Planned connection (not yet built):** Account plans and intelligence briefs should pull the relevant company's hypotheses from PG via an Apps Script endpoint and inject them into the Claude API prompt. This ensures briefs reflect the structured hypothesis view rather than generating from scratch each time.

**FutureBridge brand rules (applied to all HTML output):**
- Black (#000), white (#fff), grey (#4B4B55), red (#F84E5D sparingly)
- Circular Std / DM Sans, sentence case, no all-caps, no bold in body
- Sparse layout, high contrast, no decorative elements
- Voice: The Economist / Bloomberg Intelligence — short sentences, no consultant clichés

---

## 10. Email protocol

Five-part structure applied by Signal Pipeline 15b:
1. **Signal** — one sentence, real numbers or named entities
2. **Strategy** — what this company is doing / their posture  
3. **Meaning** — what this signal means for their business
4. **Question** — one pointed commercial question
5. **CTA** — one line, specific next step

Rules: under 120 words. No FutureBridge name in body. No generic openers. Three personas per signal: Executive (board, commercial), Strategy (competitive), Tech (horizon context).

---

## 11. What not to do

- **No Datasette** in any pipeline node. `futurbridge-signals.onrender.com` is deprecated.
- **No Google Sheets as pipeline storage.** Only Campaigns tab (human-facing output) and email alert use Sheets.
- **No branching in Signal Pipelines 15a or 15b.** n8n branching causes execution failures. Use if/else inside Code nodes.
- **No inline API keys** in workflow JSON. Use n8n credentials. If a key is exposed, revoke at console.anthropic.com immediately.
- **No Shell-only filter** in the hypothesis query. Pipeline must cover all clients.
- **No fragmented documentation.** Update this document at end of every session.

---

## 12. Current state (update daily)

**As of 2026-05-07 (post-overnight Path A run):**

| Component | Status |
|-----------|--------|
| WF-WeeklyNews-PG | Rebuilt — Sunday 11pm, Haiku → PG mini_signals |
| Signal Pipeline 15a | Built — Shell-filter removed, API key fixed (commits before 2026-05-07) |
| Signal Pipeline 15b | Built (commit `0682aec`) |
| migration 016 mini_signals | Applied (commit `d326b1f`) |
| migration 017 schema separation | Applied (commit `0792da3`) — pipeline / ontology / catalogue / contacts |
| Apps Script INSERT trigger | Written, not installed |
| Shell hypotheses (PG) | Built — 9 initiatives in `catalogue.initiatives_v2` |
| **BP hypotheses (PG)** | **Built — 3 net-new initiatives from `bp_intelligence_brief__3_.html` (BP-01 M&A, BP-02 upstream pivot, BP-03 H2/CCUS rationalisation). Pre-existing BP_18 blue-H2-leadership ontology anchor retained alongside.** |
| **VW Group hypotheses (PG)** | **Built — 3 group-level initiatives from `vw_intelligence_brief__4_.html` (VW-01 IG Metall closure block, VW-02 ID. SDV revision, VW-03 China share decline)** |
| **Skoda Auto hypotheses (PG)** | **Built — 3 brand-level initiatives from `skoda_intelligence_brief__3_.html` (SKD-01 India platform, SKD-02 affordable EV top-3, SKD-03 Czech manufacturing advantage). New `companies` row created.** |
| **Porsche AG hypotheses (PG)** | **Built — 3 brand-level initiatives from `porsche_intelligence_brief__4_.html` (PAG-01 eFuels carve-out, PAG-02 Taycan premium, PAG-03 motorsport+experiential)** |
| Ontology (energy) | 33 pairs, 16 technologies, v10.3 |
| Ontology (mobility) | NOT STARTED — deferred from overnight run, see open items |
| Account plans v7 | Live — Shell, Siemens Energy, TotalEnergies added |
| Intel briefs + PG hypotheses | Designed, not built |
| Exposed API key (sk-ant-api03-Wip4...) | Revoke at console.anthropic.com if not done |
| Pre-commit credential scan hook | Installed (`.git/hooks/pre-commit`) — scans staged diffs for Bearer tokens, sk-ant keys, AWS IAM, GitHub PAT |

**`catalogue.initiatives_v2` row count by company (post-run):**

| Company | Initiatives | Source |
|---------|-------------|--------|
| Shell | 9 | shell_intelligence_brief__4_.html (SH-01..09) |
| BP plc | 4 | 1 from `017_bp_blue_h2_ontology` + 3 from `P1_BP_hypotheses` |
| Volkswagen Group | 3 | `P2_VWG_hypotheses` |
| Porsche AG | 3 | `P2_VWG_hypotheses` |
| Skoda Auto | 3 | `P2_VWG_hypotheses` |
| Equinor ASA | 2 | from earlier ontology population scripts |
| Vattenfall AB | 1 | from earlier ontology population scripts |
| **Total live in 15a** | **25** | All seven companies pass the 15a hypothesis query (no Shell filter). |

Total components added to `catalogue.components` in this run: 49.
Total claims_v2 rows added: 46. Component attribute rows zero pending after run (v2 discipline holds: every populated attribute carries source_citation; every other attribute resolved to `not_in_source` with brief-anchored reason).

---

## 13. Open items (update daily)

| Priority | Item |
|----------|------|
| URGENT | Revoke exposed API key (sk-ant-api03-Wip4...) at console.anthropic.com if not done |
| Next | Apps Script INSERT trigger — install (run `installOntologyTriggers()` in Apps Script editor) |
| Next | **Generate intelligence briefs for the 6 deferred energy clients** (TEN, TFMC, XOM, ENI, CNP, SLB) — this is the precondition for hypothesis population. Path A overnight skipped these because no brief existed in repo. |
| Next | **MAN_001 fleet BEV charging hypothesis** — generate MAN brief first, then populate (was on original VWG brief, dropped from Path A) |
| Next | **Mobility ontology Phase 3** — populate VWG-anchored mobility ontology pairs (BEV platform × passenger EV, SDV × passenger OEM, ADAS L2+ × safety, SiC × drivetrain, V2G × grid services). Methodology v1.3 requires ≥2 evidence URLs per pair × 10-15 pairs minimum. Anchors on the new SSP_ZONAL_ARCHITECTURE_AND_OTA, MEB_PLATFORM_BOM_COST_REDUCTION, ELECTRIC_RACING_POWERTRAIN_AND_RECOVERY components from Path A. |
| Next | Confirm signal-engine API Bearer token state in `.claude/settings.local.json` and decide whether to repoint the new BP+VWG population scripts from direct PG to API path (matches Shell pattern exactly). |
| Next | Intel briefs HTML — connect to PG hypotheses via Apps Script endpoint (each per-company brief should pull its hypotheses from `catalogue.initiatives_v2` and inject into the Claude API prompt) |
| Next | Old Google Sheet hypotheses — delete after PG hypotheses complete for all in-scope clients |
| Future | Signal Pipeline 15b → 15c (contact matching, YAMM send) |
| Future | Quarterly heat map workflow |
| Future | Audi AG, BMW Group, JLR, Mercedes-Benz, Daimler Truck, Continental, Bosch, Infineon, Bridgestone, Michelin, Datwyler, Mann+Hummel — populate brand-level hypotheses once briefs exist |

---

## 14. Daily update discipline

At the end of every working session:

1. Update sections 12 (Current state) and 13 (Open items)
2. If any infrastructure changed — URLs, IDs, credentials, schema — update section 4 or 6
3. If a new workflow was built — add or update section 5
4. Commit: `git add docs/MASTER.md && git commit -m "MASTER.md — daily update YYYY-MM-DD" && git push`
5. Re-upload to the River Claude Project (replace the old version)

This document is the single source of truth. If something is not in here, it does not exist for the next session.
