# HYPOTHESIS_MATRIX_v1.md — the model behind the methodology

**Status:** Draft, v1. Authored 29 April 2026.
**Purpose:** Specify the data structure, visual representation, and appraisal contract for hypothesis matrices. This is the *model* that METHODOLOGY.md's procedure produces, and that the Signal Engine's classifier operates against.
**Relationship to other documents:**
- METHODOLOGY.md defines *how to build* a hypothesis matrix from public sources.
- This document defines *what a hypothesis matrix is*, *how it represents state*, and *how Claude appraises signals against it*.
- ARCHITECTURE.md Section 3.9 places the matrix in the four-layer authoring model. ARCHITECTURE.md Section 3.5–3.7 (signals, decision windows, trajectory) describes the doctrine the matrix implements.

---

## 1. Why this exists

The hypothesis register today is a flat list of bets. Each bet has fields, but the fields are descriptive, not operational. A signal arriving at the system gets classified ACT / MONITOR / IGNORE against the register, but the classification is based on tag-matching and keyword overlap rather than on the structural relationship between the signal and the underlying conditions of the hypothesis.

The methodology says a hypothesis is a strategic claim plus a stack of underlying conditions. The conditions are what the world has to do for the strategy to deliver. A signal is relevant only when it moves one or more of those conditions. The appraisal of *how much it moves them, in which direction, with what implication for the hypothesis as a whole* is the work that determines whether the signal is ACT, MONITOR, or IGNORE — and at what magnitude.

That work cannot be done by a numeric weighting scheme. The same signal hitting the same observable can be an unlock (large impact) or iteration (marginal) depending on the current state of every other observable. A 5% efficiency gain at TRL 4 is one thing; the same gain at TRL 8, where that 5% was the only barrier to commercial deployment, is another. The judgement is dynamic, contextual, and requires the full state of the matrix as input.

This document defines the structure that makes that judgement possible: the matrix as state, the appraisal contract that calls Claude with full context, and the visual representation that surfaces confidence honestly without the false precision of percentage probabilities.

---

## 2. The matrix structure

A hypothesis matrix has two parts: hypothesis-level attributes and the observable matrix.

### 2.1 Hypothesis-level attributes

These are the attributes of the hypothesis as a whole. They sit alongside the matrix, not inside it.

- `hyp_id` — unique identifier (per ARCHITECTURE.md Section 8 conventions)
- `register` — CLIENT, INDUSTRY, CHRIS, or CONSULTING
- `theme` — one-line strategic restatement, falsifiable
- `time_horizon` — date by which the hypothesis must resolve
- `phase` — DIVERGENT, CONVERGING, TRIGGER_READY, or RESOLVED
- `confidence_band` — current confidence position on the visual bar (Section 4)
- `confidence_band_history` — time series of band positions, daily granularity
- `decision_threshold` — what evidence point triggers a strategic decision
- `wntbt_summary` — top-level statement of what would have to be true
- `source_initiatives` — pointer(s) to the company initiative(s) this hypothesis was derived from
- `related_hyp_ids` — links to other hypotheses (intra-company, industry, cross-industry)
- `last_appraisal_at` — timestamp of last Claude appraisal pass
- `last_signal_at` — timestamp of last signal that touched the matrix

### 2.2 The observable matrix

The matrix has rows (observables) grouped into five blocks (lines). Each row has a defined set of columns describing its current state.

**The five lines.**

- **Tech.** Technology-related observables — TRL, cost curves, manufacturing readiness, technology-specific milestones, named technical bottlenecks.
- **Market.** Market-related observables — TAM, TTM, unit economics gates, customer adoption indicators, demand-side drivers.
- **Regulation.** Regulatory-related observables — current state of relevant rules, named pending decisions, jurisdictional variation, policy trajectory.
- **Ecosystem.** Ecosystem-related observables — supply chain readiness, partner availability, infrastructure gaps, customer-side capability gaps, named dependencies.
- **Competitive.** Competitor-related observables — competitor moves, partnership lockouts, capacity announcements, M&A activity, named competitive positioning.

The depth of each line varies by hypothesis. Tech and market are typically the deepest (3-4 layers below the bucket level). Regulation is often shallower (1-2 layers). Ecosystem varies by complexity of supply chain. Competitive is wide rather than deep — many competitor entries, each shallow.

**Row schema (continuous observables — tech, market, regulation, ecosystem).**

```
{
  "observable_id": "TECH_001",
  "line": "tech",
  "parent_path": "tech.electrolysis.PEM",
  "name": "PEM electrolyser stack TRL",
  "description": "Technology Readiness Level for proton exchange membrane electrolyser stacks at commercial scale",
  "role": "unlock | iteration | supporting",
  "current_state": "TRL 7",
  "current_state_numeric": 7,
  "scale_type": "TRL_1_9 | cost_per_unit | percentage | binary | enum | freeform",
  "threshold": "TRL 9",
  "threshold_numeric": 9,
  "threshold_direction": "above | below | equal",
  "evidence_base": "Most recent signal: 1PointFive Stratos commercial deployment Texas, Jan 2026. Radar score: 4.0",
  "last_updated_at": "2026-01-15",
  "last_signal_id": "SIG_2026_0142",
  "source_signals": ["SIG_2026_0142", "SIG_2025_4521"],
  "velocity_30d": "rate of change over trailing 30 days, in scale_type units",
  "velocity_90d": "rate of change over trailing 90 days, in scale_type units",
  "velocity_status": "accelerating | steady | decelerating | static",
  "notes": "Commercial-scale demonstration is the binding step; pilot-scale TRL is already 8+"
}
```

The `role` field is critical. It encodes whether the observable is an unlock (movement here changes the hypothesis materially), iteration (movement here is marginal), or supporting (movement here is evidence but not load-bearing). The role is set at matrix authoring time per the methodology and reviewed periodically. Claude's appraisal weights signals partly on the role of the observable they touch.

The `velocity_*` fields are computed from the observable's update history, not authored. They capture how fast this observable is moving in absolute terms. A TRL that has gone from 4 to 7 in six months is high-velocity; a TRL that has gone from 4 to 4.5 in six months is low-velocity. Velocity matters because the same current state means different things at different rates of change. An observable at TRL 6 and accelerating is a different signal from an observable at TRL 6 and static. The appraisal stage uses velocity as one of its inputs; the heat-map and gestation surfaces (see HEAT_MAPS_AND_GESTATION.md) use velocity as a primary attribute for surfacing candidate research areas.

**Row schema (event-log observables — competitive).**

The competitive line is shaped differently. Competitive observables are not continuous metrics; they are events — discrete moves by named actors with specific implications. The row format is a log entry rather than a state value.

```
{
  "observable_id": "COMP_001",
  "line": "competitive",
  "parent_path": "competitive.Equinor",
  "actor": "Equinor",
  "event_type": "partnership | acquisition | capacity_announcement | exit | other",
  "event_description": "Equinor signs offtake agreement with NextEra for 500MW datacenter power",
  "event_date": "2026-03-12",
  "implication": "Reduces available datacenter offtake market for Shell by ~15% in US Northeast; potential lockout if exclusive",
  "implication_severity": "minor | material | major",
  "source_signals": ["SIG_2026_0234"],
  "last_updated_at": "2026-03-12"
}
```

Competitive entries accumulate over time. They are not overwritten as new events occur; they form a chronological log. The aggregate state of the competitive line is the implication-weighted sum of its events, evaluated by Claude during appraisal rather than computed by formula.

### 2.3 Matrix size

A typical hypothesis matrix has 30-50 observables across the five lines. Tech and market each contribute 8-15 observables; regulation 3-8; ecosystem 5-12; competitive 5-15. Larger hypotheses (cross-industry plays, complex regulatory environments) can reach 80+ observables. Smaller, narrower hypotheses can run as low as 15-20.

Hard cap: 100 observables per hypothesis. Beyond that, the hypothesis is too broad and should be decomposed into multiple hypotheses with cross-references via `related_hyp_ids`.

---

## 3. The cross-bucket relationship

The matrix is not a tree because observables relate across buckets. A patent for unobtainium might affect tech (TRL of unobtainium-enabled technology), market (cost-curve assumption changes), ecosystem (a new credible actor — the patent assignee — appears), and competitive (incumbents using the alternative technology face displacement). One signal, four bucket effects.

The matrix supports this through `related_observable_ids` per row. When Claude appraises a signal, the appraisal can update multiple observables across multiple lines simultaneously, with the cross-bucket reasoning surfaced in the narrative.

This is also why the visualisation looks like a tree (because humans read it that way — top-down, bucket-by-bucket) but the data is matrix-shaped (because the relationships are multi-directional). The visual is a presentation choice; the data is the truth.

---

## 4. Visual confidence representation

### 4.1 The bar

Each hypothesis has a horizontal confidence bar with three zones:

- **Red** (left third) — failing, falsified, or trending toward falsification. Multiple metrics behind threshold with no credible path to closure.
- **Amber** (middle third) — uncertain, mixed evidence, multiple metrics moving without clear direction. Default zone for hypotheses in DIVERGENT or CONVERGING phase.
- **Green** (right third) — on track or ahead. Majority of metrics trending toward or past threshold, decision window approaching favourably.

A marker on the bar shows current confidence position. The marker is a band (not a point) representing uncertainty in the appraisal — confidence is "somewhere in this range" rather than a single point. Band width reflects how recently the hypothesis was appraised and how stable the matrix state is.

### 4.2 Per-line bars

In addition to the overall confidence bar, each hypothesis has five per-line bars (one per bucket — tech, market, regulation, ecosystem, competitive). The per-line bars show whether the issue is in tech (eg TRL slipping), regulation (eg policy reversal), ecosystem (eg partner withdrawal), etc.

The overall bar's position is informed by the per-line bars but not computed mechanically from them. Claude's appraisal sets both — the overall bar position is a holistic judgement that may weight some lines more heavily than others depending on which observables are load-bearing for the specific hypothesis.

### 4.3 Movement over time and velocity

Each bar carries a trajectory indicator showing direction, recency, and **velocity**. A small arrow or trail showing the marker's position over the last 30 days. Drift toward red over time is a different signal from a sudden jump into red on one signal.

Velocity is rendered explicitly alongside position. Position alone tells you where the hypothesis is; velocity tells you how fast it is getting there or away from there. A hypothesis at amber-mid drifting slowly positive is one story; a hypothesis at amber-mid moving fast positive is a different story even though they share a current position.

The visualisation surfaces velocity in three ways. Position over the trailing 30 days renders as a fading trail behind the current marker — the trail's slope shows direction and rate. A small numeric or symbolic indicator alongside the marker shows velocity status (accelerating / steady / decelerating / static) computed from the trail's second derivative. And a sortable view at the register level lets the operator filter for "hypotheses moving fastest" regardless of current position — a slow hypothesis at green is less interesting than a fast hypothesis at amber heading green.

Per-line bars carry their own velocity indicators. Tech may be moving fast while market is static; the contrast itself is a finding worth surfacing.

The trajectory and velocity rendering is the most commercially valuable view. A hypothesis that has been in amber for six months and is drifting toward green is approaching a decision window. A hypothesis that just jumped from green to amber on a single competitor move warrants immediate attention. A hypothesis at amber-mid with high positive velocity is going to be in a decision window soon, even if it isn't yet.

Velocity also feeds the heat-map and gestation surfaces (HEAT_MAPS_AND_GESTATION.md). The same velocity computations that drive per-hypothesis bars also drive register-level views showing where attention should concentrate.

### 4.4 What the bar does NOT show

The bar deliberately does not show numeric probability. The reasons are stated in METHODOLOGY.md Section 8 and reinforced here: numeric probability implies false precision in a fundamentally judgement-based system. A 60% becoming 64% looks like progress; in reality it is noise inside the appraisal margin.

The bar also does not show phase directly. Phase is a separate attribute (DIVERGENT, CONVERGING, TRIGGER_READY, RESOLVED). Phase movement and confidence movement are correlated but not identical — a hypothesis can move from amber to green confidence while still being in CONVERGING phase if its time horizon is far out, or it can be in TRIGGER_READY phase while sitting in amber if the confidence reflects high evidence but mixed direction.

---

## 5. The appraisal contract

### 5.1 Appraisal as the core operation

When a signal arrives at the system, the system needs to know what the signal does to the hypothesis register. Three steps.

**Step one — relevance routing (deterministic).** The signal is checked against tag and keyword filters per hypothesis. Hypotheses whose tags overlap with the signal's domain, technology, or actor entries are flagged as candidates for appraisal. This step is deterministic, fast, and computable in code. It produces a candidate list of, typically, 3-15 hypotheses per signal.

**Step two — appraisal (Claude).** For each candidate hypothesis, Claude is given the hypothesis matrix in full plus the signal, and asked to produce a structured appraisal output (Section 5.3). This step is the model in operation. It is not a lookup or a formula; it is the dynamic judgement that the methodology specified.

**Step three — application (deterministic).** The appraisal output is applied to the matrix: observable values updated, confidence band moved, phase transition triggered if the appraisal indicated one, signal logged with classification (ACT / MONITOR / IGNORE). This step is deterministic and auditable.

The boundary between deterministic and Claude-based logic matters. Routing and application are deterministic and can be implemented in code with full audit trails. Appraisal is the part where judgement is required and where Claude is in the loop.

### 5.2 Appraisal input

The input to Claude per appraisal is:

- The full hypothesis matrix (hypothesis-level attributes plus the observable rows)
- The current confidence band positions (overall and per-line)
- The signal: object_statement, source, date, domain, relevant tags
- The current phase
- The recent appraisal history (last 30 days) for context — to prevent over-reaction to a signal that's adding to a known trend versus reacting to a fresh development

The appraisal does not include other hypotheses' matrices unless the signal has been routed as relevant to multiple hypotheses; cross-hypothesis effects are handled by routing the signal to each hypothesis it touches and appraising each separately.

### 5.3 Appraisal output

Claude produces a structured response per appraised hypothesis:

```
{
  "hypothesis_id": "SHELL_H3_DC_001",
  "signal_id": "SIG_2026_0512",
  "classification": "ACT | MONITOR | IGNORE",
  "observables_updated": [
    {
      "observable_id": "TECH_005",
      "field_changed": "current_state",
      "old_value": "TRL 6",
      "new_value": "TRL 7",
      "reasoning": "Signal documents commercial-scale demonstration, advancing readiness from late-pilot to early-commercial"
    }
  ],
  "confidence_movement": {
    "overall": {
      "magnitude": "none | slight | material | large",
      "direction": "positive | negative | neutral",
      "reasoning": "Tech advance is meaningful but not an unlock; the binding constraint remains regulatory approval which is unchanged"
    },
    "per_line": {
      "tech": { "magnitude": "material", "direction": "positive" },
      "market": { "magnitude": "none", "direction": "neutral" },
      "regulation": { "magnitude": "none", "direction": "neutral" },
      "ecosystem": { "magnitude": "slight", "direction": "positive" },
      "competitive": { "magnitude": "none", "direction": "neutral" }
    }
  },
  "phase_movement": {
    "old_phase": "CONVERGING",
    "new_phase": "CONVERGING",
    "reasoning": "Movement is positive but does not cross the trigger-ready threshold; tech bucket is now in good shape but regulation remains the binding constraint"
  },
  "narrative": "This signal advances the tech readiness of the load-bearing technology meaningfully but does not address the binding constraint, which is regulatory approval for behind-the-meter datacenter interconnection. The hypothesis remains converging; expect trigger-readiness only when the FERC decision lands.",
  "decision_implication": "No immediate action required. Continue to track regulatory decision timeline; the next material movement will come from FERC NOPR comment period closure expected Q3 2026."
}
```

The structure is verbose deliberately. Every change is justified. Every confidence movement has reasoning. The narrative ties the signal to the hypothesis's strategic logic. The decision implication names what (if anything) the client should do.

This is more expensive per call than a numeric scoring approach. It is also auditable — every change in the matrix has a documented reason. When a board asks "why did our confidence in this bet drop last week," the answer is a concrete signal, a concrete observable, and a concrete reasoning chain.

### 5.4 Magnitudes — definitions

The four magnitude levels are bounded by examples to keep them consistent across appraisals:

- **None.** No material movement. The signal touches the matrix but does not shift any observable's value or any confidence band position. Classification typically IGNORE or MONITOR.
- **Slight.** Marginal movement. An observable moves slightly within its current range. Confidence band drifts within its zone but does not approach a zone boundary. Classification typically MONITOR.
- **Material.** Meaningful movement. An observable changes value such that its role status changes (eg an iteration becomes an unlock as TRL crosses a threshold). Confidence band moves perceptibly, may approach a zone boundary. Classification typically ACT.
- **Large.** Hypothesis-changing movement. An observable changes value such that the hypothesis structure itself is in question. Confidence band may cross a zone boundary in one signal. Phase transition may be triggered. Classification ACT.

Movements are calibrated against the hypothesis's own scale, not against an absolute reference. A 5% efficiency gain in a young technology is slight; a 5% gain that crosses the commercial-deployment threshold is material or large. The role attribute on the observable is what tells Claude which is which.

### 5.5 Appraisal cadence — the dial

Cadence is not a fixed property of the system. It is a per-hypothesis configuration. Different hypotheses justify different operating tempos based on their commercial value, the velocity of their underlying domain, and the engagement context they sit in.

**The fast clock — daily, fixed.** News pipeline ingests roughly 2,205 raw signals per day. Triage (cheap reasoning, Haiku-class) runs daily and reduces this to ~85 surviving signals per day. Surviving signals are routed (deterministic) to candidate hypotheses by tag overlap and held in a per-hypothesis queue. The fast clock is fixed because the news pipeline runs at its natural cadence; signals not triaged within 24 hours stack up as backlog.

**The slow clock — configurable per hypothesis.** Each hypothesis carries an `appraisal_cadence` attribute with one of:

- `daily` — appraisal runs every day on whatever signals are in the queue for this hypothesis. Highest cost, highest responsiveness. Appropriate for hypotheses tied to active client engagements where the operator is in weekly working sessions and needs the most current read at all times.
- `twice_weekly` — appraisal runs twice per week (suggested Tuesday and Friday). Tuesday feeds Wednesday outreach; Friday feeds Monday outreach. Appropriate for hypotheses where the underlying domain moves at a brisk pace and the operator wants regular intelligence flow without daily intensity.
- `weekly` — appraisal runs once per week (suggested Friday afternoon for Monday outreach). Default cadence for newly-built hypotheses. Appropriate for steady-state operation against stable hypotheses where weekly-rhythm intelligence matches the commercial cadence of how the output gets consumed.
- `monthly` — appraisal runs once per month. Appropriate for CONSULTING hypotheses (commercial-readiness positions where the system is just keeping a watchful eye) and for INDUSTRY or CHRIS hypotheses where the underlying patterns shift slowly.
- `on_demand` — appraisal runs only when explicitly triggered. Appropriate for archived or dormant hypotheses being kept warm but not actively monitored.

The cadence dial means the total cost of the system scales with the value being produced. Active client hypotheses run hot. CONSULTING hypotheses idle. Maverick CHRIS bets on long-cycle structural calls might run monthly because the question of whether they're true on any given week is rarely interesting.

The default for a newly-built hypothesis is `weekly`. The operator can elevate or reduce the cadence per hypothesis at any time. Cadence changes take effect at the next scheduled cycle.

**The combined-signal advantage.** Whatever the cadence, when a hypothesis has multiple signals in its queue at appraisal time, they are appraised together in one Claude call. A regulatory unlock arriving in the same period as a competitive entry should be appraised as one combined story ("regulatory door opens, competitor walks through it first") rather than two independent appraisals that net out incorrectly. Combined-signal appraisal sees narrative; per-signal appraisal sees fragments. This is true whether the period is a day, a week, or a month — the combined-signal property of the appraisal call is what makes it intellectually honest at any cadence.

**On-demand single-hypothesis appraisal.** In addition to the scheduled cadence, the operator can trigger an immediate appraisal of any individual hypothesis at any time. Use cases include preparing for a client meeting where the latest read on a specific hypothesis is needed, capturing a fresh appraisal after a suspected drift, or refreshing intelligence on a hypothesis that has been sitting at lower cadence and now warrants attention. On-demand appraisal runs against whatever signals are currently in the hypothesis's queue plus any signals that have been triaged-and-routed since the last appraisal, regardless of cadence schedule.

**On-demand multi-hypothesis appraisal.** For breaking events that span a sector or theme, the operator can trigger appraisal across all hypotheses tagged with a particular domain, theme, or list of IDs, regardless of individual cadence. Examples: "appraise every hypothesis touching hydrogen", "appraise every Shell hypothesis", "appraise every hypothesis with a competitive observable on Equinor". The system runs the appraisals in parallel and produces a sector-wide intelligence picture within minutes. This is the bell-and-whistle that pays for itself when something material happens — the system can produce coordinated intelligence on a breaking event rather than waiting for individual hypothesis cycles to come around.

**Breaking-news automatic bypass.** A narrow class of signals — major regulatory decisions, M&A announcements involving load-bearing actors, partnership announcements with material competitive implications — automatically trigger immediate appraisal of any hypothesis they route to, regardless of that hypothesis's configured cadence. The bypass criteria are deterministic (configured tag list, source whitelist, severity heuristics) so the bypass-versus-schedule decision is not itself a judgement call. The bypass is rare by design; most signals can wait until the next scheduled cycle without commercial cost.

The dial, the on-demand modes, and the automatic bypass together mean the operator has the full range of operating tempos available: from "this hypothesis runs cold and we check in monthly" to "every hypothesis touching this sector gets appraised right now because something just happened." The choice of tempo is independent for each hypothesis and reversible at any time.

---

## 6. Worked example — Shell H3 datacenter power play

This section sketches one hypothesis matrix end-to-end to ground the abstract structure in a concrete case.

### 6.1 Hypothesis-level attributes

```
hyp_id: SHELL_H3_DC_001
register: CLIENT
theme: Shell will hold commercial offtake or equity positions in at least 500MW of low-carbon power capacity dedicated to hyperscaler customers by 2030
time_horizon: 2030-12-31
phase: CONVERGING
confidence_band: amber, position 0.55 (slightly past midpoint, drifting positive)
decision_threshold: First 100MW commercial deal signed with a hyperscaler counterparty, or formal Shell internal go/no-go decision after Q2 2027 capital review
wntbt_summary: Tech: SMR or nuclear restart pathways must reach commercial deployment cost parity for hyperscaler PPA structures. Market: hyperscaler 24/7 carbon-free matching demand must hold or grow. Regulation: behind-the-meter or co-located generation must remain permitted in target jurisdictions. Ecosystem: at least one Shell-relevant deployment partner (developer, technology provider, or capital partner) must commit. Competitive: no dominant lockout by integrated competitors (Constellation, NextEra, hyperscaler-internal capacity).
source_initiatives: shell.com/what-we-do/oil-and-gas/strategy/horizon-3 (placeholder URL)
```

### 6.2 The matrix — sketched, partial

A full matrix would have 30-50 observables. This sketch shows representative entries from each line.

**Tech line (extract):**

| ID | Name | Role | Current State | Threshold | Evidence Base |
|---|---|---|---|---|---|
| TECH_001 | SMR commercial deployment readiness | unlock | TRL 5 | TRL 8 | Radar: NuScale TRL 4.0; Linglong One commercial 2026 |
| TECH_002 | Nuclear plant restart legal pathway | unlock | partially viable | proven viable in 3+ jurisdictions | Radar: TRL 4.0; Talen-Amazon Susquehanna PPA established |
| TECH_003 | Behind-the-meter interconnection technical readiness | iteration | TRL 4 | TRL 7 | Cumulus Data campus 2.5GW direct-tied operating |
| TECH_004 | AI-optimised grid management | supporting | TRL 4 | TRL 6 | Radar: TRL 4.0; DeepMind Google datacenter 40% cooling reduction |
| TECH_005 | Liquid cooling for hyperscaler clusters | supporting | TRL 3 | TRL 5 | Radar: TRL 3.0; hyperscaler mandates emerging |

**Market line (extract):**

| ID | Name | Role | Current State | Threshold | Evidence Base |
|---|---|---|---|---|---|
| MKT_001 | Hyperscaler 24/7 CFE demand (GW by 2030) | unlock | ~30GW announced | ≥40GW credible by 2027 | Public hyperscaler pledges; Google 24/7 CFE methodology |
| MKT_002 | LCOE of low-carbon power for DC offtake ($/MWh) | unlock | $80-120 | <$70 for SMR; <$60 for restarts | Multiple PPA disclosures |
| MKT_003 | Shell-addressable share of DC power market (US Northeast + Texas) | iteration | uncertain, low single digit % | ≥10% credible | Inferred from Shell's existing US power footprint |

**Regulation line (extract):**

| ID | Name | Role | Current State | Threshold | Evidence Base |
|---|---|---|---|---|---|
| REG_001 | FERC behind-the-meter interconnection rules | unlock | NOPR under review, decision expected Q3 2026 | Final rule permitting BTM at scale | FERC docket public; comment period open |
| REG_002 | NRC SMR licensing pace | unlock | NuScale certified; others advancing | Multiple designs licensed within window | NRC public actions; ADVANCE Act 2024 |
| REG_003 | State-level approvals for nuclear restarts | iteration | varies by state | Permissive in 5+ states | Multiple state actions tracked |

**Ecosystem line (extract):**

| ID | Name | Role | Current State | Threshold | Evidence Base |
|---|---|---|---|---|---|
| ECO_001 | Hyperscaler willingness to contract directly with non-utility power providers | unlock | demonstrated (Microsoft-Constellation, Amazon-Talen) | mainstream practice | Multiple announced deals |
| ECO_002 | Available technology partners for Shell co-investment | iteration | several candidates (NuScale, X-energy, Kairos, Talen) | named Shell-aligned partner | Public partnership announcements absent for Shell |
| ECO_003 | Capital partner availability for nuclear/SMR build | supporting | growing | adequate for 500MW position | DOE loan programme, IRA incentives |

**Competitive line (extract — event log):**

| ID | Actor | Event | Date | Implication | Severity |
|---|---|---|---|---|---|
| COMP_001 | Talen Energy | Direct PPA with Amazon for 960MW Susquehanna nuclear | 2024 | Establishes BTM nuclear-DC model; reduces Shell-addressable in US Northeast | Material |
| COMP_002 | Constellation | Three Mile Island restart for Microsoft | 2024 | Validates restart-for-DC model; Shell late to entry | Material |
| COMP_003 | Equinor | (no current major moves in DC power) | n/a | n/a | n/a |
| COMP_004 | BP | (no current major moves in DC power) | n/a | n/a | n/a |
| COMP_005 | Hyperscaler-internal (Google Kairos partnership) | Google contracts Kairos for 500MW by 2030 | 2024 | Hyperscalers may bypass utility-scale partners; reduces total addressable opportunity | Material |

### 6.3 Sample appraisal — signal one (unlock-type)

**Signal:** "FERC issues final rule on co-located load behind-the-meter interconnection, permitting up to 1GW per facility without grid impact study, effective Q1 2027."

**Routing:** Signal tagged as `regulation`, `datacenter`, `interconnection`. Matches multiple hypotheses including SHELL_H3_DC_001.

**Appraisal output (abridged):**
```
classification: ACT
observables_updated:
  - REG_001: current_state moves from "NOPR under review" to "Final rule issued, effective Q1 2027"
  - TECH_003: confidence in BTM technical readiness elevated, current_state remains TRL 4 but binding constraint removed
  - MKT_003: Shell-addressable share assumption can now be revised upward
confidence_movement:
  overall: { magnitude: "large", direction: "positive" }
  per_line:
    tech: { magnitude: "slight", direction: "positive" }  
    market: { magnitude: "material", direction: "positive" }
    regulation: { magnitude: "large", direction: "positive" }
    ecosystem: { magnitude: "none", direction: "neutral" }
    competitive: { magnitude: "none", direction: "neutral" }
phase_movement:
  old_phase: CONVERGING
  new_phase: TRIGGER_READY
  reasoning: "Regulatory unlock removes the binding constraint named in the WNTBT summary. Combined with established technical pathways, the hypothesis now meets trigger-ready criteria."
narrative: "This is the regulatory unlock the hypothesis depended on. Behind-the-meter interconnection at GW scale was the binding constraint; FERC has now resolved it. Shell can now move on this thesis with regulatory certainty. The window opens Q1 2027."
decision_implication: "Recommend Shell H3 team accelerate partner selection (TECH_001 pathway preferred for time-to-deployment). Decision window opens Q1 2027 and likely closes by end-2028 as competitors move."
```

Confidence band moves from amber 0.55 to green 0.75. Phase moves to TRIGGER_READY. The hypothesis is now in a decision window.

### 6.4 Sample appraisal — signal two (iteration-type)

**Signal:** "NuScale announces 5% efficiency improvement in VOYGR design, certified by NRC supplementary review."

**Routing:** Tagged `tech`, `nuclear`, `SMR`. Matches SHELL_H3_DC_001 via TECH_001.

**Appraisal output (abridged):**
```
classification: MONITOR
observables_updated:
  - TECH_001: current_state remains TRL 5; evidence_base updated; no role change
confidence_movement:
  overall: { magnitude: "slight", direction: "positive" }
  per_line:
    tech: { magnitude: "slight", direction: "positive" }
    others: all none/neutral
phase_movement: no change
narrative: "Iteration-class signal. NuScale's design is incrementally improving but the binding constraints for the hypothesis (commercial deployment readiness, regulatory unlock) remain unchanged. The signal contributes to the evidence base for the eventual unlock but does not, by itself, move probability materially."
decision_implication: "No client-facing action. Continue to track NuScale and competitor SMR designs as they progress toward commercial deployment milestones."
```

Confidence band drifts from 0.55 to 0.57. No phase change. Classified MONITOR.

### 6.5 Sample appraisal — signal three (negative-competitive)

**Signal:** "Equinor signs offtake agreement with NextEra for 500MW of new SMR capacity dedicated to a Microsoft datacenter campus in Texas, effective 2028."

**Routing:** Tagged `competitive`, `Equinor`, `datacenter`, `SMR`. Matches SHELL_H3_DC_001 via competitive line and ECO_001.

**Appraisal output (abridged):**
```
classification: ACT
observables_updated:
  - COMP_003: new event logged. Equinor enters DC power market with major SMR offtake. Severity: Major.
  - ECO_001: confidence elevated (further validation of hyperscaler direct contracting), but addressable market shrinks
  - MKT_003: Shell-addressable share reduced; estimate moves from "low single digit" to "low single digit, with established competitor position to displace"
confidence_movement:
  overall: { magnitude: "material", direction: "negative" }
  per_line:
    tech: { magnitude: "none", direction: "neutral" }
    market: { magnitude: "material", direction: "negative" }
    regulation: { magnitude: "none", direction: "neutral" }
    ecosystem: { magnitude: "slight", direction: "positive" }
    competitive: { magnitude: "large", direction: "negative" }
phase_movement: no change (hypothesis was CONVERGING, remains CONVERGING)
narrative: "Equinor's entry is the most significant competitive move against this hypothesis to date. They have established a hyperscaler relationship Shell does not have, in a geography Shell would have targeted, with a technology pathway (SMR) Shell was likely to pursue. Shell-addressable share is now structurally lower. The hypothesis is not falsified — material market remains — but the implementation path is harder."
decision_implication: "Recommend Shell H3 team accelerate partner conversations to avoid further lockouts. Specifically: assess whether Talen, Constellation, or X-energy remain available for Shell-aligned positioning. Time pressure has increased."
```

Confidence band moves from 0.55 to 0.42 — still amber, but on the negative side of midpoint with negative drift. The visual now shows pressure.

### 6.6 What the matrix tells us

After three signals, the hypothesis is in a meaningfully different state than when it started. The regulatory unlock (signal one) was the largest positive movement. The competitive entry (signal three) is the largest negative. The iteration signal (signal two) is noise.

The numeric probability framing would have produced confusing output: "60% to 75% to 76% to 70%." The visual framing produces clear output: amber-mid → green-high (regulatory unlock) → green-high (iteration noise) → amber-mid-slightly-negative (competitive pressure). The story is legible.

The narrative trail is also legible. Three signals, three documented appraisals, each with reasoning. A board reviewing this hypothesis can read the appraisal log and understand exactly why confidence moved when it did, and what would need to happen for it to move again.

---

## 7. Implementation considerations

This section is a sketch of how the matrix would be built into the live system. Detail belongs in ARCHITECTURE.md when the build is scoped properly.

### 7.1 Storage

The matrix lives in PG, in tables that map cleanly to Sections 2.1 (hypothesis-level) and 2.2 (observables). The v5 schema's Section A and Section C cover most of the hypothesis-level attributes; the observable matrix needs new tables (`hypothesis_observable`, `hypothesis_observable_signal_link`) because they are one-to-many extensions of the hypothesis row.

The confidence_band_history table records daily confidence positions per hypothesis, enabling the trajectory visualisation.

### 7.2 Routing and appraisal infrastructure

Routing (Section 5.1 step one) is a deterministic SQL or simple-rule operation. Given a signal, find candidate hypotheses by tag overlap. This belongs in the classifier module (current home: WF-15 Code nodes; target home: standalone classifier service).

Appraisal (step two) is the Claude API call with the structured prompt. The prompt template is large because it includes the full matrix; cost considerations apply (Section 7.4).

Application (step three) is database writes against PG plus the confidence-band update plus the signal classification logging.

### 7.3 Visualisation

The visual confidence bar (Section 4) needs a rendering layer. Most pragmatic implementation: an HTML tool (consistent with the existing platform) that reads PG and renders bars per hypothesis with the trajectory trail. Per-line bars expand on click to show the contributing observables.

A printed version (PNG export) for client briefs and dashboards needs equivalent rendering server-side or via headless browser.

### 7.4 Cost as a function of operating choice

The model is a two-stage staircase: cheap triage at the wide end (always-on, daily), targeted deep appraisal at the narrow end (cadence configurable per hypothesis, plus on-demand). Cost scales with the operator's configuration choices, not with the system as a fixed quantity.

**Triage stage — fixed cost.** Daily, ~2,205 raw signals. Each signal sent to a cheap reasoning model (Haiku-class) for relevance triage. Cost per call $0.001-0.003. Daily triage: $2-7. Annualised triage cost: $730-$2,550. This cost is the same regardless of how the appraisal cadence dial is set, because the news pipeline always runs.

**Routing stage — free.** Deterministic match of survived signals to candidate hypotheses. No Claude calls.

**Appraisal stage — variable.** Cost depends entirely on the per-hypothesis cadence settings and on-demand usage. Each appraisal call costs $0.05-0.10 (full matrix sent, structured output). What varies is how many calls run.

To anchor what configurations cost, three illustrative examples for a 118-hypothesis register:

*Lean configuration.* Most hypotheses on `weekly`, ~20 on `monthly` (CONSULTING and dormant CHRIS), maybe 5 on `daily` (active client engagements at peak). Estimated weekly appraisal calls: 60-90 across all cadences. Weekly appraisal cost: $4-9. Annualised appraisal: $200-470. **Annualised total (triage + appraisal): $930-$3,020.**

*Active configuration.* Active client hypotheses on `daily` (~30 hypotheses), INDUSTRY and most CLIENT on `weekly` (~70), CONSULTING and CHRIS on `monthly` (~18). Modest on-demand usage (say 20 single-hypothesis triggers per month plus 4 multi-hypothesis triggers per month covering ~20 hypotheses each). Annualised appraisal: $1,500-$3,500. **Annualised total: $2,230-$6,050.**

*Heavy configuration.* Most active and INDUSTRY hypotheses on `daily` (~70), some on `twice_weekly` (~30), CONSULTING on `weekly` (~18), heavy on-demand usage (50+ single-hypothesis triggers per month, weekly multi-hypothesis triggers). Annualised appraisal: $5,000-$10,000. **Annualised total: $5,730-$12,550.**

A sector-wide on-demand trigger across, say, 30 hypotheses costs $1.50-$3.00 per trigger. The bell-and-whistle bypass that produces coordinated breaking-event intelligence within minutes is functionally free relative to the engagement value it serves.

**The point of the dial.** Cost should match the engagement reality. The Shell H3 engagement is paying £330k. Spending an additional few thousand annually to run Shell hypotheses on `daily` cadence with frequent on-demand bypass is rounding error against that revenue. A CONSULTING hypothesis like "VW India market entry" running on `monthly` cadence costs almost nothing and earns its place by being ready when the conversation happens. The dial means the system never has to choose between cost and capability — it just settles where the operator decides each hypothesis warrants.

**The cost ceiling.** The numbers above assume the staircase works as designed. If triage misclassifies aggressively (too many false negatives) the system has a different problem than cost — it goes blind to real signals. If triage is too permissive (too many false positives surviving) the deep appraisal stage handles the slack at modest additional cost. Bias triage toward inclusion; the cost model absorbs it.

**The cost floor.** A more efficient appraisal variant sends a focused matrix view by default and escalates to full-matrix only when Claude flags potential cross-bucket impact. This drops appraisal cost by roughly half but adds complexity and risks missing cross-bucket effects. Recommended for later optimisation if cost ever becomes the binding constraint; not needed at the volumes this system operates at.

**Cost telemetry.** A small instrumentation layer tracks Claude API spend per hypothesis per period. The operator can see at a glance which hypotheses are running hot relative to their commercial value, and dial cadence down on the ones that aren't earning their cost. Telemetry is the feedback loop that keeps the dial honest.

### 7.5 Build sequencing

The model spec'd here is the destination. Getting from the current state (118 rows of bucket-layer scaffolding in PG, no observable matrix, no appraisal infrastructure) to the destination is a phased build.

Phase A: define the observable schema and add the tables to PG. Migration 003.

Phase B: build a tool (HTML, on the GitHub Pages platform) that lets an operator construct one hypothesis matrix from scratch by walking through a Shell H3 datacenter or similar worked example. Output written to PG.

Phase C: build the matrix-construction guidance (templates inheriting from sector-similar matrices, where they exist) so the second matrix is faster to build than the first.

Phase D-1: build the triage stage (signal → relevance check via Haiku-class) and the cadence machinery (per-hypothesis `appraisal_cadence` column, scheduler that queues appraisal calls per cadence). Integrate with existing WF-15A pre-Score or replace it.

Phase D-2: build the deep appraisal stage — Claude prompt with full matrix context, structured output handler, PG application of matrix updates and confidence movements. Wire on-demand single-hypothesis and multi-hypothesis triggers.

Phase E: visualisation. Confidence bars, trajectories, per-line drill-downs. Cost telemetry surface so the operator can see what each hypothesis is spending.

Phase F: feedback loop. Stale hypotheses flagged. Appraisal accuracy reviewed. Methodology refined where the appraisal surfaces gaps. Cadence rebalancing as the operator's experience reveals which hypotheses warrant which tempo.

Each phase is a session or two of work. The full build is several weeks of focused effort, not a single session.

---

## 8. Open questions, deferred

The role attribute on observables (unlock / iteration / supporting) is set at authoring time. How does it update as the hypothesis evolves? An observable that was supporting at authoring may become an unlock as other observables move. A static role tag misses this.

The matrix-to-matrix comparison for cross-engagement leverage. ARCHITECTURE.md Section 3.9 describes how a signal hitting a CLIENT hypothesis can route to multiple clients. The mechanism for matching matrices across companies in a sector is not yet specified. Best guess: matrices share observable definitions (the same TRL_PEM_electrolyser observable in Shell's matrix and BP's matrix is the same identifier), and cross-routing happens at the observable level.

The handling of contradictory signals. Two signals in the same day on the same observable, moving it in opposite directions. The batch appraisal handles this by giving Claude both signals at once; the per-signal pass would not.

The confidence band aggregation from per-line bars to overall. Specified as Claude's holistic judgement, not a formula. This is correct in principle but means two operators reviewing the same matrix could disagree about the overall position. Tolerance for this disagreement needs to be defined.

The decision threshold logic. When a hypothesis enters TRIGGER_READY, the system surfaces the window. What does "surface" mean — a Slack notification, a dashboard alert, an email to Chris, a flag in the morning brief? Probably all of them, but the contract needs to be defined.

Maverick CHRIS hypotheses. The matrix is designed for evidence-derived hypotheses. CHRIS hypotheses held maverick (without bottom-up provenance) may not have full matrices in the same shape. They need either a different structure or a tag that explicitly marks them as evidence-light.

---

## Document control

**Authored:** 29 April 2026, in conversation between Chris Guerin and Claude.
**Status:** Draft v1. Not yet validated by build or operator test.
**Next action:** review with fresh eyes; iterate Sections 2 (matrix structure), 5 (appraisal contract), 6 (worked example) based on review; scope phase A build (observable schema + PG migration 003).
**Cross-references:**
- METHODOLOGY.md — the procedure that produces the matrix.
- ARCHITECTURE.md Sections 3.5–3.7 — doctrine on signals, decision windows, trajectory.
- ARCHITECTURE.md Section 3.9 — the four-layer authoring model in which the matrix sits.
- ARCHITECTURE.md Section 8 — register-level context.
- shell_tech_radar_complete.xlsx — substrate for tech-line observable values in the worked example.
