# Signal Engine — Architecture and Product Reference

**Version 5.7 · 30 April 2026 evening · Supersedes v5.6 (30 April 2026 morning) and all prior. v5.5 reserved for the queued methodology + four-layer-model integration; not yet committed.**

FutureBridge Advisory · Chris Guerin · Confidential

<!-- LAST VERIFIED: 2026-04-30 evening BST · By: Chris (chat) + Claude (chat) -->
<!-- Auto-updateable sections are marked AUTO. Human-curated sections are marked HUMAN. -->
<!-- v5.7 changes: Major architectural pivot from matrix model (observable_layer) to initiative model (initiatives + entities + links + signals). Five-document v1 specification set committed to /docs/ (INITIATIVE_MODEL.md, INITIATIVE_METHODOLOGY.md, SIGNAL_PIPELINE.md, N8N_IMPLEMENTATION.md, WORKED_EXAMPLE_SHELL_H3.md, total 2,746 lines). Legacy documentation moved to /docs/legacy/ with superseded headers. SHELL_H3_PORTFOLIO_v3.html visualisation prototype committed (12 initiatives, 36 entities, 39 links, executing model). CLAUDE.md updated to point at v1 doc set as canonical. R26 added to Section 19 (end-of-session git hygiene). Build N (initiative model migration phases 1-5) and Build O (rainy-Tuesday test) added to roadmap. Builds L and M retired (superseded by initiative model). Schema state: matrix-model tables (hypothesis_observable, hypothesis_observable_event, confidence_band_history) retained but deprecated; mv1_* tables added via migration 004 (pending) bumping to v6.0. -->
<!-- v5.6 changes: Migration 003 (observable layer) committed to Railway hypothesis-db. Hypothesis register schema bumped from v5.0 to v5.6 (skipping v5.5). Three column additions to hypothesis_register: appraisal_cadence, last_appraisal_at, current_confidence_band. Three new tables: hypothesis_observable, hypothesis_observable_event, confidence_band_history. View hypothesis_matrix_summary. 21 named CHECK constraints. All 118 rows defaulted appraisal_cadence='weekly' and current_confidence_band=0.500. -->
<!-- v5.4 changes: Build E phase 2. Postgres hypothesis-db PG 18.3 provisioned, v5 DDL deployed, 118 rows persisted live-only (25 decision-layer cols NULL pending clean CSV re-export). window_closes_at TEXT, window_status_enum CHECK dropped. -->
<!-- v5.3 changes: Schema bumped v4.0 → v5.0 (76 cols, three sections). Section 8 rewritten. Build E updated. R14 updated. R16 expanded for geography. Section 3.2 geography note. -->
<!-- v5.2 changes: added Part 5 — Operating Rules (Section 19) with 25 enforceable rules R1–R25. -->
<!-- v5.1 changes: sharpened ACT definition (3.5), added Trajectory and gap (3.7), Cross-domain adjacency (3.8), Build L and Build M, glossary additions. -->

---

## How this document works

This is the single canonical reference for the Signal Engine. It is the source of truth for what the system is, why it exists, how it works, who uses it, what it costs, how it sells, what it depends on, what is broken, and what comes next. It also contains the binding operating rules that govern how the system and its operators behave.

It is written so that any reader, internal or external, can understand the system from this document alone. New colleagues, partners, investors, acquirers, prospective clients in diligence, or Chris himself returning after a week away. It is also written so that any AI operating on the Signal Engine, including Claude Code in a session and the classifier prompts inside WF-15, treats Part 5 as binding and follows it without exception.

There is no other architecture document. v1 through v5.6 are superseded. The v1 documentation set in `/docs/` is canonical for the initiative model architecture (post 30 April 2026 afternoon); ARCHITECTURE.md remains canonical for repo-level state and operating rules.

The document has six parts.

Part one explains what the Signal Engine is. The problem it solves, the methodology underneath it, how it operates in practice, and who uses it. This is doctrine.

Part two describes how it is built. The technical architecture, the hypothesis register, the pipeline, the infrastructure, and the local tooling. This is description of the current system.

Part three covers the commercial model. The engagement structure, the pricing logic, the competitive position, and the go-to-market. This is positioning.

Part four sets out where it is going. The strategic position, the roadmap, the open items, and the risks. This is intent.

Part five is the operating rules. Twenty-six rules, R1 through R26, that govern signal classification, trajectory computation, adjacency handling, output contracts, hypothesis register integrity, communication, and operational discipline. **Anyone or anything operating on the Signal Engine MUST follow these rules. Doctrine in Parts 1–4 explains why. Rules in Part 5 enforce.**

Part six is reference material. File inventory, recovery procedures, glossary, and a note on how this document maintains itself.

Sections marked AUTO are facts about the live system that should be regenerated by `update-architecture.js` when that build is complete. Sections marked HUMAN are judgement and intent, written by Chris and updated by hand. Sections marked RULE are binding and changes require explicit version bump and review.

When doctrine and rules appear to conflict, rules govern. If a rule needs to change because doctrine has evolved, change the rule explicitly. Do not interpret around it.

---

## Contents

**Part one — what it is**
1. Executive summary
2. The problem
3. The methodology
4. How it works in practice
5. Who uses it and what they do with it

**Part two — how it is built**
6. System state
7. Architecture
8. The hypothesis register
9. The pipeline
10. Infrastructure
11. Local tooling and developer environment

**Part three — how it sells**
12. The commercial model
13. Competitive position
14. Go to market

**Part four — where it is going**
15. Strategic position
16. Roadmap and next builds
17. Open items queue
18. Risks and dependencies

**Part five — operating rules (binding)**
19. Operating rules, R1 through R26

**Part six — reference**
20. Files
21. Recovery
22. Glossary
23. Document maintenance

**Appendix**
A. Gap analysis vs McKinsey-equivalent product documentation

---

# Part one — what it is

## 01. Executive summary

The Signal Engine is a decision engine disguised as a signal engine. It exists to answer one question, repeatedly, faster than anyone else: what needs to be true for this strategic bet to work, and is it becoming true fast enough.

Most market intelligence is rear-view. It tells clients what has happened and produces reports about it. The Signal Engine works the opposite way. It starts from a structured set of forward-looking hypotheses about how a market, technology, regulation, or competitive landscape will evolve. Each hypothesis carries a stack of underlying conditions, expressed as system metrics with explicit thresholds and required slopes. As real-world signals move those metrics, the system computes the trajectory and the gap between observed and required progress. Hypotheses progress through phases until they reach a decision window. The system surfaces the window, assembles the evidence, names the action it enables, and indicates how long it is likely to remain open.

The methodology is hypothesis-driven intelligence, expressed in the working language of "what needs to be true." The structural moat is cross-domain adjacency: the system tracks metric movement in industries upstream of the client's industry and surfaces the transfer before it appears in the client's own sector signals. The technology is the production system that runs both at scale, daily, for multiple clients in parallel.

**Architectural note (30 April 2026 afternoon).** The system underwent a major architectural pivot from the matrix model (hypothesis with metric stack and observable layer) to the initiative model (initiative composed of entities and links, with deterministic behaviour rule converting signals to confidence movement). The v1 documentation set in `/docs/` is the canonical specification of the initiative model. The methodology principles described below remain intact; the data shape that operationalises them is tighter. See Section 16 (Build N) for the migration sequence.

The Signal Engine is currently in late-stage build, crossing into operate mode in late April 2026. It runs against 118 active hypotheses across personal bets, industry structural calls, sector hypotheses, and 48 client account hypotheses. It processes roughly 2,200 signals per day from RSS, Datasette, and other ingestion paths, narrowing them through a pre-score filter and Claude-driven classification to a small number of action-grade signals per day. Those signals trigger persona-shaped outreach to a contact database of 27,473 named individuals across the energy, mobility, chemicals, life sciences, food, and manufacturing sectors.

The commercial model sells the methodology and the moat, not the platform. Clients buy structured engagements that use the Signal Engine to validate their hypotheses, compute the trajectory of their underlying conditions, surface the cross-domain signals that competitors miss, and close the gaps with named actions. The technology is the proof of capability; the methodology and moat are the product.

---

## 02. The problem

<!-- HUMAN -->

Senior executives in capital-intensive sectors face a structural problem with the intelligence available to them.

The market produces three categories of intelligence. None solve the actual problem.

The first category is news. Reuters, the FT, sector trade press, RSS feeds, internal news scrapers. The volume is overwhelming, the relevance ratio is poor, and by the time something becomes news the window to act on it has often closed.

The second category is research. Wood Mackenzie, IHS Markit, Gartner, BCG sector reports. Authoritative, well-resourced, and almost always backward-looking. Research tells a leadership team what has happened. By the time a research firm has assembled and published a view, the underlying conditions have already moved.

The third category is consulting. McKinsey, Bain, BCG, the Big Four, sector specialists. Deep, expensive, and project-shaped. Consulting answers a specific question over a specific period and then disengages. Between engagements, the client has nothing.

What is missing is a continuous, forward-looking, decision-oriented intelligence layer. Something that watches the conditions a leadership team has bet on, signals when those conditions move, and times the moments when a decision becomes possible or necessary.

The Signal Engine fills that gap. It is not a faster news feed, a fresher research subscription, or a cheaper consulting engagement. It is a different category. It is the operating layer between strategy formation and decision execution.

The clients who feel this gap most acutely are senior strategy, R&D, business development, and innovation leaders in energy, mobility, chemicals, life sciences, food and nutrition, and manufacturing. Their bets are large, their decision windows are narrow, their boards expect conviction, and their existing intelligence stack does not give them the timely view they need. They make decisions on stale information or on instinct, and they know it.

---

## 03. The methodology

<!-- HUMAN -->

The methodology is hypothesis-driven intelligence. It has six components.

**Architectural note.** The methodology principles described in 3.1 through 3.8 below are unchanged by the 30 April 2026 architectural pivot. The matrix-model framing (hypothesis with metric stack) is one expression of the methodology; the initiative model framing (initiative with entity-and-link dependency graph) is a tighter expression of the same principles. See `/docs/INITIATIVE_MODEL.md` and `/docs/INITIATIVE_METHODOLOGY.md` for the canonical current architecture.

### 3.1 The hypothesis as the unit of analysis

A hypothesis in this system is a forward-looking business outcome bet. It has four properties.

It is falsifiable. There is a set of observable conditions under which the hypothesis would be proven wrong.

It is directional. It states the way the world is moving, with a defined endpoint.

It is business-linked. There is a profit and loss consequence attached. Someone wins or loses if it proves true or false.

It is time-bound. There is a window in which the hypothesis must resolve, anchored to the slowest underlying metric.

A worked example. "Green hydrogen reaches three dollars per kilogram in at least one geography by 2027." Falsifiable. Directional. Linked to capital allocation decisions across electrolyser manufacturers, hydrogen offtakers, and adjacent infrastructure investors. Time-bound to 2027.

This unit replaces the standard unit of consulting analysis (the question) and the standard unit of research (the report). The hypothesis is a position. It can be defended, attacked, or revised. It cannot be neutral.

In the initiative model, the hypothesis is expressed as an initiative — a specific bet a company has committed to that depends on conditions in the world holding or changing in particular ways. See `/docs/INITIATIVE_MODEL.md` section 2.

### 3.2 The system metrics underneath each hypothesis

Each hypothesis is supported by three to five system metrics. These are the underlying observables whose movement determines whether the hypothesis remains credible.

System metrics fall into five buckets, drawn from the structural drivers of any market outcome.

Technology. The performance, cost, and maturity of the technical underpinnings.

Cost and economics. The unit economics, capital intensity, and learning curve trajectory.

Regulation. The policy framework, incentive structures, and compliance constraints.

Ecosystem. The supply chains, partners, standards, and adjacent industries on which the outcome depends.

Competitive. The positions, commitments, and moves of the relevant players.

Each metric carries four properties: current state (where it is now), threshold (where it needs to be for the hypothesis to be proven), rate of change (how fast it is moving), and mechanism (why it moves the way it does). The threshold is what is meant by "what needs to be true." WNTBT is the working language of every metric.

Geography is a cross-cutting modifier, not a sixth bucket. It slices every metric in every bucket — a technology metric in the United States is not the same as the same technology metric in the European Union. Geography therefore appears as a slicing dimension on metrics rather than as a peer of the five canonical buckets.

In the initiative model, the equivalent of system metrics is entities (technologies, market conditions, regulations, ecosystem actors) connected to initiatives by links. Each link carries a claim with explicit threshold, time, and context. See `/docs/INITIATIVE_MODEL.md` section 3.

### 3.3 What needs to be true

The acronym is WNTBT. It is never abbreviated in client-facing material. It is always written in full.

What needs to be true is the spine of every client engagement. It forces a leadership team to articulate, explicitly, the underlying technical, market, regulatory, ecosystem, and competitive conditions that would have to be observed for their strategic bet to prove out, and the conditions that would falsify it.

Most strategy work avoids this articulation. It substitutes vision statements, scenario planning, or qualitative judgement. The result is unfalsifiable strategy, which cannot be tested by evidence and therefore cannot be improved by evidence. WNTBT closes that loop.

In practice, every hypothesis in the system carries an explicit list of WNTBT conditions, mapped to system metrics, with named thresholds. A signal that materially moves a metric toward or away from its threshold is the only thing the system treats as relevant.

### 3.4 The phases of a hypothesis

Hypotheses do not mature in a single event. They move through phases, each with a different operating posture.

Divergent phase. Multiple futures remain plausible. The evidence is thin or contradictory. The action posture is to watch broadly, capture weak signals, and refine the metric stack.

Converging phase. Evidence accumulates from independent angles. Possibilities narrow. Some metrics move toward thresholds; others remain unresolved.

Trigger-ready phase. Enough metrics have crossed thresholds that a decision becomes possible.

Resolved phase. The hypothesis settles. Three sub-states are possible. True (the bet has proven out and the action has been taken or missed). False (the bet has been falsified and capital should be redirected). Displaced (the original hypothesis was directionally wrong but the surrounding evidence reveals a sharper hypothesis underneath).

In the initiative model, the equivalent of phase is the entity state (holding/weakening/broken/ambiguous) plus the initiative's confidence band, with state transitions governed by the behaviour rule and signal pipeline. See `/docs/INITIATIVE_MODEL.md` section 4 and `/docs/SIGNAL_PIPELINE.md` section 3.

### 3.5 Signals as movement, not events

A piece of news is not a signal. A signal is a piece of information that moves one or more system metrics for one or more hypotheses. Everything else is noise.

This definition inverts the standard filtering problem. Instead of asking "is this news interesting," the system asks "does this news change the probability that a specific business outcome is true." The hypothesis register is the filter. Without the register, the system is just RSS.

Signals combine multiplicatively, not additively. One mini-signal moving one metric is weak evidence on its own. Three mini-signals moving three different metrics in the same direction is exponentially stronger evidence, because the conditions for the bet are converging from independent angles.

The classification produces three states for each signal. ACT means the daily multi-metric trajectory calculation has produced a material shift in the probability that a hypothesis resolves to its tested outcome. MONITOR means the signal touches a hypothesis and contributes to the metric stack but does not, by itself or in combination with the day's other signals, materially shift decision probability. IGNORE means the signal does not move any hypothesis and is discarded.

Enforcement: rules R1 to R4 in Section 19 govern signal classification. The classifier prompts and the output validators MUST implement them.

In the initiative model, signal processing is reorganised as the six-step pipeline per `/docs/SIGNAL_PIPELINE.md`: ingestion, triage, entity routing, claim assessment, state determination, model application. The substantive change is that signals route to specific entities and update specific link claims, rather than being scored against the whole register. The behaviour rule executes deterministically once assessment lands.

### 3.6 Decision windows

The output of the methodology is not a report. It is a set of timed decision windows.

A decision window is a moment in which a client can act on a hypothesis with confidence proportional to the evidence available. Commit capital. Sign a partnership. Commission a study. Reposition. Walk away.

Each window has three properties. The action it enables (specific, named). The evidence that justifies it (the signals and metric movements that opened the window). The time horizon over which it is likely to remain open (anchored to the slowest underlying metric or the next major external event).

The Signal Engine surfaces these windows the moment they open, assembles the evidence underneath, names the action they enable, and indicates how long they are likely to remain open. The client decides. The system informs and advises. It does not replace judgement.

Most consulting tells a client what they should have done. This methodology tells them what they can still do, and how long they have to do it.

### 3.7 Trajectory and gap

A hypothesis with metrics, thresholds, and signals is not yet a methodology. Without a way to compute whether the metrics are moving fast enough, "phase" is a descriptive label rather than a computed state. The trajectory math is what turns descriptive into prescriptive.

For each metric on each hypothesis, the system maintains four values. Required slope is the rate at which the metric must move from its current state to reach threshold by the hypothesis time horizon. Observed slope is the rate at which the metric is actually moving, derived from signal history. Gap is required minus observed. Time-to-miss is the projected date at which the metric will fail to reach threshold if the observed slope continues unchanged.

Negative gap means the metric is on track or ahead. Positive gap means the metric is behind, and time-to-miss is the consequence.

The trajectory layer is the sharpest output the system produces. It is the difference between "this is moving" and "this is moving fast enough."

In the initiative model, the trajectory equivalent is the deterministic behaviour rule per `/docs/INITIATIVE_MODEL.md` section 4: Δconfidence = base × criticality_weight × impact_weight × direction. Each link carries a claim with explicit threshold and time bound; entity state plus signal flow plus the rule produce computed confidence movement per initiative. The matrix-model trajectory math (required slope, observed slope, gap, time-to-miss) is superseded by this approach. Build L (legacy trajectory layer) is therefore retired.

Enforcement: rules R5 to R7 in Section 19 govern trajectory and phase.

### 3.8 Cross-domain adjacency

The Signal Engine's distinctive edge is not the hypothesis register, the pipeline, or the classifier. Each of those could be reproduced by a competitor with sufficient time and capital. The distinctive edge is cross-domain adjacency.

Most sector intelligence stays inside its sector. Hydrogen analysts read hydrogen news. Battery analysts read battery news. The signals that matter most arrive at the boundaries between domains, where a metric movement in one industry foreshadows a metric movement in another industry six to eighteen months later.

These transfers happen because the underlying physics, chemistry, and economics are shared across nominally separate industries. Most market intelligence is organised by sector, which structurally prevents the firm tracking it from spotting the transfer until it appears in the destination sector.

The Signal Engine inverts this by design. Hypotheses are tagged by primary domain (the sector in which they resolve commercially) and by adjacent domains (the upstream sectors whose metric movements forecast the resolution). Signals are tagged by domain of origin.

This is the firm's structural moat. A sector specialist competitor cannot replicate it without abandoning the sector specialism that defines them.

In the initiative model, adjacency operates at the entity layer: the same entity (e.g. PEM_ELECTROLYSIS, EU_HYDROGEN_BACKBONE) is referenced by initiatives across multiple companies and sectors. A signal hitting that entity propagates to all linked initiatives. Cross-domain transfer becomes a query against the entity catalogue rather than a separate workflow. Build M (legacy adjacency tagging and transfer log) is therefore retired in favour of the entity-catalogue mechanism.

Enforcement: rules R8 to R10 in Section 19 govern adjacency.

---

## 04. How it works in practice

<!-- HUMAN -->

The methodology runs on a daily cycle.

### 4.1 The daily loop

Every weekday at 06:00 UTC, the system wakes. It fetches the current state of all 118 hypotheses from the master register. It pulls the latest signals from RSS feeds, Datasette ingestion, and Apps Script bridges. It applies a pre-score filter that removes obvious noise without filtering out weak industrial, scientific, or economic signals.

The remaining signals are passed to Claude with the full hypothesis context. Claude returns a classification for each signal: ACT, MONITOR, or IGNORE, with the specific hypothesis or hypotheses the signal touches and the direction and magnitude of the movement.

ACT signals trigger the next phase of the loop. The system selects the most material signal of the day, drafts persona-shaped emails for that signal, queries the contact database for the relevant audience, assembles a YAMM CSV for outreach, and writes the campaign record to the master sheet.

MONITOR signals are recorded against their hypotheses for the heat map view.

IGNORE signals are discarded.

In the initiative model architecture, the daily loop is reorganised as the six-step signal pipeline per `/docs/SIGNAL_PIPELINE.md`: ingestion → triage → entity routing → claim assessment → state determination → model application. Signals route to specific entities and update specific link claims, producing audit trails that link source article to claim assessment to confidence movement.

### 4.2 The weekly loop

Once a week, the system runs a hypothesis review cycle. It looks at the movement across all hypotheses, identifies those that have transitioned phase, surfaces hypotheses that have stalled, and flags hypotheses that show signs of needing reframing.

The weekly loop also processes the embryo hypothesis feed. ACT signals that touch no existing hypothesis represent register gaps.

### 4.3 The monthly loop

Once a month, the system runs a calibration pass. Analyst-in-the-loop step.

### 4.4 The client-facing layer

The output of the daily, weekly, and monthly loops feeds three client-facing surfaces: direct outreach (persona-shaped emails), the live hypothesis dashboard, and the structured engagement.

---

## 05. Who uses it and what they do with it

<!-- HUMAN -->

Five user groups: clients (senior decision-makers consuming intelligence and outreach), Chris (sense-making and editorial layer), FutureBridge colleagues (sharing register and substrate), engagement teams (live intelligence inside structured engagements), external readers (investors, partners, prospective acquirers).

The Signal Engine is also a strategic asset in its own right. Investors, partners, prospective clients in diligence, and potential acquirers read this document plus the v1 documentation set in `/docs/` to understand the system. The methodology is defensible IP. The technology is the proof of operating capability.

---

# Part two — how it is built

## 06. System state

<!-- AUTO -->

| Metric | Value | Notes |
|---|---|---|
| Pipeline status | Partially recovered | OAuth grant `Google Sheets account 2` reauthed 28 April evening; WF-15A succeeded 29 April morning; WF-15 still failing on a downstream issue. |
| Last successful daily run | 29 April morning (WF-15A) | WF-15 itself last green pre-28 April. |
| Hypothesis store (legacy) | **Postgres on Railway (`hypothesis-db`) + Google Sheet** | v5.6 schema, 79 cols on `hypothesis_register` (76 base + 3 observable-layer additions). Postgres canonical for bucket layer + identity. |
| Initiative model store | **Pending migration 004** | Will add mv1_* tables (mv1_initiatives, mv1_entities, mv1_links, mv1_signals, mv1_competitive_events) per /docs/N8N_IMPLEMENTATION.md. Bumps schema to v6.0 on commit. |
| Observable matrix (legacy) | **Postgres `hypothesis-db`, schema v5.6** | hypothesis_observable, hypothesis_observable_event, confidence_band_history committed 30 April morning via migration 003. Empty on creation. Deprecated by initiative model; cutover via migration 005. |
| Hypothesis count | 118 | Schema v5.6, 79 columns. Will be re-expressed as initiatives in mv1_* schema following methodology. |
| v1 documentation set | `/docs/` (committed 30 April evening) | INITIATIVE_MODEL.md, INITIATIVE_METHODOLOGY.md, SIGNAL_PIPELINE.md, N8N_IMPLEMENTATION.md, WORKED_EXAMPLE_SHELL_H3.md. 2,746 lines. Canonical for initiative model. |
| Legacy documentation | `/docs/legacy/` | METHODOLOGY.md, HYPOTHESIS_MATRIX_v1.md, HEAT_MAPS_AND_GESTATION.md with superseded headers. Retained for history. |
| Visualisation prototype | `SHELL_H3_PORTFOLIO_v3.html` | 12 Shell H3 initiatives, 36 entities, 39 links. Built by intuition; due for review against /docs/INITIATIVE_METHODOLOGY.md. |
| Contact database | 27,473 | SQLite via Datasette |
| Active workflows on n8n | 13 of 17 | Audit incomplete; two duplicate WF-15 instances flagged |
| WF-15 node count | 22 | Was 19 at 1 April green status |
| Daily signal volume (input) | ~2,205 | Pre-score reduces to ~85 |

The Signal Engine reached full end-to-end production operation on 2 April 2026. It ran reliably through April with intermittent silent failures during build mode. On 28 April, Sheets-touching workflows broke when the shared OAuth credential was revoked.

The 30 April afternoon architectural pivot moves the system from matrix model to initiative model. The transition is staged: documentation (complete), schema (migration 004 pending), n8n rework (Phase 3 of N8N_IMPLEMENTATION.md), legacy cutover (migration 005). Operate mode discipline (per R23, R26) applies throughout.

This is the day the system crosses from build mode to operate mode (see Section 15).

---

## 07. Architecture

<!-- HUMAN -->

The system has three layers: ingestion and storage, classification and reasoning, and action. Connected by clean data contracts.

### 7.1 Layer one — ingestion and storage

Raw signals land in a single source-of-truth substrate. Currently split across Google Sheets and SQLite via Datasette on Render. Target: Postgres on Railway as source-of-truth, with Sheets as human-readable view via sync.

In the initiative model, the storage layer additionally supports the mv1_* tables per `/docs/N8N_IMPLEMENTATION.md` section 2.1. PG remains system-of-record, Sheets is analyst-facing read/write surface, Datasette is public read-only contact directory.

### 7.2 Layer two — classification and reasoning

This is where Claude lives. The current implementation embeds classification logic inside n8n HTTP Request nodes. Target: standalone `classifier/` module in the repo.

In the initiative model, classification is reorganised as the six-step signal pipeline (`/docs/SIGNAL_PIPELINE.md`): triage (Haiku), entity routing (Sonnet), claim assessment (Sonnet, the substantive judgement work), state determination, model application via the deterministic behaviour rule. Judgement is bounded — Claude assesses against specific claims with structured direction/magnitude/confidence calls, rather than producing free-form classifications.

### 7.3 Layer three — action

Output flows to outreach (YAMM, deprecated due to spam), Campaigns tab in master sheet, campaign manager HTML tool, client briefs, account plan tools.

In the initiative model, the action layer additionally exposes per-initiative confidence bands, biggest-risk queries, and signal audit trails. SHELL_H3_PORTFOLIO_v3.html shows the visualisation surface.

### 7.4 The data contracts that connect the layers

In the matrix model: signal schema, hypothesis schema (v5.6), campaign schema.

In the initiative model: initiative, entity, link, competitive event, signal — all v1.0 paired with the v1 doc set per `/docs/INITIATIVE_MODEL.md`.

### 7.5 The orchestration layer

n8n on Railway. WF-15 (legacy), supported by WF-15A and utility workflows.

In the initiative model, n8n hosts five workflows per `/docs/N8N_IMPLEMENTATION.md`: WF-INIT-1 (population assistant), WF-INIT-2 (Sheets-PG sync), WF-15A (signal pipeline, reworked), WF-INIT-3 (absence detection), WF-INIT-4 (drift management).

---

## 08. The hypothesis register

<!-- AUTO partial -->

118 active hypotheses. **Schema v5.6** in PG (legacy); **target v6.0** with migration 004 (mv1_* tables for initiative model). Hard cap: 150 active.

| Register | IDs | Count | Owner |
|---|---|---|---|
| Personal bets | BET_C001–C012 | 12 | Chris |
| Industry structural | BET_I001–I014 | 14 | Chris (with sector lead input) |
| Sector hypotheses | BET_E001–016, BET_M001–011, BET_SC001–009, BET_X001–008 | 44 | Sector leads |
| Client account | SH-01–03, BP-01–03, VW-01–03, etc. | 48 | Client partners |
| **Total** | | **118** | |

### 8.1 Three-section structure (v5.6, legacy)

The v5.6 schema has three sections: Section A core identity (16 cols), Section B decision layer (30 cols), Section C bucket layer (30 cols, R16-aligned).

### 8.2 Initiative model structure (v6.0, target)

In the initiative model, each hypothesis becomes an initiative composed of entities and links per `/docs/INITIATIVE_MODEL.md`. The four registers (PERSONAL/INDUSTRY/SECTOR/CLIENT_ACCOUNT) preserved as `register` field on `mv1_initiatives`.

Tables: mv1_initiatives, mv1_entities, mv1_links, mv1_signals, mv1_competitive_events.

Migration 004 creates these. Existing 118 hypotheses re-expressed by walking `/docs/INITIATIVE_METHODOLOGY.md` against each. Multi-week effort; not all 118 move at once.

### 8.3 Write path

Legacy: `hypothesis_builder.html` → Apps Script → Postgres → sync → Sheet view.

Initiative model: Sheets analyst tabs (mv1_*) → Apps Script doPost → Postgres mv1_* tables. WF-INIT-1 (population assistant) supports the analyst running INITIATIVE_METHODOLOGY procedure per `/docs/N8N_IMPLEMENTATION.md` section 3.

---

## 09. The pipeline

<!-- AUTO -->

### 9.1 WF-15 — Daily production flow (06:00 UTC weekdays)

```
06:00 Trigger
  → Prepare Today
  → Fetch Hypothesis Repository (118 hyps)
  → Build Classification Context
  → Map Signals to WF-15 Schema
  → Pre-Score Signals (~2,205 → ~85)
  → Combine Payload for Claude
  → Claude Classify Signals (P1)
  → Parse Classification
  → Prepare Sheet Updates
  → Write Updates to Sheet
  → Score and Select Best Signal       [⚠ architecture concern, see Build A]
  → Build YAMM Prompt
  → Claude Generate YAMM Emails (P2)
  → Wait
  → Get Energy Contacts
  → Parse YAMM Response
  → Write to Campaigns Tab              [⚠ needs Append Row fix]
  → Build YAMM CSV
  → Output Summary
```

22 nodes total. Pipeline must run linearly; branching causes execution failures.

In the initiative model architecture, WF-15 is reorganised as the six-step signal pipeline per `/docs/SIGNAL_PIPELINE.md`. Reorganisation is Phase 3 of the migration (per `/docs/N8N_IMPLEMENTATION.md` section 6); current WF-15 continues against legacy schema until then.

### 9.2 WF-15A — Signal Extraction

Schedule Trigger → Wake Datasette → Get News Feeds → Map → Noise Blocklist + Deduplicate → Build Extraction Payload → Claude Haiku Extract → Parse + Validate → Split Rows → Write to Mini-Signals → Collect + Write to Datasette → WF-15A Summary.

### 9.3 Other live workflows

13 active. Audit pending. Suspected duplicate WF-15 (ID NdzqfLjxVWozoyzo) — do not touch until audit confirms.

### 9.4 Architecture concern — Score and Select Best Signal

This node currently acts as a gate. Only the highest-scoring ACT signal flows downstream. All other ACT signals are discarded. See Build A.

---

## 10. Infrastructure

<!-- AUTO partial -->

**n8n Workflow Engine** — `https://n8n-production-86279.up.railway.app`

**Postgres on Railway** — Service `hypothesis-db`, PostgreSQL 18.3. Schema v5.6. Migration 004 pending.

**Google Sheet — Master Data** — `https://docs.google.com/spreadsheets/d/1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM`. Existing tabs plus new tabs pending for initiative model.

**Apps Script — Read/Write Endpoint** — Live (Version 3, deployed 2 April 2026). New endpoints pending.

**Render — Contact Database** — `https://futurbridge-signals.onrender.com`. 27,473 contacts. 60-second cold start.

**Anthropic API** — `https://api.anthropic.com/v1/messages`. Model: `claude-sonnet-4-20250514` (legacy WF-15); `claude-sonnet-4-6` (initiative model assessment) and `claude-haiku-4-5-20251001` (triage) per /docs/N8N_IMPLEMENTATION.md.

**GitHub Pages** — `https://chris-guerin.github.io/workfiles-/`

**Local repository** — `C:\Users\Admin\workfiles-`

---

## 11. Local tooling and developer environment

<!-- HUMAN -->

**Repository.** `C:\Users\Admin\workfiles-`. Public GitHub Pages site at `chris-guerin.github.io/workfiles-/`. Deploy: `git add . && git commit -m "update" && git push`.

**Claude Code.** v2.1.119 installed at `C:\Users\Admin\.local\bin\claude.exe`. Authenticated via Pro/Max OAuth.

**CLAUDE.md primer.** Lives at repo root. Read on every Claude Code session start. Updated 30 April evening to point at v1 doc set in /docs/ as canonical.

**ARCHITECTURE.md.** This document. Lives at repo root. Read alongside CLAUDE.md on every session start.

**v1 documentation set.** `/docs/` folder. Five documents totalling 2,746 lines specifying the initiative model architecture. Canonical for the post-30 April system.

**Legacy documentation.** `/docs/legacy/` folder. Three superseded docs retained for history.

**Local n8n bridge (`sync.js`).** `C:\Users\Admin\workfiles-\n8n\sync.js`. Bidirectional sync via REST API. Commands: list, status, pull, diff, push.

**Open issue: credential rotation batch.** Anthropic API key visible in n8n/workflows/wf15.json screenshot 27 April. n8n API key from same screenshot. Postgres password (quarterly rotation). Google Sheets OAuth (re-authorise). Treat as one batched rotation session per R24.

---

# Part three — how it sells

## 12. The commercial model

<!-- HUMAN -->

The Signal Engine sells the methodology, not the platform.

### 12.1 The three-track engagement structure

**Track 1 — Validate hypotheses.** £50k to £150k. Four to eight weeks.
**Track 2 — Map the gap.** £150k to £350k. Eight to twelve weeks.
**Track 3 — Close the gap.** £300k to £1m+. Six to twelve months.

The Shell H3 engagement at £330k is a Track 2-into-Track 3.

### 12.2 What the client buys

The methodology applied to their situation. The output of the engine scoped to their hypotheses. The synthesis layer (Chris and engagement teams). The relationship.

### 12.3 The pricing logic

Pricing is based on the value of the decision the methodology supports. Standard prices anchor at £50k and scale to £1m+.

### 12.4 The repeatability advantage

Once a client's hypotheses are in the system, the system continues to track them whether or not there is an active engagement. This creates a natural progression from project to retainer to multi-year programmes.

The cost of leaving FutureBridge increases with every month a client's hypotheses remain in the register.

---

## 13. Competitive position

<!-- HUMAN -->

### 13.1 What it competes with

It does not compete with research firms, news platforms, or consulting firms directly. It competes with the strategy practices of those firms when senior strategy executives need a forward-looking view.

### 13.2 The defensibility of the position

The structural moat is cross-domain adjacency. See Section 3.8.

In the initiative model, the moat operates more visibly through the entity catalogue. The same entity referenced by initiatives across companies and sectors makes adjacency queryable rather than narrative.

Three further moats: methodology, hypothesis register, technology.

The v1 documentation set in `/docs/` codifies the methodology to a level where it can be operated by analysts other than Chris.

### 13.3 The vulnerability

Tier-one consulting firms could build this. Specialist intelligence firms could acquire the methodology. Defence is speed and depth.

### 13.4 The acquisition target profile

Consulting acquirer values methodology and register. Research house values technology and contact database. Strategic acquirer values client relationships and sector depth.

---

## 14. Go to market

<!-- HUMAN -->

### 14.1 The buyer

Senior decision-maker in capital-intensive sectors with a strategic bet to defend or revise.

### 14.2 The first conversation

"What is the biggest decision you are going to make in the next eighteen months, and what would have to be true for that decision to be correct?"

### 14.3 The expansion path

Track 1 → Track 2 → Track 3. A successful engagement also surfaces adjacent hypotheses, making the register a cross-account asset.

### 14.4 The marketing surface

Currently sold through direct relationships. Future: weekly LinkedIn post, monthly methodology essay, quarterly closed-door briefing.

### 14.5 The delivery model

Chris plus a small support team. The Signal Engine handles labour-intensive intelligence; the team handles synthesis.

---

# Part four — where it is going

## 15. Strategic position

<!-- HUMAN -->

The system is crossing from build mode to operate mode in late April 2026. Major architectural pivot 30 April afternoon to the initiative model.

In build mode, pipelines run, sometimes fail, but output isn't yet wired to anything that creates revenue or risk. Failures are silent.

In operate mode, pipeline output drives outreach, conversations drive engagements. Every silent failure is now a real cost.

The 28 April OAuth break was the inaugural event of operate mode. The 30 April architectural pivot is the second-stage maturation. The matrix model was operationally heavy and analytically partial. The initiative model is tighter, more queryable, and more defensible to clients. The pivot is the right work even though it postpones some operational items.

---

## 16. Roadmap and next builds

<!-- HUMAN -->

### Build 0 — Restore daily reliability

Resolve recurring Google Sheets OAuth break. Build morning.js. Audit 17 workflows on n8n.

### Build A — Write all ACT signals

Move write nodes upstream of Score and Select Best.

### Build B — Embryo hypothesis feed

ACT signals with no hypothesis match → `hypothesis_embryos`.

### Build C — Daily Intelligence Report

Three outputs: Daily Intelligence tab, HTML to GitHub Pages, LinkedIn post drafts.

### Build D — Review P1 ACT classification threshold

Tighten ACT definition.

### Build E — Postgres migration

DELIVERED. v5 schema deployed; 118 hypotheses persisted; observable layer added via migration 003 (v5.6).

### Build F — Classifier extraction

Standalone `classifier/` module. In initiative model, reorganised as six-step signal pipeline.

### Build G — ARCHITECTURE.md auto-update

Build `update-architecture.js`.

### Build H — MCP integration

Wire Claude Code via MCP servers.

### Build I — New email sender stack

Instantly.ai or Smartlead with dedicated sending domain.

### Build J — Action layer specification

In initiative model, captured at link level via claim_basis.

### Build K — Marketing surface

LinkedIn first, essay second, briefing third.

### Build L — Trajectory layer (RETIRED)

Superseded by initiative model behaviour rule per `/docs/INITIATIVE_MODEL.md` section 4.

### Build M — Adjacency tagging (RETIRED)

Superseded by entity-catalogue adjacency in initiative model per `/docs/INITIATIVE_MODEL.md` section 8.

### Build N — Initiative model migration (NEW, post 30 April)

Five-phase sequence per `/docs/N8N_IMPLEMENTATION.md` section 6:

**Phase 1 (immediate):** Migration 004 deployed (mv1_* tables). Apps Script extended. Sheets master sheet gets new tabs.

**Phase 2 (1-2 weeks):** WF-INIT-1 (population assistant) built. First company (Shell) populated end-to-end via methodology. WF-INIT-2 (Sheets-PG sync) operational.

**Phase 3 (2-4 weeks):** WF-15A reworked to target mv1_* schema. Triage/routing/assessment prompts tuned. Live signal flow on Shell.

**Phase 4 (4-8 weeks):** Second and third companies populated (BP, Equinor). Cross-company queries enabled. WF-INIT-3 deployed. Legacy WF-15 deprecated; observable_layer marked for removal via migration 005.

**Phase 5 (3-6 months):** WF-INIT-4 operational. Methodology v1.x revisions based on operational learning.

### Build O — Native AI rainy-Tuesday test (immediate next, P0)

Drop /docs/INITIATIVE_MODEL.md and /docs/INITIATIVE_METHODOLOGY.md into a fresh AI. Ask it to populate one Shell H3 initiative from public sources. Compare to /docs/WORKED_EXAMPLE_SHELL_H3.md. Use comparison to identify methodology v1.1 revisions.

---

## 17. Open items queue

<!-- HUMAN -->

| # | Item | Priority |
|---|---|---|
| 1 | Native AI rainy-Tuesday test on v1 doc set (Build O) | P0 |
| 2 | Migration 004 deployment (mv1_* tables; schema v6.0) | P0 |
| 3 | Shell portfolio review against methodology (v3 vs methodology output) | High |
| 4 | Resolve recurring Google Sheets OAuth break (root cause) | High |
| 5 | Credential rotation batch (Anthropic, n8n, PG, Sheets OAuth) | High |
| 6 | Shell £220k Business Case Assessment SOW PO chase | High (commercial) |
| 7 | Build morning.js — daily 10-second status check | High |
| 8 | Workflow audit — deactivate dead, resolve duplicate WF-15 | High |
| 9 | Second-company population (BP or Equinor; Build N Phase 4) | Medium |
| 10 | WF-INIT-1 (population assistant) build | Medium |
| 11 | WF-INIT-2 (Sheets-PG sync) build | Medium |
| 12 | Fix Write to Campaigns Tab — change to Append Row (legacy WF-15) | Medium |
| 13 | New email sender stack (Build I) | Medium |
| 14 | Build update-architecture.js (Build G) | Medium |
| 15 | Bulk-set Signal Tracker rows older than 7 days to HISTORICAL (legacy) | Low |
| 16 | Wire campaign_manager_v2.html to Campaigns tab | Low |
| 17 | LinkedIn weekly post (Build K, phase 1) | Low |
| 18 | WF-15A signal pipeline rework to mv1_* (Build N Phase 3) | Medium-Low until Phase 2 done |
| 19 | Migration 005 — legacy observable_layer cutover | Low until Build N Phase 4 done |

---

## 18. Risks and dependencies

<!-- HUMAN -->

**Operational risk.** Pipeline can break and remain broken without anyone noticing. Mitigation: morning.js, status command, R23 daily check, R26 end-of-session git hygiene.

**Methodological risk.** Hypothesis poorly framed. Mitigation in initiative model: claim format rule (4 components required), entity creation discipline, methodology section 3 step 10 review.

**Commercial risk.** Shell H3 engagement (£330k) plus Business Case Assessment SOW (£220k, no PO). Concentration risk plus active commercial item.

**Technology risk.** Single points of failure: n8n on Railway, Anthropic API, Google Sheets OAuth, Render free tier cold start.

**Reputational risk.** ACT signal sent to client contact that is wrong. Mitigation: human review on day's outreach. In initiative model: assessment confidence dimension plus material/structural review thresholds.

**Documentation risk (new, 30 April 2026).** v1 doc set in /docs/ codifies the system at a level where it can be rebuilt. Valuable but creates leak vector. Mitigation: docs in private GitHub repo, access discipline, treat as commercially sensitive IP.

The single largest dependency is Anthropic.

---

# Part five — operating rules (binding)

## 19. Operating rules — R1 through R26

<!-- RULE: this section is binding. Changes require explicit version bump and review. -->

This section is the enforcement layer. Doctrine in Parts 1 to 4 describes the system. The rules in this section govern behaviour. They apply to every actor that touches the Signal Engine: Chris, colleagues, engagement teams, the classifier prompts inside WF-15, and any AI session (including Claude Code) operating on the system.

When doctrine and a rule appear to conflict, the rule governs. If a rule needs to change because doctrine has evolved, change the rule explicitly and bump the document version.

Rules are numbered R1 through R26. Where a rule references a build that does not yet exist, the rule applies as soon as the build ships.

### 19.1 Signal classification (R1 to R4)

**R1. Signal must move a metric.**
A signal MUST move at least one named system metric on at least one active hypothesis (or, in the initiative model, must update a specific link claim per `/docs/SIGNAL_PIPELINE.md`). If no metric movement or claim assessment is identifiable, classification MUST be IGNORE. No exceptions for source prestige, novelty, or surface drama.
*Rationale.* Without this, the system reverts to a news summariser.

**R2. ACT requires more than single-signal magnitude.**
YOU MUST NOT classify a signal as ACT unless: (a) it contributes to trajectory shift across two or more metrics on the same hypothesis, (b) it crosses a registered threshold on a single metric, or (c) it triggers a phase transition. In the initiative model, the equivalent is signal magnitude and assessment confidence per `/docs/SIGNAL_PIPELINE.md` section 5.
*Rationale.* ACT is a probability-shift signal, not an interest signal.

**R3. No-match ACT goes to embryo, not to forced-fit.**
A signal that meets ACT criteria but touches no active hypothesis MUST be written to `hypothesis_embryos` (or, in initiative model, surfaced for new-initiative consideration). YOU MUST NOT force-fit such a signal.
*Rationale.* Embryo signals reveal register gaps. Force-fitting destroys this signal.

**R4. Source prestige is irrelevant to classification.**
News volume, source prestige, virality, or surface drama MUST NOT influence classification.
*Rationale.* Prestige bias is the most common failure mode in human-curated intelligence systems.

### 19.2 Trajectory and phase (R5 to R7)

**R5. ACT outputs MUST include trajectory data.**
Every ACT classification MUST include `trajectory_delta` as a structured field. In the initiative model, the equivalent is the structured signal object with direction, magnitude, assessment_confidence, reasoning per `/docs/SIGNAL_PIPELINE.md` section 2.
*Rationale.* Defensible judgement requires structured data.

**R6. Phase transitions MUST be triggered by trajectory state.**
Phase transitions (matrix model) or state transitions (initiative model: holding → weakening → broken or ambiguous) MUST be triggered by computed state, not single events or human judgement applied directly. State machine rules per `/docs/SIGNAL_PIPELINE.md` section 3 step 5.
*Rationale.* Phase/state must be reproducible.

**R7. Stale hypotheses MUST be flagged.**
Any hypothesis or initiative with no observed movement for >30 days (or, for initiatives, all entities in `holding` state for >90 days with no recent signals) MUST be flagged as stale.
*Rationale.* Stale items don't belong in the active register at full attention.

### 19.3 Adjacency (R8 to R10)

**R8. Every signal MUST be domain-tagged.**
Every signal entering the system MUST be tagged with domain of origin from the controlled list. Signals without a domain tag MUST NOT enter classification.
*Rationale.* Adjacency cannot be detected without origin data.

**R9. Cross-domain transfer MUST be evaluated.**
For every signal classified as ACT or MONITOR, evaluate whether origin is adjacent to the affected hypothesis's primary domain. In the initiative model, this is automatic — the entity catalogue is global, so signals propagate to all linked initiatives.
*Rationale.* The structural moat only operates if adjacency is checked systematically.

**R10. Transfer log is a distinct output stream.**
Cross-domain transfers MUST be surfaced in the daily intelligence digest as a distinct stream.
*Rationale.* The commercial value of adjacency comes from its visibility.

### 19.4 Output contracts (R11 to R13)

**R11. ACT output schema is binding.**
Every ACT output MUST include: hypothesis_ids, affected_metrics, trajectory_delta, decision_implication, transfer_origin. In the initiative model, equivalent contracts apply per `/docs/SIGNAL_PIPELINE.md` section 2.
*Rationale.* Schema is the contract between classifier and downstream consumers.

**R12. Client-facing output MUST cite source and movement.**
Every client-facing email, brief, or dashboard entry MUST cite the specific hypothesis (or initiative), named metric movement (or claim assessment), and time horizon.
*Rationale.* Specificity is the methodology in operation.

**R13. WNTBT MUST be written in full in client-facing material.**
The acronym WNTBT MUST never appear in client-facing material. The full phrase "what needs to be true" MUST be used.
*Rationale.* Abbreviating in front of the client cheapens the methodology.

### 19.5 Hypothesis register / initiative model integrity (R14 to R16)

**R14. Schema is frozen.**
Hypothesis register schema is frozen at v5.6 (legacy). Initiative model schema (mv1_* tables) lands as v6.0 via migration 004. Schema changes MUST require explicit approval, versioned bump, document update.
*Rationale.* Schema is the contract; drift breaks the system silently.

**R15. New hypotheses / initiatives MUST pass the four tests.**
A hypothesis or initiative MUST be falsifiable, directional, business-linked, time-bound. In the initiative model, additional discipline of verifiable-commitment anchor and failure-must-be-definable test per `/docs/INITIATIVE_METHODOLOGY.md` section 3 step 1.
*Rationale.* The register is the firm's IP. Diluting it degrades every downstream output.

**R16. Metrics / entities MUST belong to canonical structures.**
Matrix model: metrics belong to technology / cost / regulation / ecosystem / competitive; carry current_state, threshold, required_slope, observed_slope, gap, mechanism. Initiative model: entities are tech / market / regulation / ecosystem; links carry role / impact / criticality / claim / claim_basis; claims satisfy four-component format (metric + threshold + context + time) per `/docs/INITIATIVE_MODEL.md` section 3.3.
*Rationale.* Trajectory computation (matrix) and behaviour rule (initiative) require complete data.

### 19.6 Communication and conduct (R17 to R20)

**R17. Voice rules in client-facing material.**
Short declarative sentences (10-18 word target). Peer register. No consultant clichés (forbidden: leverage, operationalise, ecosystem as buzzword, framework solves, contextualise, synergies, holistic). No em-dashes in prose. No AI-sounding symmetrical rhetoric. Sentence case.
*Rationale.* Voice is the methodology audible.

**R18. FutureBridge name MUST NOT appear in email body.**
Outreach email bodies MUST NOT contain the FutureBridge name.
*Rationale.* Naming the firm shifts email from peer intelligence to vendor pitch.

**R19. Email body MUST be under 120 words.**
Structure: signal with real numbers, company strategic posture, business implication, one pointed question, soft call to action.
*Rationale.* Senior recipients read in 8-15 seconds.

**R20. Brand colours and typography are binding.**
Primary palette black, white, grey #4B4B55, red #F84E5D as sparing highlight only. Secondary palette (purple, yellow, green, light blue, blue) for charts only. Circular Std primary, Arial fallback. Sentence case. Left-aligned or centred.
*Rationale.* Brand is the methodology visible.

### 19.7 Operational discipline (R21 to R26)

**R21. WF-15 MUST run linearly.**
WF-15 and companion workflows MUST run as linear pipelines. Branching is forbidden.
*Rationale.* Linear execution is the tested pattern.

**R22. No push to n8n without diff and confirmation.**
Changes MUST go through `sync.js diff`, `sync.js push` (with backup and y/N confirmation), and post-push re-pull. YOU MUST NOT edit production workflows directly in the n8n web editor for non-trivial changes.
*Rationale.* The web editor produces silent state changes that defeat the bridge.

**R23. Pipeline status MUST be checked daily.**
Every working day MUST begin with a pipeline status check via `morning.js` or `node sync.js status --since 24h`.
*Rationale.* Operate mode means failures cost money and trust.

**R24. Exposed credentials MUST be rotated immediately.**
API keys, OAuth tokens, any credential MUST be rotated when known to be exposed. Triggers: visible in screenshot, committed to public repo, included in conversation transcript outside Chris's machine, shared outside operating circle.
*Rationale.* Exposure plus delay equals breach.

**R25. Document drift is forbidden.**
When the system changes materially, ARCHITECTURE.md and the v1 doc set in `/docs/` MUST be updated the same day. The Last Verified date is the staleness indicator.
*Rationale.* A stale bible teaches confidently wrong information.

**R26. End-of-session git hygiene.**
Before closing any working session, all changed and new files MUST be committed and pushed. Procedure:
1. `git status` to confirm understanding of changes
2. `git add` everything intended to persist
3. `git status` again to confirm nothing red remains
4. `git commit` with descriptive message naming the work done
5. `git push` to origin
6. Confirm push succeeded ("main -> main" line shows)

Migration scripts, methodology docs, session archives, code changes, and visualisation prototypes are treated identically — if it is on disk and intended to persist, it goes in the commit. SESSION.md should be archived to `sessions/YYYY-MM-DD-HH.md` and `_next.md` updated for the next session, with both committed in the same end-of-session push.

Uncommitted work is unsaved work; loss of the local machine means loss of anything not pushed.
*Rationale.* The cost of running this discipline is 5 minutes; the cost of not running it can be days of lost work. The 30 April session surfaced the failure mode — yesterday's migration 003 sat uncommitted on the local machine for over 24 hours despite being a material schema change that ran against the live database. Without R26, the same gap will recur whenever sessions are intense.

### 19.8 Rule maintenance

Rules R1 through R26 are the current ruleset. Adding, removing, or materially changing a rule requires:
1. Document version bump (e.g. v5.6 → v5.7 for rule-level changes).
2. Note in version comment at top of document.
3. Update to relevant build entry in Section 16 if the rule references a build.
4. Re-read by anyone operating on the system, with explicit acknowledgement.

Rules MUST NOT be added casually. Bar for adding: "this would prevent a real failure mode that has occurred or is plausibly imminent." Bar for removing: "this rule has stopped serving the system."

R26 was added in v5.7 (30 April 2026 evening) after the failure mode surfaced during the day's session — yesterday's migration 003 work had remained uncommitted for >24 hours despite being a material schema change.

---

# Part six — reference

## 20. Files

<!-- AUTO partial -->

### Repository root

| File | Purpose | Status |
|---|---|---|
| ARCHITECTURE.md | This document. | Live — v5.7 30 Apr 2026 evening |
| CLAUDE.md | Session primer for Claude Code. | Live — updated 30 Apr 2026 evening |
| SESSION.md | Live session scratchpad. | Live |
| HANDOFF.md | Handoff protocol. | Live |
| index.html | Landing page for GitHub Pages. | Live |
| SHELL_H3_PORTFOLIO_v3.html | Visualisation prototype: 12 Shell H3 initiatives. | Live |

### v1 documentation set (/docs/)

| File | Purpose | Status |
|---|---|---|
| docs/INITIATIVE_MODEL.md | Data model and behaviour rule. | Live — v1.0 |
| docs/INITIATIVE_METHODOLOGY.md | Population procedure. | Live — v1.0 |
| docs/SIGNAL_PIPELINE.md | News-to-signal procedure. | Live — v1.0 |
| docs/N8N_IMPLEMENTATION.md | Workflow architecture. | Live — v1.0 |
| docs/WORKED_EXAMPLE_SHELL_H3.md | Procedure walkthrough on Shell H3 hydrogen NW Europe. | Live — v1.0 |

### Legacy documentation (/docs/legacy/)

| File | Purpose | Status |
|---|---|---|
| docs/legacy/METHODOLOGY.md | Matrix model methodology. | Superseded |
| docs/legacy/HYPOTHESIS_MATRIX_v1.md | Matrix model data spec. | Superseded |
| docs/legacy/HEAT_MAPS_AND_GESTATION.md | Layer above the matrix. | Superseded |

### Tools

hypothesis_repository_v4_final.html, hypothesis_builder.html, hypothesis_audit.html, account_plans_v4.html, meeting_prep_v8.html, signal_engine_v16.html, campaign_manager_v2.html, war_heatmap_v3.html.

### n8n bridge

n8n/sync.js, n8n/package.json, n8n/.env, n8n/tracked.json, n8n/workflows/wf15.json, n8n/code-nodes/wf15/*.js, n8n/backups/.

### Database

db/schema/hypothesis_register_v5.sql (v5.6), db/migrations/002_hypothesis_unified_v5_load.js (29 April), db/migrations/003_observable_layer.sql (30 April morning), db/migrations/003_observable_layer_runner.js, signal_engine_pe.db (Datasette).

### Sessions

sessions/_next.md (live, 30 Apr evening), sessions/2026-04-29-08.md, sessions/2026-04-30-am.md, sessions/2026-04-30-pm.md (to be created at session end).

---

## 21. Recovery

### 1. WF-15 broken or deleted

Import `WF-15_Claude_Hypothesis_Classification.json` to n8n. Re-enter Anthropic API key. Update Apps Script URL. Test before reactivating. Or `node sync.js push wf15` from local backup.

### 2. Apps Script stops responding

script.google.com → `signal engine p2` → `HypothesisRepository.gs` → Deploy → Manage deployments → Edit → New version → Deploy. Update URL in WF-15 and hypothesis_audit.html.

### 3. hyp_count returns 0

Check Apps Script URL returns 118 hypotheses. Check Hypothesis Repository tab has `hyp_id` in A1.

### 4. Datasette query fails

Visit `https://futurbridge-signals.onrender.com` for cold start. Test SQL directly. If browser works but n8n fails, check Get Energy Contacts node config.

### 5. Anthropic API key replacement

New key from console.anthropic.com. Update WF-15 Claude Classify Signals and Claude Generate YAMM Emails Headers `x-api-key`.

### 6. Google Sheets OAuth refresh token revoked

n8n → Credentials → Google Sheets account 2 → Reconnect → approve in OAuth popup → Save. If recurring, investigate OAuth client type, redirect URI, consent screen status.

### 7. n8n API key compromised

Settings → n8n API → revoke → create new. Update n8n/.env.

### 8. v1 documentation set lost

Five docs in `/docs/` and three in `/docs/legacy/` committed to GitHub. Restore via `git checkout HEAD -- docs/`.

### 9. Need to rebuild from scratch

v1 doc set in `/docs/`, this document, hypothesis content (hypothesis_repository_v4_final.html legacy + SHELL_H3_PORTFOLIO_v3.html prototype), n8n JSON exports, migration scripts.

---

## 22. Glossary

**ACT** — Signal classification: material shift in probability that a hypothesis resolves to its tested outcome. In initiative model: signal triggering state transition or moving confidence by >0.10 on gating link.

**Adjacency / Cross-domain adjacency** — Methodology principle that metric movement in one industry forecasts metric movement in another. Structural moat. See Section 3.8. In initiative model: captured at the entity layer.

**Behaviour rule** — In initiative model: deterministic formula converting signal to confidence band update. Δconfidence = base × criticality_weight × impact_weight × direction. See `/docs/INITIATIVE_MODEL.md` section 4.

**Claim** — In initiative model: testable proposition each link asserts about an entity in initiative context. Required four components: metric + threshold + context + time. See `/docs/INITIATIVE_MODEL.md` section 3.3.

**Criticality** — In initiative model: how much initiative success depends on a given link. Three values: gating, enabling, non-critical.

**Decision window** — Moment when client can act on hypothesis with confidence proportional to evidence.

**Embryo hypothesis** — Signal classifying as ACT but touching no existing hypothesis (matrix) or initiative (initiative model).

**Entity** — In initiative model: thing in the world that initiatives depend on. Types: tech, market, regulation, ecosystem.

**Gap (trajectory gap)** — Matrix model: required slope minus observed slope.

**Hypothesis** — Forward-looking, falsifiable, directional, business-linked, time-bound bet. Unit of analysis in matrix model.

**Hypothesis register** — Structured collection of all active hypotheses (matrix model). 118 across four sub-registers.

**IGNORE** — Signal classification: doesn't move any hypothesis or update any claim.

**Impact** — In initiative model: kind of force a link exerts. Three values: neutral, amplifying, threatening.

**Initiative** — In initiative model: unit of analysis. Specific bet a company has committed to.

**Link** — In initiative model: relationship between initiative and entity. Carries role, impact, criticality, claim, claim_basis.

**MONITOR** — Signal classification: touches hypothesis but doesn't shift decision probability materially.

**Phase** — Matrix model: hypothesis state (Divergent/Converging/Trigger-ready/Resolved). In initiative model: equivalent is entity state plus initiative confidence band.

**Role** — In initiative model: structural relationship. Four values: principal, enabling, optional, external.

**Signal** — Information that moves system metrics (matrix) or updates link claims (initiative model). Not a synonym for news.

**State (entity state)** — In initiative model: assessment relative to threshold. Four values: holding, weakening, broken, ambiguous.

**System metric** — Matrix model: underlying observable determining hypothesis credibility. Replaced in initiative model by entity-and-link structure.

**Threshold** — Value metric must reach (matrix) or that an entity claim asserts (initiative). WNTBT terms.

**Time-to-miss** — Matrix model: projected date metric fails threshold at observed slope.

**Track 1 / Track 2 / Track 3** — Three engagement structures: validate, map, close.

**Trajectory** — Matrix model: required + observed + gap + time-to-miss. Initiative model: link state plus signal history.

**Transfer log** — Matrix model: cross-domain transfers as distinct output stream. Initiative model: queryable via entity catalogue.

**WNTBT** — What Needs To Be True. Always written in full in client-facing material.

---

## 23. Document maintenance

<!-- HUMAN -->

This document maintains itself partially through automation and partially through discipline.

AUTO sections regenerated by `update-architecture.js` (Build G) when complete. Until then, maintained by hand. Last Verified date indicates staleness.

HUMAN sections written by Chris and updated when underlying thinking shifts.

RULE section (Section 19) is binding. Changes require document version bump, version comment update, rule-maintenance protocol per Section 19.8.

Document versioned by date at top. Major revisions increment major version; minor revisions increment minor.

This document supersedes all prior versions.

When materially out of date (>7 days for AUTO, >30 days for HUMAN), MUST be flagged as stale per R25. End-of-session updates per R26 should keep this document current as part of every push.

---

# Appendix A — Gap analysis vs McKinsey-equivalent product documentation

<!-- HUMAN -->

If McKinsey were producing this document, twelve gaps would close.

### Gap 1 — Quantified market opportunity

TAM, SAM, SOM analysis with numbers and sources. Currently qualitative. Prerequisite for any meaningful capital raise.

### Gap 2 — Named buyer personas with named buyers

Specific buyers within target accounts (e.g. "Susan Mills, SVP Strategy at Shell, who reports to Wael Sawan, who has authority to commission engagements up to £500k without board approval"). Belongs in confidential annex.

### Gap 3 — Pricing strategy with margin analysis

Bottom-up cost of delivery, gross margin per engagement, CAC, LTV, payback period. Plus competitive price benchmarks. Operational gap, not just documentation.

### Gap 4 — Sales motion playbook

Discovery questions in order, qualification criteria, objection handling, contract templates, pricing negotiation framework. Currently lives in Chris's head — single point of failure for growth.

### Gap 5 — Account expansion strategy

Land and expand playbook from £50k Track 1 to £1m+ multi-year programme. Section 12.4 gestures; the playbook is missing.

### Gap 6 — Competitive moat analysis with threat assessment

For each named competitor: what would it take to build, how long, what is FutureBridge's defence. Plus threat probability estimates. Gap for investor and acquirer conversations.

### Gap 7 — Build versus buy on every component

n8n, Anthropic, Render, Sheets, Apps Script, GitHub Pages — each is a build/buy decision.

### Gap 8 — Capital efficiency and unit economics

Capital deployed, capital required to next inflection, runway, required investor return. Strategic gap.

### Gap 9 — Talent plan

Specific roles, levels, ramp time, salary, equity. Bottleneck at ~20 active engagements requires named hiring plan.

### Gap 10 — Partnership strategy

Tiered partner strategy with named targets.

### Gap 11 — Brand positioning architecture

Brand vs product positioning vs offer positioning. Forces consistency.

### Gap 12 — Customer success and retention model

NRR target. CS playbook. Leading churn indicators.

### Net assessment

This document is fit for: internal alignment, partner conversations, prospective client diligence at current FutureBridge level, first-meeting acquirer conversations.

Not sufficient for: Series A capital raise, formal acquirer diligence, deep partnership negotiation, McKinsey-equivalent product investment committee.

Priority order to close the gaps: 3 and 8 (pricing and unit economics), 4 (sales playbook), 2 (named buyer personas), 5 (account expansion). Remainder waits for clearer growth path.

---

*FutureBridge Advisory · Signal Engine Architecture and Product Reference · v5.7 · 30 April 2026 evening*
*Chris Guerin · Confidential · Supersedes all prior versions*
