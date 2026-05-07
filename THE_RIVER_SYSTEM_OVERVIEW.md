# The River — System Overview
**Version:** 2.0  
**Last updated:** 2026-05-05  
**Owner:** Chris Guerin, FutureBridge Advisory  
**Purpose:** This document is the authoritative reference for the Signal Engine system. It lives in the Claude Project "the river" so any Claude instance — on any device — can orient itself without needing prior conversation history.

---

## What this system is

The Signal Engine is an automated intelligence-to-outreach pipeline. It monitors energy and mobility news, classifies signals against structured client hypotheses, enriches each signal with technology horizon context from an ontology layer, and generates persona-differentiated outreach emails for FutureBridge client accounts.

It is not a dashboard. It is a decision-routing system. Every component produces structured output that feeds the next. The end state is a campaign row in a Google Sheet that a human reviews before sending.

---

## Infrastructure

| Component | Platform | URL / ID |
|-----------|----------|----------|
| n8n (workflow engine) | Railway | `n8n-production-86279.up.railway.app` |
| PostgreSQL database | Railway | `switchback.proxy.rlwy.net:43986/railway` |
| n8n PG credential name | n8n | `hypothesis-db Railway PG` (id: `rgPwSKuC3uXH6fg7`) |
| GitHub repo | GitHub | `chris-guerin/workfiles-` |
| GitHub Pages | GitHub Pages | `chris-guerin.github.io/workfiles-/` |
| Local repo | Windows | `C:\Users\Admin\workfiles-` |
| Claude Code | Windows | `C:\Users\Admin\.local\bin\claude.exe` |
| Google Sheet (hypothesis / campaigns) | Google Sheets | `1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM` |

**Deploy to GitHub Pages:**
```
cd C:\Users\Admin\workfiles-
git add . && git commit -m "update" && git push
```

**n8n sync:**
```
node n8n/sync.js pull wf15    # pull Signal Pipeline 15a
node n8n/sync.js push         # push after changes
```

---

## The three workflows

### 1. WF-WeeklyNews-PG
**Workflow ID:** `gOwTXiGfkZm5vFTO`  
**Trigger:** Sunday 11pm (`0 23 * * 0`)  
**Purpose:** Ingests raw news, runs Haiku extraction, writes mini signals to PG.

**Flow:**
14 RSS feeds (Hydrogen, Batteries, DAC/CCUS, EV Charging, Autonomous, Electric Trucks, Geothermal/Nuclear, SDV, EU Parliament, EU Commission, EU Official Journal, UK Acts, UK Statutory Instruments, UK Parliament Bills) → Merge All Feeds → Detect Companies & Tag → Remove Duplicates → **two parallel branches:**

- **Branch A (Haiku pipeline):** Map to Canonical Schema → Noise Blocklist + Deduplicate → Build Extraction Payload → Claude Haiku Extract → Parse + Validate Mini-Signal → Collect Mini-Signals → **INSERT into `mini_signals` PG table**
- **Branch B (Email alert):** HIGH and MEDIUM Priority filter → Build Alert Email → Email Alert to Chris

**Output:** `mini_signals` table in PG. Signal Pipeline 15a reads from here Monday 6am.

---

### 2. Signal Pipeline 15a
**Workflow ID:** `3yqglVMObKORQ595`  
**Build script:** `n8n/_build-wf-15a.mjs`  
**Trigger:** Monday 6am (`0 6 * * 1`)  
**Purpose:** Classifies mini signals against client hypotheses, enriches with ontology horizon data, writes enriched rows to PG.

**Flow (12 nodes, linear):**
1. Monday 6am Trigger
2. Prepare Today — sets today's date
3. Postgres: Read mini_signals — `SELECT * FROM mini_signals WHERE extracted_at = today`
4. Postgres: All Hypotheses — queries ALL clients' hypotheses from `initiatives_v2` (currently Shell only; BP, TotalEnergies etc. added as their hypotheses are built)
5. Build Classification Context — aggregates hypotheses into keyword bags
6. Combine Payload for Claude — batches signals, builds classification prompt
7. Claude — Classify Signals — HTTP to Anthropic API; returns ACT/WATCH/IGNORE + probability_delta
8. Parse Classification — flattens batch responses
9. Match Signals to Hypotheses — keyword overlap matching (≥2 tokens OR 1 high-weight domain token)
10. Postgres: Ontology Enrichment — pulls horizon/confidence/trajectory for matched pairs
11. Build 15a Output — applies ACT filter, assembles output schema, flags ontology gaps
12. Postgres: Insert into signal_horizon_log — writes enriched rows

**Output schema written to `signal_horizon_log`:**
```
signal_id, signal_title, signal_summary, signal_date, source_url,
matched_hypothesis_ids[], matched_hypothesis_labels[],
horizon_classifications (JSONB), overall_classification,
probability_delta, ontology_gap, processed_by_15b
```

**Key rules:**
- Pipeline is strictly linear. No branching — branching causes n8n execution failures.
- Hypothesis query must NOT filter to one client. Currently returns Shell only because Shell is the only client with hypotheses in PG. When BP, TotalEnergies etc. are built, they appear automatically.
- Signals where ALL matched hypotheses have `ontology_gap = TRUE` are dropped.

---

### 3. Signal Pipeline 15b
**Status:** NOT YET BUILT  
**Trigger:** Monday 6:30am (after 15a completes)  
**Purpose:** Reads unprocessed rows from `signal_horizon_log`, scores and selects best signal, generates three persona emails via Claude, writes to Campaigns tab, marks signal processed.

**Planned flow:**
1. Monday 6:30am Trigger
2. Postgres: Read unprocessed — `SELECT * FROM signal_horizon_log WHERE processed_by_15b = FALSE AND overall_classification = 'ACT'`
3. Code: Score and select best signal (composite score: probability_delta × 40 + horizon_score × 35 + hypothesis_count × 25, with ontology_gap penalty)
4. Code: Build Claude prompt
5. Claude: Generate campaign emails — three personas (executive, strategy, tech), 5-part structure, under 120 words each, no FutureBridge name in body
6. Code: Parse Claude response + build Campaigns row
7. Google Sheets: Append to Campaigns tab
8. Postgres: Mark processed (`UPDATE signal_horizon_log SET processed_by_15b = TRUE WHERE id = $1`)

**Horizon scoring:** H2 = 1.0 (most actionable), H1 = 0.6, H3 = 0.4

---

## Database schema (PostgreSQL on Railway)
**Current schema version:** v10.5 (migration 017 — four-schema separation)

The database is organised into **four named schemas** plus an empty `public`. A fresh Claude instance can understand the system by reading the schema names: **pipeline** = data in flight, **ontology** = technology knowledge, **catalogue** = client intelligence, **contacts** = CRM.

`search_path = pipeline, ontology, catalogue, contacts, public` is set at database + role level by migration 017, so every existing query continues to resolve unprefixed names.

### `pipeline` schema — data in flight (18 tables)
| Table | Purpose |
|---|---|
| `news` | Raw news ingest (1958 rows) |
| `mini_signals` | Haiku extraction output (migration 016, written by WeeklyNews, read by 15a) |
| `mini_signals_v3` | Soft-data layer signal store (legacy from migrations 008–011) |
| `signal_horizon_log` | 15a → 15b handoff (migration 015) |
| `signal_candidate_matches` | Signal-to-component candidate matches |
| `signal_claim_impacts` | Per-claim impact assessments |
| `signal_soft_impacts` | Soft-data signal impacts |
| `generated_signals` | Routed signals (9 rows) |
| `generated_emails` | Final email outputs (27 rows) |
| `attribute_observations` + 5 quarterly partitions | Time-series observations from signals |
| `catalogue_names` | Denormalised name index for signal matching |
| `recommendations` | Pipeline output (currently empty) |
| `schema_migrations` | Migration version tracker (meta — flagged) |

### `ontology` schema — technology knowledge (7 tables)
| Table | Contents |
|---|---|
| `technologies` | 16 canonical technologies |
| `applications` | 15 canonical applications |
| `technology_application_pairs` | 33 pairs with horizon (H1/H2/H3), confidence, trajectory, hard_evidence_count |
| `pair_evidence` | 104 evidence rows with citations and URLs |
| `pair_adjacencies` | 91 adjacency edges, 41 flagged `is_cross_client_edge=TRUE` |
| `component_pair_links` | 91 links connecting client components to ontology pairs (bridge table) |
| `tech_functions` | Physical-principle vocabulary (7 rows) |

### `catalogue` schema — client intelligence (24 tables)
| Table | Purpose |
|---|---|
| `companies` | Client + benchmark companies (1004 rows) |
| `initiatives_v2` | Client strategic initiatives — Shell H3 hypotheses live here |
| `components` | Sub-components of each initiative |
| `component_attributes` | Structured attributes per component (528 rows) |
| `attribute_definitions` | Vocabulary for component_attributes (61 rows) |
| `claims_v2` | Evidence claims per component (16 rows) |
| `component_dependencies` | Cross-component dependency edges |
| `initiative_assumptions` | Hypothesis assumptions (currently empty — Shell hypotheses live in initiatives_v2) |
| `strategic_tensions` + 3 link/evidence tables | Strategic-tension framework |
| `reframings` + `reframing_evidence` | Industry-reframe framework |
| Legacy v1: `initiatives` (9), `entities` (35), `links` (38), `signals` (0) | Pre-v2 entity model — kept for history |
| Legacy hypothesis layer: `hypothesis_register` (118), `hypothesis_observable`, `hypothesis_observable_event`, `confidence_band_history`, `heat_map_aggregates`, `competitive_events` | Pre-ontology observable-layer system — kept for history |

### `contacts` schema — CRM (2 tables)
| Table | Purpose |
|---|---|
| `contacts` | 15,965 person rows imported from Datasette CRM |
| `contact_initiative_interests` | Per-contact initiative interest links (27 rows) |

### `public` schema — empty by design

**Cross-client overlap:** 7 pairs touched by multiple clients. Four pairs touched by 3 clients simultaneously (pre-combustion capture pairs and PEM electrolysis). This is the compounding asset.

---

## Client hypotheses

**Shell only** has hypotheses properly built in PG (via `initiatives_v2`, 9 initiative rows, SHELL_001–SHELL_009). These are what Signal Pipeline 15a currently classifies against.

**Planned:** BP, TotalEnergies, Siemens Energy and other clients from the original Google Sheet hypothesis repository will have PG hypotheses built by Claude Code, modelled on the Shell structure. When built, they appear in 15a's hypothesis query automatically.

**Old Google Sheet hypotheses** (118 rows, 49-column schema, sheet ID above): deprecated. Will be deleted once new PG hypotheses are built for all clients.

---

## Ontology — what it is and why

The technology ontology classifies technology × application pairs at the **industry level** (not client level) by horizon (H1/H2/H3). When a signal hits a client hypothesis, 15a looks up the ontology to determine which technology horizon is most likely impacted. This context travels with the signal through to 15b's email generation.

**13 modifiers** determine effective horizon (vs native TRL-only classification):
- Primary: TRL, TTM, Regulatory Window
- Ecosystem: Infrastructure Maturity, Participant Density, Government Funding, Business Case Maturity
- Market: Market Readiness, Capital Market Appetite
- Structural: Supply Chain Readiness, Skills & Workforce
- Social/Political: Social Licence, Geopolitical Exposure
- Integration: Asset Replacement Cycle, Platform Integration Window

**Greenfield vs brownfield:** same technology can be H1 greenfield and H3 brownfield simultaneously (e.g. ammonia marine fuel for newbuilds vs retrofit).

**Adjacency types:** same_technology_different_application, same_application_different_technology, predecessor_successor, substitute, complement, subscale_to_scale.

**Methodology:** `/docs/SCHEMA_ONTOLOGY.md` and `/docs/methodology/ontology_population_procedure.md` v1.2

---

## Apps Script — hypothesis INSERT trigger
**Status:** Written, not yet installed  
**File to update:** `HypothesisRepository.gs` in the Apps Script project attached to the hypothesis Google Sheet  
**What it does:** When a new hypothesis row is inserted, checks the technology reference against a local `TECHNOLOGY_REGISTRY` named range (refreshed weekly from PG). Flags `ontology_gap = TRUE` if the technology is not in the ontology. Hypotheses with `ontology_gap = TRUE` are skipped by Signal Pipeline 15a.  
**Install:** Run `installOntologyTriggers()` once in Apps Script editor.

---

## Future: Heat map and quarterly scan
**Status:** Designed, not built. Document at `docs/ontology_heatmap_refresh_design.md`  
**What it will do:** Quarterly structured review of all ontology pairs — horizon reclassification, art of the possible extension, WNTBT falsification, technology deprecation. Produces a client-facing heat map showing which technology pairs each client touches, with trajectory.  
**Data source:** `signal_horizon_log` accumulates signal × hypothesis × horizon matches over time. This is the raw material for the heat map.  
**Build trigger:** When ontology reaches 50+ pairs across 5+ clients.

---

## Key file locations

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Claude Code primer — read at every session start |
| `docs/SCHEMA_ONTOLOGY.md` | Ontology schema specification |
| `docs/methodology/ontology_population_procedure.md` | Binding procedure for populating ontology (v1.2) |
| `docs/ontology_heatmap_refresh_design.md` | Future quarterly scan design |
| `docs/draft_review/ontology_ccus_worked_example.md` | CCUS worked example |
| `db/migrations/` | All PG migrations (012–016) |
| `db/population/` | Ontology population scripts |
| `n8n/_build-wf-15a.mjs` | 15a workflow build script |
| `n8n/code-nodes/wf15/` | Exploded code nodes for git tracking |

---

## Open items (as of 2026-05-05)

| Item | Status |
|------|--------|
| 15a: remove Shell filter from hypothesis query | Prompt written, not run |
| 15a: fix inline API key to use n8n credential | Prompt written, not run |
| Signal Pipeline 15b | Prompt written, not built |
| Apps Script INSERT trigger | Written, not installed |
| Revoke exposed API key (sk-ant-api03-Wip4...) | **URGENT** — key was in two workflow JSON files |
| New client hypotheses (BP, TotalEnergies, Siemens Energy) | Not started |
| Old Google Sheet hypotheses deletion | After new PG hypotheses built |

---

## Email protocol (FutureBridge outreach)

Five-part structure, applied by Signal Pipeline 15b:
1. **Signal** — one sentence, real numbers or named entities
2. **Strategy** — what this company is doing / their posture
3. **Meaning** — what this signal means for their business
4. **Question** — one pointed commercial question
5. **CTA** — one line, specific next step

Rules: under 120 words, no FutureBridge name in body, no generic openers, write like Bloomberg Intelligence not consulting copy.

Three personas per signal: Executive (board-level, commercial), Strategy (competitive framing), Tech (technology horizon context).

---

## What not to do

- Do not use Datasette (futurbridge-signals.onrender.com) in any pipeline node. It is deprecated.
- Do not use Google Sheets as intermediate pipeline storage. Only intentional human-facing outputs (Campaigns tab, email alert) use Sheets.
- Do not add branching to Signal Pipeline 15a or 15b. n8n branching causes execution failures in this instance. Use if/else inside Code nodes instead.
- Do not hardcode API keys in workflow nodes. Use n8n credentials.
- Do not filter the hypothesis query to a single client. The pipeline should match against all clients with hypotheses in PG.
