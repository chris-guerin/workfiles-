# HEAT_MAPS_AND_GESTATION.md — the layer between matrices and research

**Status:** Draft v0. Authored 29 April 2026.
**Purpose:** Specify the operating layer between the hypothesis matrix system and published research. Heat maps surface candidate research areas; gestation is the human-led work of turning a candidate into a research piece worth publishing. This document defines the surfaces, the velocity attribute that makes them legible, and the framing that prevents the system from becoming a noise generator.
**Relationship to other documents:**
- METHODOLOGY.md defines how to build a hypothesis matrix from public sources.
- HYPOTHESIS_MATRIX_v1.md defines what a matrix is and how the appraisal contract operates per hypothesis.
- ARCHITECTURE.md Section 3 names doctrine on signals, decision windows, trajectory.
- This document defines what sits *above* the matrix layer — register-level views, signal-clustering surfaces, and the gestation discipline that converts patterns into publishable research.

---

## 1. Why this exists

The hypothesis matrix system answers one question well: given an existing hypothesis, what does today's signal flow tell us about it? The matrix is the structure, the appraisal is the work, the confidence band is the output. That loop runs continuously per hypothesis at the cadence the operator has dialled in.

But two questions sit outside the per-hypothesis loop and have to be answered from the register-level view, looking across many hypotheses at once:

**Where is attention being lost?** Some hypotheses stop moving. The signals that would update them aren't arriving, or the matrix isn't structured to catch the signals that are arriving. Either way, a hypothesis that hasn't moved in N weeks is a candidate for either retirement or restructuring. R7 in ARCHITECTURE.md already requires staleness flags. The register-level view is what makes R7 enforceable across 280+ hypotheses without operator overload.

**Where is attention being missed?** Signals cluster around topics, technologies, and actors. Sometimes the cluster matches an existing hypothesis (good — the matrix is doing its job). Sometimes the cluster matches no hypothesis at all. R3 in ARCHITECTURE.md names this case as embryo signals; the register-level view surfaces them as candidates for new hypothesis construction or for research investigation.

Both questions live in the gap between "what the system has thought about" and "what the world is actually doing." Heat maps are the surfaces that expose the gap. Gestation is what happens when an operator decides a gap is worth investigating.

---

## 2. The three-layer system

The Signal Engine has three layers, each with a different operating tempo and a different kind of output.

**Layer one — signals to matrices.** Continuous, automated, high-volume, judgement-bounded by the matrix structure. The Signal Engine's main loop. Per HYPOTHESIS_MATRIX_v1.md. Operating tempo: daily triage, per-hypothesis-cadence appraisal. Output: matrix updates, confidence band movements, ACT/MONITOR/IGNORE classifications.

**Layer two — heat maps to gestation.** Episodic. Surfaced by patterns in the signal flow that warrant fresh human attention. The system identifies candidates; the operator decides which to pursue. Operating tempo: weekly review of heat maps, ad-hoc investigation when a hot zone catches attention. Output: research questions, new hypotheses, hypothesis retirements, matrix restructurings.

**Layer three — gestation to research.** Judgement-driven, time-bounded, output is a publishable thesis that meets the three-part test. Operating tempo: matches the firm's commercial rhythm — research pieces published when they're ready, not on a schedule. Output: client briefs, intelligence notes, sector reports, LinkedIn posts, new hypotheses entering the register with full structure.

The three layers are sequenced, not interchangeable. Layer one cannot produce research; it produces matrix updates. Layer three cannot operate without inputs from layer two. Layer two is the bridge that turns continuous signal flow into episodic intellectual work.

---

## 3. The Gartner three-part test

Not every hot zone justifies a research piece. Gartner's long-standing test for what counts as a research topic remains the right bar:

**New.** The thing being said is something the audience does not already know or has not heard articulated this way. A heat map showing that "AI is hot" is not new; everyone already knows. A heat map showing that "AI datacenter cooling tech is consolidating around a specific liquid-cooling architecture that has implications for water supply chains" might be new.

**Worthy.** The thing being said is consequential — it changes how the audience should think about a problem, how they should allocate capital, or what they should be ready to advise on. Heat in itself is not consequential; the *implication* of the heat is what carries weight. "Capital is flowing into X" is not worthy on its own. "Capital is flowing into X at a rate that suggests a re-rating of the underlying physics is imminent, and the conventional wisdom about X is therefore on a clock" is worthy.

**Makes you do something.** The thing being said triggers an action. Not "interesting to read" but "I need to revise my position, change my plan, contact this client, build this hypothesis, retire that one." Research that doesn't change behaviour is news.

A heat zone passes the test when it surfaces one or more of:

- **Contradiction.** The signal flow contradicts a widely-held view. Either the consensus is about to be wrong or the signal flow is being misread. Either way, worth investigating.
- **Reframe.** The signal flow suggests an existing problem should be approached differently. The hot zone isn't really about what people think it's about; the underlying story is something else.
- **Imbalance.** Capital flow, regulatory attention, or executive commentary is concentrated in a different place from where the underlying physics, economics, or market readiness suggests it should be. Imbalances correct; the timing of correction is the research opportunity.

Three diagnostic categories, not exhaustive but covering the common cases. A hot zone that doesn't surface a contradiction, reframe, or imbalance probably doesn't justify a research piece — even if it's bright. Discipline at this gate is what prevents the system from generating noise dressed up as insight.

---

## 4. The heat map surfaces

Three register-level surfaces, each answering a different question.

### 4.1 Hypothesis stagnation map

**Question answered:** which existing hypotheses have stopped moving, and is that a problem?

**Data inputs:**
- `last_appraisal_at` from `hypothesis_register_v5`
- `appraisal_cadence` from same (sets the expected tempo per hypothesis)
- Time series from `confidence_band_history` showing position changes
- Signal routing volume per hypothesis (how many signals have been routed to this hypothesis in the last N weeks)

**Visualisation:** grid of hypotheses, one cell per hypothesis, coloured by stagnation severity. Severity is computed against the hypothesis's own expected tempo — a `monthly` cadence hypothesis with three months of stagnation is more anomalous than a `daily` cadence hypothesis with three weeks of stagnation. The map normalises against tempo so the colour is meaningful across cadences.

Hover or click on a cell shows: hypothesis name, register, current confidence band, weeks since last material movement, signal volume routed in trailing 8 weeks, and the per-line confidence bands so the operator can see whether stagnation is across the matrix or concentrated in one bucket.

**What this surfaces:**
- Hypotheses that should be retired (stagnant beyond expected tempo, no signals arriving, no commercial relevance).
- Hypotheses that should be reframed (the bucket-layer is missing observables that would catch movement happening in the world).
- Hypotheses that are correctly slow (long-cycle CHRIS bets on structural calls; stagnation matches expected tempo).

**The gestation prompt this generates:** "this hypothesis hasn't moved in N weeks. Is the world quiet on this topic, is the matrix incomplete, or is the hypothesis itself no longer interesting?" The operator decides which interpretation applies; the map cannot decide.

### 4.2 Embryo signal density map

**Question answered:** where in the signal flow are clusters forming that no hypothesis touches?

**Data inputs:**
- Signals from the daily triage flow (after triage, before routing)
- Existing hypothesis tag coverage (what topics, technologies, actors, and geographies the register currently has hypotheses about)
- A clustering pass that groups signals by topic similarity (probably Claude doing the synthesis, since cluster boundaries are not computable mechanically)

**Visualisation:** a 2D grid or treemap of topic-clusters. Each cluster is sized by signal volume and coloured by velocity. A cluster that has gone from 2 signals/week to 12 signals/week is bright (fast acceleration). A cluster at constant 15 signals/week is medium-coloured (high but stable). A cluster that has decayed from 20 to 3 is dim (decelerating).

For each cluster, the map indicates whether existing hypotheses cover it (overlay or border colour). Clusters with no hypothesis coverage are flagged distinctly — these are the embryo candidates per R3.

Hover or click shows the cluster's representative signals, the topic synthesis Claude produced, the velocity over trailing 4/8/12 weeks, and any existing hypotheses that partially cover the cluster (with the gap explicit).

**What this surfaces:**
- Embryo signals — clusters with no hypothesis coverage that warrant a new hypothesis or a research investigation.
- Coverage gaps — clusters partially covered by existing hypotheses where the matrix may be missing observables that would route the cluster's signals to the right place.
- Decaying topics — clusters that were hot and are cooling, which may indicate an existing hypothesis's relevance is fading.

**The gestation prompt this generates:** "this cluster of signals is forming around [topic] at [velocity] and no hypothesis touches it. Is this a contradiction with our register's coverage, a reframe of an existing area, or an imbalance worth investigating?"

### 4.3 World-versus-register gap map

**Question answered:** are there topics where the world is loud and the register is quiet, separately from full-cluster embryo cases?

**Data inputs:**
- Signal volume per topic area in the world (broad ingestion, before triage if the volume data is available; otherwise post-triage)
- Routing volume per hypothesis in the same topic area
- The ratio between the two, computed per topic over trailing 4/8/12 weeks

**Visualisation:** a matrix of topic areas (rows) versus measurement windows (columns), with each cell showing the ratio of world-volume to register-routing-volume. Cells where the ratio is unusually high are bright — the world is producing many signals about this topic but few of them are reaching any hypothesis matrix.

This surfaces a different problem from 4.2. Section 4.2 catches *new* topics with no existing coverage. Section 4.3 catches *existing* topics where the register's coverage is breaking down — the hypotheses that should be catching these signals aren't, because their tag coverage or matrix observables are incomplete.

**What this surfaces:**
- Tag coverage gaps — hypotheses that should be catching topic X but aren't because their tags don't match the language of the topic's signals.
- Matrix structural gaps — hypotheses that have the right tags but are missing observables that would let signals on this topic update them meaningfully.
- Genuinely quiet hypotheses where the world is also quiet (low ratio, no signal of register breakdown).

**The gestation prompt this generates:** "the world is producing N signals/week about [topic] and only M of them are reaching any hypothesis matrix (M much smaller than N). Why? Is the register's tag coverage incomplete, are existing hypotheses' matrices missing observables, or is there a coverage gap that warrants a new hypothesis?"

---

## 5. Velocity as a first-class concept

Velocity appears throughout the spec because position alone is insufficient at every layer.

**Per observable.** The rate of change of an observable's value over trailing 30 and 90 days, computed from the observable's update history. Rendered alongside current state in matrix views. Captured in the `velocity_30d`, `velocity_90d`, and `velocity_status` fields specified in HYPOTHESIS_MATRIX_v1.md Section 2.2.

**Per hypothesis.** The rate of change of confidence band over time, computed from `confidence_band_history`. Rendered as the trail behind the current marker on the per-hypothesis bar (HYPOTHESIS_MATRIX_v1.md Section 4.3). Sortable at the register level — "show me hypotheses moving fastest" regardless of current position.

**Per topic or zone.** The rate of change of signal density per topic cluster, computed from triaged signal flow. Rendered as the colour intensity in heat maps 4.2 and 4.3. Velocity is what makes a heat map useful rather than informational. A topic at constant high volume is news; a topic accelerating is a finding.

The three velocities are related but distinct. A hypothesis moving fast doesn't always indicate an underlying topic moving fast (sometimes one signal moves a hypothesis a lot because the signal hits an unlock observable; the topic itself may be stable). A topic moving fast doesn't always move all hypotheses that touch it (some matrices are structured to be sensitive to that topic's signals, others aren't). The three velocities together give a richer picture than any one alone.

**Acceleration matters more than velocity.** A topic that has been growing at 20 signals/week for six months is established; a topic that has gone from 2 to 12 signals/week in three weeks is breaking. The second derivative of the time series — acceleration — is what the heat maps should weight most heavily. Steady-state high volume is interesting; acceleration is urgent.

**Velocity status enum.** For both observables and topic clusters, a four-value status:
- `accelerating` — second derivative positive, rate of change is increasing
- `steady` — second derivative near zero, rate of change is stable
- `decelerating` — second derivative negative, rate of change is decreasing
- `static` — first derivative near zero, no meaningful change

Status thresholds are calibrated per scale type so they're meaningful across observable kinds. A TRL going from 4 to 5 in a quarter is fast for TRL; a market size going from $1B to $1.001B in a quarter is static for market size.

---

## 6. The gestation discipline

A heat map identifies a candidate. The candidate has to pass the three-part test before it earns research time. Gestation is the work of running the test.

### 6.1 The gestation prompt

Every candidate surfaced by the heat maps comes with a gestation prompt — a structured question (or set of questions) the operator works through. The prompts are templated by surface type:

- Stagnation prompts ask "should this hypothesis live, change, or die?"
- Embryo prompts ask "what is this cluster about, and is there a contradiction, reframe, or imbalance worth investigating?"
- Gap prompts ask "why isn't the register catching this, and what would need to change?"

The prompts are not answers. They're the questions that orient the operator's investigation.

### 6.2 Gestation sessions

A gestation session is the operator (Chris, an analyst, or a small team) sitting with a candidate, working through the prompt, and reaching one of four outcomes:

- **Promote to research.** The candidate passes the three-part test. A research piece is scoped, drafted, published. The hypothesis register may gain new hypotheses as a side effect of the research.
- **Promote to hypothesis.** The candidate doesn't justify a standalone research piece but warrants a new hypothesis in the register. The hypothesis is constructed via METHODOLOGY.md's procedure and added.
- **Restructure existing hypothesis.** The candidate reveals a coverage gap in an existing hypothesis. The hypothesis's matrix gets new observables, updated tags, or revised role assignments to catch the signals it was missing.
- **Dismiss.** The candidate doesn't pass the three-part test. The signal flow is real but doesn't yield a contradiction, reframe, or imbalance worth pursuing. The candidate is logged as dismissed with reasoning, so future surfacing of the same pattern can reference the prior assessment.

Dismissals are not failures. Most candidates dismiss. The discipline of running the test even when the answer is "no" is what keeps the system from becoming a noise generator.

### 6.3 Gestation log

Every gestation session produces a log entry with:
- The candidate that triggered the session (which heat map, which cluster or hypothesis)
- The gestation prompt
- The investigation summary (what was looked at, what was found)
- The outcome (promote / restructure / dismiss)
- The reasoning
- Timestamp and operator

The log is searchable. Future heat maps surfacing similar candidates can reference prior assessments — "this cluster looks similar to something dismissed three months ago; here's the prior reasoning" — preventing redundant gestation on the same patterns.

The log also feeds methodology refinement. If the system frequently surfaces candidates that always dismiss, the heat-map heuristics may need tuning. If it frequently misses candidates that operators surface manually, the heuristics may need expansion. The log is the feedback mechanism that lets the surfaces improve over time.

---

## 7. What this layer does NOT do

**It does not write research.** The output of this layer is candidate identification and gestation prompts. The research itself is human work. The model's role is to surface what to investigate; the investigation and the writing are for the operator.

**It does not autonomously create hypotheses.** Embryo signals from heat map 4.2 are candidates for new hypotheses, not new hypotheses themselves. METHODOLOGY.md's procedure is what produces hypotheses, run by an operator. The heat map surfaces the trigger.

**It does not replace operator judgement on the three-part test.** "New, worthy, makes you do something" is a judgement call. The system can surface velocity, density, contradiction patterns, and prior assessments, but it cannot determine whether something passes the test. That judgement is what the operator brings.

**It does not generate "weekly insights" automatically.** Heat maps surface where attention should go; what actually goes into client-facing intelligence comes from the matrix appraisal layer (per HYPOTHESIS_MATRIX_v1.md) for existing hypotheses, and from gestation outcomes for new findings. Nothing on this layer publishes itself.

The boundary is deliberate. Tools that auto-generate "insights" reliably produce insights nobody acts on, because the test of consequence (the third Gartner criterion) requires human judgement that the tool cannot supply. Surfacing without auto-publishing keeps the system honest.

---

## 8. Implementation considerations

### 8.1 What's needed to build this

**Heat map 4.1 (stagnation):** computable today after migration 003 commits. Existing data: `last_appraisal_at`, `appraisal_cadence`, `confidence_band_history`. Visualisation is a query plus a rendering tool. Probably an extension of the matrix visualisation tool rather than a separate page.

**Heat map 4.2 (embryo signal density):** needs a clustering pass over triaged signals. Probably Claude doing weekly synthesis on the trailing signal flow, producing topic clusters with representative signals and velocity. Needs an `hypothesis_embryos` table per R3 in ARCHITECTURE.md (not yet built; sits in a v5.6 or 004 migration). Visualisation is a treemap or 2D grid.

**Heat map 4.3 (world-versus-register gap):** needs broad ingestion volume data per topic, ideally pre-triage, plus per-hypothesis routing volume. Some of this is computable from existing data; some needs additional instrumentation in the triage layer. Visualisation is a heatmap matrix.

**Gestation log:** needs a `gestation_log` table. Schema is straightforward (candidate ref, prompt, summary, outcome, reasoning, operator, timestamp). Probably part of a v5.6 batch migration.

**Velocity infrastructure:** needs the time-series queries that compute velocity over trailing 30/90 days for observables and confidence bands. Computable today after migration 003. Performance considerations may apply at scale (118 hypotheses × N observables × daily updates produces a non-trivial query load); likely needs materialised views or summary tables that pre-compute velocity and refresh nightly.

### 8.2 Build sequence

The build sequence in HYPOTHESIS_MATRIX_v1.md Section 7.5 covers phases A through F for the matrix system. The gestation layer adds:

**Phase G:** velocity computation infrastructure. Materialised views or summary tables that pre-compute observable and confidence-band velocities. Refreshed nightly. Read by the visualisations.

**Phase H:** stagnation heat map (4.1). Builds on phase G. Lowest risk, most immediately useful, computable from existing data.

**Phase I:** embryo signal clustering and heat map 4.2. Needs Claude synthesis pass on triaged signals. Higher cost (regular Claude calls for clustering), higher value (this is where new research opportunities surface).

**Phase J:** world-versus-register gap map (4.3). Builds on phases G and I.

**Phase K:** gestation log and prompt templates. Probably a small HTML tool that lets operators record gestation sessions against candidates.

**Phase L:** feedback loop from gestation log into heat-map heuristic tuning. Long-tail; only worth building after enough gestation history exists to learn from.

Phases G and H together are probably one focused session. Phase I is a session of its own (clustering is a real design task). J, K, L are subsequent.

### 8.3 Cost considerations

Velocity infrastructure (phase G) is computational only; no Claude calls. Cost-free.

Stagnation heat map (phase H) is also Claude-free. Cost-free.

Embryo clustering (phase I) is the only place this layer adds Claude cost. Probably one synthesis pass per week over triaged signals (~85/day × 7 days = ~600 signals to cluster). That's one Claude call with a reasonable input size, maybe $0.20-0.50 per week, $10-25 annualised. Negligible.

The gap map (phase J) is computational. Cost-free.

The total Claude cost of the gestation layer is dominated by the weekly clustering pass, which is rounding error against the matrix appraisal costs (HYPOTHESIS_MATRIX_v1.md Section 7.4). Adding gestation surfaces does not materially change the system's annual operating cost.

---

## 9. Open questions, deferred

The clustering algorithm for embryo detection (heat map 4.2). Cluster boundaries are not computable mechanically; they require synthesis. Claude is probably the right tool but the prompt template hasn't been designed and the failure modes haven't been characterised. First implementation should be conservative — over-cluster rather than under-cluster, let the operator merge or split clusters during gestation.

The relationship between gestation outcomes and the methodology. When a gestation session produces a new hypothesis, the methodology procedure should run on the new hypothesis. When gestation produces a research piece, the research may itself spawn new hypotheses. The flow between gestation outputs and METHODOLOGY.md's inputs needs to be specified.

The interaction between gestation and the four-layer authoring model (ARCHITECTURE.md Section 3.9). A gestation session that promotes to a new hypothesis — which register does it go into? CLIENT (if tied to an engagement)? INDUSTRY (if a sector pattern)? CONSULTING (if a positioning bet)? The gestation log probably needs to record the register choice and the reasoning.

The cadence of gestation review. The matrix appraisal has a configurable cadence per hypothesis (HYPOTHESIS_MATRIX_v1.md Section 5.5). Gestation review probably runs at a consistent cadence regardless — weekly review of all heat maps, with on-demand investigation when something hot catches attention. But the cadence isn't specified yet.

The boundary between gestation and engagement. A research piece produced from gestation may be commercially valuable to a specific client. Is that triggered as part of gestation, or does it become an engagement-conversion task that lives outside this layer? The boundary affects how gestation outcomes get routed to the commercial side of the firm.

The accuracy test for heat-map utility. METHODOLOGY.md Section 11 specifies an 80% accuracy bar for the procedure. The equivalent test for heat maps is "do they surface candidates that pass the three-part test at a rate that justifies the operator time spent on gestation?" This is harder to measure but worth defining; without it, the heat maps could become a time sink the operator stops trusting.

The dismissal log's effect on operator behaviour. If the system consistently surfaces patterns that the operator dismisses, the system needs to learn from that. If the system never surfaces patterns the operator finds independently, that's also a failure mode. The feedback loop from gestation log into heat-map heuristic tuning (phase L) is real but unspecified.

---

## Document control

**Authored:** 29 April 2026, in conversation between Chris Guerin and Claude.
**Status:** Draft v0. Sibling to HYPOTHESIS_MATRIX_v1.md. Not yet validated by build.
**Next action:** review with fresh eyes; iterate the heat map definitions (Sections 4.1-4.3) and the gestation discipline (Section 6) based on review; scope phase G/H build (velocity computation + stagnation map) as the lowest-risk highest-value first build.
**Cross-references:**
- HYPOTHESIS_MATRIX_v1.md — the per-hypothesis layer this document sits above. Velocity additions in HM Sections 2.2 and 4.3 are the per-observable and per-hypothesis velocity infrastructure that this document's heat maps consume.
- METHODOLOGY.md — the procedure that produces hypotheses; gestation outcomes feed back into this when new hypotheses are promoted.
- ARCHITECTURE.md Section 3.9 — the four-layer authoring model; gestation outcomes choose a register.
- ARCHITECTURE.md R3 — embryo signals must go to `hypothesis_embryos` table (not yet built); heat map 4.2 is the surface that makes R3 actionable.
- ARCHITECTURE.md R7 — stale hypotheses must be flagged; heat map 4.1 is the surface that makes R7 enforceable.
