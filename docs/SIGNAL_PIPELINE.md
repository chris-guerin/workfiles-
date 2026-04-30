# Signal pipeline — news to model state

**Version:** 1.0
**Status:** Pipeline specification. Defines the procedure for converting news articles and other inputs into structured signals that update the initiative model.
**Audience:** Anyone implementing or operating the signal flow — analysts reviewing assessments, developers building the pipeline, AI systems with no other context.
**Reading order:** Depends on INITIATIVE_MODEL.md (defines the model the pipeline updates) and INITIATIVE_METHODOLOGY.md (defines how the model gets populated). Read both first. This document defines what happens after population, when the world starts producing signals.

---

## 1. Purpose of this document

The initiative model is a static snapshot until signals start arriving. The signal pipeline is the mechanism that converts streaming news into structured updates to the model.

A signal is a structured object that describes: what news arrived, which entity it bears on, what claim it speaks to, in what direction, with what magnitude, and with what assessment confidence. Signals are applied to the model via the behaviour rule defined in INITIATIVE_MODEL.md section 4.

The pipeline turns roughly 2,000+ articles per day across relevant sources into a small number of model-affecting signals — typically 5-30 per day across the active register, depending on activity. Most articles drop out at early filtering stages. Those that survive are assessed against specific claims and produce defined deltas.

This document specifies the procedure. The n8n implementation of the procedure lives in N8N_IMPLEMENTATION.md.

This document does not cover:

- The data model the pipeline updates. See INITIATIVE_MODEL.md.
- The procedure for initially populating the model. See INITIATIVE_METHODOLOGY.md.
- How the procedure runs as workflow nodes in n8n. See N8N_IMPLEMENTATION.md.
- A complete worked example. See WORKED_EXAMPLE_SHELL_H3.md.

## 2. The signal object

A signal is the unit of input to the model. The full signal schema:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Convention: `sig_YYYYMMDD_descriptor` (e.g. `sig_20260430_gasunie_pipeline_slip`). |
| `source_url` | string | URL of the article or document the signal was derived from. |
| `source_title` | string | Original title or headline. |
| `source_excerpt` | text | The specific passage from the source that supports the signal assessment. Required for audit trail. |
| `source_published_at` | timestamp | When the source was published. |
| `ingested_at` | timestamp | When the source was ingested into the pipeline. |
| `target_entity` | string (FK) | The entity ID this signal routes to. |
| `claim_being_assessed` | text | The specific claim from the (initiative, entity) link that this signal speaks to. |
| `direction` | enum | `+1` (supports the claim), `-1` (undermines the claim), `0` (neutral, see below). |
| `magnitude` | enum | `incremental`, `material`, `structural`. See section 5.2. |
| `assessment_confidence` | enum | `low`, `medium`, `high`. See section 5.3. |
| `assessment_reasoning` | text | One-to-two sentence explanation of why this signal carries this direction, magnitude, and confidence. Required for audit trail. |
| `new_state` | enum | What state the target entity should transition to after this signal applies. May be unchanged. |
| `applied_at` | timestamp | When the signal was applied to the model. Null if not yet applied. |
| `applied_by` | string | Identifier for the analyst or system that applied it. |
| `delta_per_initiative` | json | Map of initiative_id to delta value, computed at application time. Recorded for audit. |

A direction of `0` is reserved for signals that touch an entity but don't directionally affect any specific claim. These are recorded but produce zero delta. Used sparingly — most assessable signals will be `+1` or `-1`.

The signal object is the audit trail. When a confidence band moves on an initiative, the corresponding signal records contain the source URL, the excerpt, the claim assessed, and the reasoning. Anyone querying "why did Shell H3 hydrogen confidence drop last week" can answer from the signal log alone.

## 3. The pipeline overview

Six steps from article to applied signal:

1. **Ingestion** — articles enter the pipeline from configured sources.
2. **Triage** — cheap classification decides whether the article touches any active initiative.
3. **Entity routing** — for articles that pass triage, identify which specific entity the article bears on.
4. **Claim assessment** — for the (article, entity) pair, assess against the relevant link claim(s).
5. **State determination** — given the assessment, determine the resulting entity state.
6. **Model application** — the signal is applied via the behaviour rule.

Steps 1, 2, 3, 5, and 6 are largely deterministic or lightweight Claude calls. Step 4 is the substantive Claude work — where the article actually gets read against the claim. Most quality and consistency questions live in step 4.

Each step has a defined input, procedure, and output. Failure at any step routes the article to a hold queue for human review rather than failing silently.

---

### Step 1 — Ingestion

**Input:** configured news sources (RSS feeds, API endpoints, search queries against news platforms, sector-specific feeds, regulatory body feeds, company IR pages).

**Procedure:**

Sources are polled at configured intervals. New articles are deduplicated against the recent ingestion log (URL match plus title fuzzy match for syndicated content). Each article enters the pipeline as a record with raw text, URL, title, source name, and timestamp.

**Source coverage expectations:**

For an energy-sector active register:
- Reuters energy, Bloomberg energy, FT Alphaville, Wall Street Journal energy section.
- Sector-specific: Hart Energy, Argus Media, ICIS, S&P Global Commodity Insights.
- Regulatory: European Commission press releases, IRS announcements, FERC, BSEE, Alberta Energy Regulator.
- Company IR: Shell, BP, ExxonMobil, Chevron, Equinor, TotalEnergies, Eni IR pages.
- Wires: PR Newswire energy, Business Wire energy.
- Competitor analysis: Wood Mackenzie, Rystad Energy commentary (where accessible).

Daily volume across the above is typically 500-2,500 articles depending on news cycle. Most will drop at triage.

**Output:**

Each article enters the pipeline with a record of source metadata and full raw text.

---

### Step 2 — Triage

**Input:** ingested articles from step 1.

**Procedure:**

Cheap classification (Claude Haiku-class or equivalent) reads each article and decides:
- DROP — the article does not plausibly touch any active initiative or entity in the catalogue.
- PROPAGATE — the article touches at least one active initiative or entity. Returns a list of candidate entity IDs.

The triage prompt is brief — title, first three paragraphs, plus the list of active entity IDs and their names. The Claude call returns a structured response with DROP or PROPAGATE plus candidate entity IDs.

**Triage prompt structure:**

```
Given the following article and list of tracked entities, classify the article.

ARTICLE TITLE: [title]
ARTICLE FIRST PARAGRAPHS: [first 3 paragraphs]
TRACKED ENTITIES: [list of entity IDs and names]

Return JSON:
{
  "classification": "DROP" | "PROPAGATE",
  "candidate_entities": [array of entity IDs from the tracked list],
  "reasoning": "one sentence why"
}
```

**Quality controls:**

- False-drop rate (should-have-propagated articles classified DROP) is monitored. A weekly sample of dropped articles is reviewed by analyst; if false-drop rate exceeds 5%, retune the triage prompt.
- False-propagate rate (truly irrelevant articles classified PROPAGATE) is tolerable up to ~30% because step 3 catches most of these.

**Output:**

Articles classified PROPAGATE proceed to step 3 with their candidate entity list. DROP articles are logged but discarded.

---

### Step 3 — Entity routing

**Input:** PROPAGATE articles with candidate entity lists from step 2.

**Procedure:**

For each candidate entity from step 2, decide whether the article actually bears on that entity (versus mentioning it incidentally). For articles that touch multiple entities, each entity gets its own routing decision.

This step uses a slightly more expensive Claude call (Sonnet-class) because the discrimination is finer:

- Does the article describe a *change* in the entity's state, condition, or trajectory?
- Or does it just *mention* the entity as background?

A change-describing article routes to step 4 for that entity. A mention-only article does not — entity routing is conservative because the assessment work in step 4 is expensive.

**Routing prompt structure:**

```
Given the article and the entity, decide if the article describes a change in the entity's state.

ARTICLE: [full text]
ENTITY: [entity name, type, current state, threshold]

Return JSON:
{
  "routes_to_entity": true | false,
  "reasoning": "why this article does or does not bear on this entity",
  "key_excerpt": "the specific passage that bears on the entity (if true)"
}
```

The `key_excerpt` field becomes the `source_excerpt` on the signal if the article routes through. This excerpt is the audit trail.

**Output:**

For each (article, entity) pair where routes_to_entity is true, a routing record is created with the article, the entity, and the key excerpt. These proceed to step 4.

---

### Step 4 — Claim assessment

**Input:** routing records from step 3.

**Procedure:**

This is the substantive Claude work. For each (article, entity) pair, identify the link(s) from initiatives to that entity and assess the article against each link's claim.

A single entity may be linked from multiple initiatives. Each link has its own claim. The assessment runs once per link, because the same article may speak differently to different claims.

**Assessment prompt structure:**

```
Given the article excerpt, the entity, and the specific claim being assessed, evaluate.

ARTICLE EXCERPT: [excerpt from step 3]
ENTITY: [entity name, current state, threshold]
INITIATIVE: [initiative name and brief context]
CLAIM: [the specific claim from this initiative's link to this entity]

Evaluate:
1. Direction: does this excerpt support, undermine, or have neutral relationship to the claim?
2. Magnitude: how substantively does this excerpt affect the claim?
3. Assessment confidence: how confident are you in this assessment?

Return JSON:
{
  "direction": +1 | -1 | 0,
  "magnitude": "incremental" | "material" | "structural",
  "assessment_confidence": "low" | "medium" | "high",
  "reasoning": "one or two sentences explaining the call"
}
```

The assessment is per-link, not per-entity. A signal updating the EU Hydrogen Backbone entity might be material-negative for Shell's NW European hydrogen play (gating dependency) and incremental-negative for some other initiative that has Backbone as a non-critical link. The same excerpt produces different signal records for each link.

**Quality controls:**

- Random sample of assessments reviewed weekly by analyst.
- Disagreement rate between Claude and analyst review tracked over time.
- Calibration prompts may be added if specific assessment errors recur.

See section 5 for detailed guidance on direction, magnitude, and assessment confidence.

**Output:**

Per (article, link) pair, a structured assessment with direction, magnitude, confidence, and reasoning. Each becomes a candidate signal proceeding to step 5.

---

### Step 5 — State determination

**Input:** candidate signals with assessments from step 4.

**Procedure:**

For each candidate signal, determine the resulting state of the target entity. This is the state transition that the signal triggers if applied.

**State transition rules:**

The state transitions follow a defined state machine:

| Current state | Material/structural negative signal | Incremental negative signal | Material/structural positive signal | Incremental positive signal |
|---|---|---|---|---|
| `holding` | → `weakening` | → `weakening` (typically) | stays `holding` | stays `holding` |
| `weakening` | → `broken` | stays `weakening` (typically) | → `holding` (if substantive) | stays `weakening` |
| `broken` | stays `broken` | stays `broken` | → `weakening` (if substantive) | stays `broken` |
| `ambiguous` | → `weakening` | → `weakening` (typically) | → `holding` (if substantive) | stays `ambiguous` |

Boundaries are discretionary — "if substantive" means analyst or assessment-confidence-high judgment. A single weak positive signal does not flip a `broken` entity to `weakening`; it takes accumulated positive evidence.

**Assessment confidence acts as a damper:**

If assessment_confidence is `low`, the transition rules above apply more conservatively. A material-negative low-confidence signal might keep the entity at `holding` rather than moving to `weakening` — the system waits for confirmation before transitioning.

If assessment_confidence is `high`, transitions can be more aggressive. A material-negative high-confidence signal on a `weakening` entity can move it to `broken` even on first signal.

**Output:**

Each candidate signal has its `new_state` field populated. If the new state is the same as the entity's current state, the signal still gets recorded but doesn't trigger a state transition.

---

### Step 6 — Model application

**Input:** candidate signals with new_state determined from step 5.

**Procedure:**

For each candidate signal:

1. Compute the delta per initiative using the behaviour rule from INITIATIVE_MODEL.md section 4. The signal targets one entity; the entity is referenced by one or more links from initiatives; each link produces a delta.

2. Apply the deltas to the affected initiatives' `current_confidence` values.

3. Update the target entity's state to `new_state`.

4. Record the signal with all fields populated, including `applied_at`, `applied_by`, and `delta_per_initiative`.

5. Trigger any downstream notifications (analyst alerts for material moves, dashboard updates).

**Application is atomic per signal.** If multiple signals are queued, they apply in order of `ingested_at` timestamp. The behaviour rule is order-independent for confidence, but state transitions can compound (a `holding` entity hit by two material negatives moves through `weakening` to potentially `broken`).

**Reversibility:**

Signals can be unapplied. Unapplication subtracts the recorded `delta_per_initiative` and restores the entity state to the prior state recorded before this signal was applied. Unapplication is used for analyst override (signal was wrongly applied) and for the model's reset capability.

**Output:**

Each signal is now in applied state with full audit trail. Affected initiatives have updated current_confidence. Affected entities have updated state.

---

## 4. The audit trail

Every confidence band movement traces back through:

- The signal record (with source URL, excerpt, claim assessed, reasoning, direction, magnitude, confidence).
- The link the signal targeted (with role, criticality, impact, claim).
- The entity (with current state, threshold, note, sources).
- The initiative (with hypothesis statement, decision threshold, time horizon).

A query of "why did SHELL_H3_HYDROGEN_NWE confidence drop on 30 April 2026?" returns: the list of signals applied that day, each with full source context. A query of "what's our current view on PEM electrolysis?" returns the entity's current state, the recent signals affecting it, and the initiatives whose claims depend on it.

The audit trail is what makes the system defensible to clients. A client asking why we believe what we believe can be answered from the data — specific articles, specific assessments, specific reasoning — not from analyst memory.

## 5. Assessment quality dimensions

The three quality dimensions on a signal — direction, magnitude, assessment_confidence — each carry specific operational meaning. Misuse of any one degrades the system's behaviour.

### 5.1 Direction

Three values: `+1`, `-1`, `0`.

`+1` means the signal supports the claim being assessed. The claim is more likely true after this signal than before.

`-1` means the signal undermines the claim. The claim is less likely true after this signal than before.

`0` is reserved for signals that touch an entity but don't speak to a specific claim. Used rarely. Most assessable signals will be +1 or -1.

**Direction is relative to the claim, not to the entity.** This matters for threatening external entities. The claim for "DRI without hydrogen" might be "non-H2 DRI does NOT reach commercial scale before 2030." A signal that Boston Metal achieved a commercial-scale pilot is a `-1` direction signal — it undermines the claim. A signal that Boston Metal abandoned its commercial timeline is `+1` — it supports the claim.

This is the consistent interpretation: direction is always assessed against the claim text, regardless of role or impact.

### 5.2 Magnitude

Three values: `incremental`, `material`, `structural`.

**Incremental** — the signal is small evidence in the directional sense. One data point, one minor announcement, one preliminary indicator. Normal market noise. Routine FID announcements at expected scale, expected regulatory implementation milestones, normal corporate updates.

**Material** — the signal is substantive evidence. A meaningful FID at notable scale, a regulatory announcement that affects multiple actors, a project delay measured in months not weeks, a technology cost-down or cost-up inflection. Most signals worth recording fall in the material category.

**Structural** — the signal is a major change to the underlying conditions. A regulatory framework collapsing, a company structurally exiting a sector, a technology breakthrough that shifts cost economics by a large factor, a major project cancellation. Rare; high impact.

**Magnitude is not a function of the entity's importance.** Even on a non-critical entity, a structural signal is structural. The behaviour rule weights the signal by criticality (which captures entity importance) and by magnitude (which captures the signal's substance) separately. Don't conflate them.

The current v1 behaviour rule does not yet apply magnitude as a multiplier (per INITIATIVE_MODEL.md section 4.5). Magnitude is recorded for future v2 rule incorporation and for analyst review of signal quality.

### 5.3 Assessment confidence

Three values: `low`, `medium`, `high`.

**High** — the assessment is well-grounded. The article excerpt is unambiguous. The claim's relationship to the excerpt is clear. The direction, magnitude calls are obvious from the text.

**Medium** — the assessment requires some interpretation. The article isn't directly about the claim but bears on it. The direction is clear but magnitude is debatable, or vice versa. Most assessments fall in medium.

**Low** — the assessment requires substantial inference. The article touches the entity tangentially. The direction is inferred from secondary implication. Magnitude is hard to call. The signal might be relevant or might not.

**Low-confidence signals damp state transitions.** A low-confidence assessment moves entity state more conservatively than a high-confidence one (per section 3 step 5). The behaviour rule's v1 form does not yet apply assessment confidence as a multiplier; v2 will.

**When to call low-confidence:**

- Article quality is thin (rumour, speculation, single-source).
- The article's framing is journalistic narrative rather than reportage of specific facts.
- The relationship between the article's content and the claim being assessed requires multiple inferential steps.
- The analyst (or Claude) genuinely doesn't have enough context to be confident.

Low-confidence signals are still recorded and applied. They contribute less to confidence movement but they're not dropped — accumulated low-confidence evidence in one direction is still evidence.

## 6. Special signal types

### 6.1 Bulk signals from corporate disclosures

When a company publishes its annual report or holds capital markets day, a single document may contain dozens of signal-relevant statements. The pipeline handles these as multiple signals derived from the same source.

The source_url is the same for all derived signals. The source_excerpt differs per signal (each signal cites the specific passage). The signals are otherwise treated as independent — each routes to its target entity, each gets its own assessment.

For audit purposes, the signals retain a `source_document_id` field linking them so the cluster can be queried as one event.

### 6.2 Regulatory announcements

Regulatory announcements often affect many initiatives across companies. EU regulatory packages, IRS guidance, FERC orders. The pipeline treats these as fan-out signals — one announcement, many target entities, many derived signals.

Each derived signal goes through steps 3-6 independently. Some affected entities will see material signals; others will see incremental. Each (entity, claim) assessment is its own work.

### 6.3 Cluster signals (waves of coverage)

Sometimes a single underlying event produces multiple articles across multiple sources. The Gasunie pipeline slip announcement produced Reuters, FT, Bloomberg, and Argus articles within 48 hours. The pipeline's deduplication catches exact-URL duplicates but not coverage of the same event from different sources.

For cluster signals, the analyst review process flags duplicates and consolidates. The first article assessed becomes the canonical signal; subsequent coverage is logged as referencing the same underlying event but doesn't produce additional model deltas.

This is a manual quality control. Future pipeline versions may add automated cluster detection.

### 6.4 Negative signals — the absence of expected events

Some signals are about what didn't happen. An expected FID that didn't materialise. A regulatory timeline that slipped past its target. A project announcement that was deferred.

Absence-of-event signals require explicit construction — they don't arrive as articles. The pipeline includes a periodic check (typically monthly) of timeline-anchored claims. For each claim with a date threshold, the system checks whether the threshold has been met. Claims approaching or past their threshold without supporting evidence generate absence signals (direction -1, magnitude calibrated to time-past-threshold).

This is what catches the slow-failure case: an initiative quietly degrading because expected milestones aren't being hit, even though no specific negative news has appeared.

## 7. Operating expectations

### 7.1 Daily volume

For the energy-sector active register at populated scale (5-8 companies, 60-100 initiatives, 200-300 entities):

- Step 1 ingestion: 500-2,500 articles per day.
- Step 2 triage: 80-95% drop rate. 50-300 articles propagate.
- Step 3 routing: ~30-50% of propagated articles route to at least one entity. Some route to multiple. 20-150 routing records per day.
- Step 4 assessment: 1-2 assessments per routing record on average (most entities are linked from 1-2 initiatives). 20-300 assessments per day.
- Step 5 state determination: same volume as step 4.
- Step 6 application: 5-30 signals applied per day after analyst review (more in active news cycles).

The funnel narrows steeply. Most of the daily volume is filtered before reaching the substantive assessment work.

### 7.2 Latency expectations

- Step 1 ingestion: real-time to hourly depending on source.
- Step 2 triage: same-day, batch processed.
- Step 3 routing: same-day.
- Step 4 assessment: same-day for high-volume sources, next-day for thorough sourcing review.
- Step 5-6: applied within 24 hours of assessment for most signals; immediate for high-priority ones (structural signals, signals affecting active client engagements).

The pipeline is not real-time. It's near-real-time for most material signals, with structural signals expedited.

### 7.3 Analyst review touchpoints

Analyst review at three points:

- **Triage sample review** (weekly): random sample of DROP classifications reviewed for false-drop. Adjustment of triage prompt if needed.
- **Assessment review** (daily): all material and structural signals reviewed before application. Incremental signals batch-reviewed weekly.
- **State transition review** (per-transition): any signal that triggers a state transition (especially `holding` → `weakening` or `weakening` → `broken`) is reviewed before application.

Analyst override is available at any point. The pipeline is designed to make analyst time efficient — most articles never reach analyst review because they drop at triage or routing. Analyst attention focuses on the small number of signals that actually move the model.

### 7.4 Drift management

State assignments and assessment patterns can drift over time as different analysts work different sources or as Claude prompts evolve. Three controls:

- **Quarterly recalibration**: random sample of past 90 days' signals reviewed. Direction, magnitude, confidence calls assessed for consistency. Drift documented.
- **Cross-analyst comparison**: when multiple analysts review the same signals, divergence rate measured. High divergence flags need for tighter assessment guidelines.
- **Prompt version control**: every change to triage, routing, or assessment prompts is versioned. Signal records include the prompt version that produced them, so drift is attributable.

## 8. Anti-patterns and failure modes

### 8.1 Pipeline failure modes

**Triage too aggressive (high false-drop rate).** Signals that should affect the model never enter. Mitigation: weekly drop-sample review, prompt retuning.

**Triage too permissive (high false-propagate rate).** Step 3 carries too much load. Mitigation: tighter triage prompt with more specific entity context.

**Routing accepting marginal mentions.** Articles that just mention an entity get routed to assessment, producing weak signals that clutter the audit trail. Mitigation: routing prompt explicitly requires "describes a change" not just "mentions."

**Assessment under-calling magnitude.** All signals come back as `incremental`, model never moves. Mitigation: calibration examples in assessment prompt with anchor cases ("the Gasunie pipeline slip is structural for this initiative because...").

**Assessment over-calling structural.** Routine news gets assessed as structural, model overreacts. Mitigation: explicit rarity guidance in prompt, structural reserved for genuinely paradigm-changing events.

### 8.2 State machine failure modes

**Stuck in ambiguous.** Mixed signals keep an entity in `ambiguous` indefinitely. Mitigation: review entities in ambiguous state for >90 days; force a call (`holding` or `weakening`) if the ambiguity has resolved or if the analyst has formed a view.

**Oscillation.** State flips back and forth on conflicting signals. Mitigation: state transitions require either material/structural signals or accumulated incremental signals — single weak signals don't flip state.

**Stuck in broken.** Once `broken`, very hard to move back to `weakening` or `holding`. Mitigation: explicit reset criteria — a structural positive signal can move `broken` to `weakening`; sustained positive trend over 6+ months can move further.

### 8.3 Audit trail failure modes

**Missing source excerpt.** Signal applied without the supporting passage recorded. Audit trail breaks. Mitigation: pipeline rejects signals without `source_excerpt` populated.

**Vague reasoning.** Assessment reasoning is "the article seems negative" without specifics. Audit trail is unreviewable. Mitigation: assessment prompt requires specific reasoning anchored to excerpt and claim.

**Lost provenance on bulk signals.** Annual report produces 30 signals with the same URL but unclear which signal cites which passage. Mitigation: each signal must have its own distinct excerpt even if the source URL is shared.

## 9. Pipeline-to-methodology feedback loops

The pipeline can surface issues that flow back to methodology:

- **Frequent triage misses for a particular entity** suggests the entity is mis-named or its tracked content is wrong. Update entity name/note in INITIATIVE_METHODOLOGY.md step 8 procedures.

- **Frequent assessment difficulty for a particular claim** suggests the claim is too vague to assess. Rewrite the claim to be more specific. The four-component format is the discipline.

- **Persistent low confidence on assessments** for an entity suggests either thin sourcing or the entity is too abstract. Either accept the limitation or split the entity into more specific sub-entities.

- **Signals routing to entities that produce minimal model movement** (everything is non-critical) may indicate criticality assignments are too conservative. Methodology review.

The pipeline operating at scale exposes methodology gaps that are invisible during initial population. Treat the pipeline as a continuous methodology test.

## 10. Versioning

This is version 1.0 of the signal pipeline, paired with v1.0 of INITIATIVE_MODEL.md and INITIATIVE_METHODOLOGY.md.

Future versions may add:
- Magnitude as a multiplier in the behaviour rule (v2 rule).
- Assessment confidence as a multiplier in the behaviour rule (v2 rule).
- Time decay on signal weights (v2 rule).
- Automated cluster detection for waves of coverage of the same event.
- Proactive signal generation for absence-of-expected-events.
- Cross-source signal aggregation (the same underlying event reported by multiple outlets).

These extensions are deferred. The v1 pipeline is operational with the v1 rule.
