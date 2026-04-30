# Initiative model — specification

**Version:** 1.0
**Status:** Specification document. Defines the data model, field semantics, and behaviour rule for the initiative model.
**Audience:** Anyone building, populating, querying, or implementing the initiative model. Including AI systems with no other context.
**Reading order:** This document is the foundation. Read this first. INITIATIVE_METHODOLOGY.md describes how to populate the model; SIGNAL_PIPELINE.md describes how news becomes signals; N8N_IMPLEMENTATION.md describes how all of it runs in n8n; WORKED_EXAMPLE_SHELL_H3.md shows the model populated in full for one initiative.

---

## 1. Purpose of the model

The initiative model is a way of representing strategic business bets such that they can be:

- **Populated consistently** — two analysts working independently produce structurally comparable outputs from the same source material.
- **Updated by signals** — news and other inputs route to specific points in the model and produce defined state changes via a deterministic rule.
- **Queried for risk** — at any moment, the model can answer "which dependency is most likely to cause this initiative to fail" from data, not from prose reasoning.
- **Visualised** — the structure is naturally a graph (a central initiative node with dependency nodes radiating from it) and the visualisation is computed from the data.

The model is the data structure that holds the analytical position. The methodology is how you build that data structure from sources. The signal pipeline is how news updates it. This document defines only the model.

## 2. Conceptual frame

A **strategic initiative** is a specific bet a company has committed to that depends on conditions in the world holding or changing in particular ways. Examples: Shell's announced 2030 NW European hydrogen capacity buildout. BP's net-zero pivot. CTEK's 12V battery strategy. Equinor's blue hydrogen export business.

Every initiative has time horizon (when does it pay off), decision threshold (what counts as success), and dependencies (what has to be true in the world for it to succeed). The model captures these as structured data.

The core insight underlying the model: **a technology, market condition, regulation, or ecosystem actor exists once in the world, but its role relative to a specific initiative is initiative-specific**. The same technology might be principal to one company's bet and external-threatening to another's. The entity exists once globally; the relationship between an initiative and that entity carries the role.

This is why the model has three primary tables (initiatives, entities, links) rather than one. Initiatives reference entities through links, and the link carries everything that's specific to "this entity in the context of this initiative."

## 3. Data structure

The model has four tables. Three are primary; one is a separate event log.

### 3.1 Table: `initiatives`

One row per strategic initiative. The unit of analysis.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Convention: `COMPANY_HORIZON_TOPIC` (e.g. `SHELL_H3_HYDROGEN_NWE`). |
| `name` | string | Human-readable name. |
| `company` | string | Which company holds this initiative. One initiative belongs to exactly one company. |
| `segment` | string | Which business segment (per the company's own reporting). Used for filtering. |
| `register` | enum | `PERSONAL`, `INDUSTRY`, `SECTOR`, `CLIENT_ACCOUNT`. The four-layer hypothesis architecture. Most company initiatives will be CLIENT_ACCOUNT. |
| `hypothesis_statement` | text | The IF-AND-ONLY-IF-style statement of what the bet is. Should be falsifiable. |
| `time_horizon` | string | When the bet pays off (year or year range). |
| `decision_window` | string | When key go/no-go decisions on this bet are taken. May be ongoing. |
| `decision_threshold` | text | Quantified definition of success for this bet. |
| `baseline_confidence` | numeric | Initial confidence band [0.000, 1.000] when the initiative was first specified. Held as the reset state. |
| `current_confidence` | numeric | Current confidence band [0.000, 1.000]. Updated by signal application. |
| `created_at` | timestamp | When this initiative was added to the system. |
| `last_updated_at` | timestamp | When this initiative's metadata last changed. |

Confidence band semantics: 0.000 means the initiative is falsified; 0.500 means structurally uncertain; 1.000 means structurally validated. The bar from 0.000 to 0.333 is "red" (likely to fail), 0.333 to 0.667 is "amber" (uncertain), 0.667 to 1.000 is "green" (likely to succeed). These thresholds are conventions, not hard rules.

### 3.2 Table: `entities`

One row per thing-in-the-world that one or more initiatives depend on. Entities exist independently of any specific initiative.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Convention: SCREAMING_SNAKE_CASE descriptive (e.g. `EU_HYDROGEN_BACKBONE`). |
| `name` | string | Human-readable name. |
| `type` | enum | `tech`, `market`, `regulation`, `ecosystem`. The kind of thing this is. See section 3.2.1 for definitions. |
| `current_state` | text | The factual current condition of this entity in the world, in plain language. |
| `threshold` | text | The condition that, if met, satisfies whatever claims point to this entity. Plain language. |
| `state` | enum | `holding`, `weakening`, `broken`, `ambiguous`. Current assessment relative to the entity's stated threshold. See section 3.2.2. |
| `baseline_state` | enum | The state when the entity was first specified. Held as reset state. |
| `note` | text | Substantive analyst commentary on the entity. Why it exists, what's known about it, what's contested. The audit trail of analysis. |
| `sources` | text | What sources informed the current_state assessment. Comma-separated or short paragraph. |
| `last_updated_at` | timestamp | When this entity's state or note last changed. |

#### Entity creation discipline (read before populating)

**Reuse rule**: an entity should only exist if it's expected to be referenced by at least 2 initiatives or at least 2 companies. This is a population discipline, not a strict creation gate — when populating the first initiative for the first company, no entity has yet been reused, so apply the rule on expected future reuse. If you're creating an entity and cannot plausibly identify which other initiative would reference it, that's a signal the entity should be folded into the parent initiative's metadata or claim text rather than created as a standalone entity.

This rule prevents the catalogue from fragmenting. Without it, two analysts working on the same company will create entities like `EU_ETS`, `EU_CARBON_PRICE`, and `EU_EMISSIONS_MARKET` — all valid by the descriptive rule, all duplicates, breaking the reuse mechanism that makes the model scale.

**Naming convention**: SCREAMING_SNAKE_CASE, descriptive enough to be unambiguous when read alone. Prefer the most common public name (`EU_ETS_PRICE`) over technical variants (`EU_EMISSIONS_TRADING_SCHEME_ALLOWANCE_PRICE`). When in doubt, search the catalogue for an existing similar entity before creating a new one.

#### 3.2.1 Entity types

The four type values are distinct and not overlapping:

- **tech** — A technology or technical capability. Examples: PEM electrolyser at industrial scale, subsea deepwater production technology, ethane cracker process technology. State refers to TRL, cost trajectory, operational reliability, etc.

- **market** — A market condition or commercial dynamic. Examples: EU ETS carbon price, long-term LNG demand, public fast-charging utilisation rates. State refers to price levels, demand levels, FID counts, etc.

- **regulation** — A regulatory or policy framework. Examples: EU Hydrogen Bank funding, ReFuelEU Aviation SAF mandate, US Section 45V tax credit. State refers to whether the framework is in force, being implemented, being challenged, etc.

- **ecosystem** — A piece of infrastructure, a partnership structure, an industrial cluster, or a competitive landscape. Examples: European Hydrogen Backbone pipeline network, Brazilian pre-salt partnership consortia, NW European industrial cluster commitments. State refers to operational status, commitment density, partnership stability, etc.

If an entity could plausibly fit two types, choose the one closest to what its state measures. A pipeline network is `ecosystem` (the state is about infrastructure deployment) not `tech` (the technology is settled). A subsidy programme is `regulation` (the state is about policy continuity) not `market` (the state isn't a market price).

#### 3.2.2 Entity state values

The four state values are an assessment of the entity *relative to its stated threshold*. Operational definitions for each:

- **holding** — Current state is consistent with the threshold being met or on track to be met. Recent evidence (last 3-6 months) is supportive or neutral. No specific signals undermining the threshold beyond background uncertainty.

- **weakening** — Directional evidence against the threshold has accumulated in recent period (last 3-6 months). The threshold is harder to meet than it was at baseline, but recovery is plausible. Typically: 1-2 material negative signals without offsetting positives, or sustained drift in the wrong direction.

- **broken** — The threshold is now structurally unlikely to be met based on accumulated evidence. Recovery would require change in fundamental conditions, not just a positive turn. Typically: sustained negative signals over 6+ months, or one major structural negative event (a regulatory framework collapsing, a competitor reaching scale early, an irreversible market shift).

- **ambiguous** — Evidence within the same recent period is genuinely mixed. Neither direction has prevailed. Different qualified observers reading the same evidence would land on different states. State stays ambiguous until the conflict resolves; it should not be a default for "we don't know" — that would be `holding` (no concerning evidence) or `weakening` (some concerning evidence).

State is an analyst-assigned assessment, updated by signal application via the signal pipeline (see SIGNAL_PIPELINE.md). The state is not the truth of the entity; it's the current assessment of the entity given available evidence. State assignments should be defensible by reference to specific recent signals or evidence, not by intuition.

### 3.3 Table: `links`

One row per (initiative, entity) relationship. The link carries everything specific to "this entity in the context of this initiative." This is where the substantive analytical thinking lives.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Convention: `INITIATIVE_ID:ENTITY_ID` (composite, derivable). |
| `initiative` | string (FK) | References `initiatives.id`. |
| `entity` | string (FK) | References `entities.id`. |
| `role` | enum | `principal`, `enabling`, `optional`, `external`. The structural relationship type. See section 3.3.1. |
| `impact` | enum | `neutral`, `amplifying`, `threatening`. The kind of force this entity exerts on the initiative if it moves. See section 3.3.2. |
| `criticality` | enum | `gating`, `enabling`, `non-critical`. How much initiative success depends on this entity. See section 3.3.3. |
| `claim` | text | The specific testable proposition this link asserts about the entity in the context of this initiative. |
| `claim_basis` | text | Analyst reasoning for why this claim, this role, this criticality. The audit trail. |
| `created_at` | timestamp | When this link was added. |
| `last_updated_at` | timestamp | When this link's content last changed. |

#### Claim writing rule (read before writing claims)

The `claim` field is load-bearing. Without a properly-formed claim, the link can't be assessed by the signal pipeline, the behaviour rule produces inconsistent updates, and the link becomes prose disguised as data.

**Required format**: every claim must be one sentence containing four components:

1. **Metric** — a specific measurable quantity or condition (CAPEX in €/kW, demand in Mtpa, count of FIDs, regulatory state in/out of force).
2. **Threshold** — a specific numerical value or qualitative bar that the metric must reach or maintain.
3. **Context/scale qualifier** — at what scale, geography, or qualifying condition the threshold applies (>100MW scale, NW Europe, sustained, central case).
4. **Time** — a date or time horizon by which the threshold must be met.

**Good claims** (all four components present):

- "PEM electrolyser stack CAPEX reaches <€1,000/kW at >100MW scale by 2028." (metric=CAPEX, threshold=<€1,000/kW, context=>100MW scale, time=by 2028)
- "Asia-Pacific LNG demand maintains >550 Mtpa sustained through 2035." (metric=demand, threshold=>550 Mtpa, context=Asia-Pacific sustained, time=through 2035)
- ">15 industrial offtake FIDs >50MW each are signed in NW Europe by 2027." (metric=FID count, threshold=>15, context=>50MW each NW Europe, time=by 2027)
- "Non-H2 DRI does NOT reach commercial scale before 2030." (metric=commercial scale status, threshold=does not reach, context=non-H2 DRI specifically, time=before 2030 — note: negation claims are valid for threatening external entities)

**Bad claims** (one or more components missing):

- "Hydrogen ecosystem develops favourably." (no metric, no threshold, no time — useless)
- "EU ETS price stays high." (vague metric, no threshold, no time — unassessable)
- "PEM costs come down." (metric is direction not magnitude, no threshold, no context — unfalsifiable)
- "Shell will succeed in hydrogen." (no metric, no threshold, no test — narrative, not a claim)

If you find yourself unable to specify all four components for a link, the entity may be wrong (too vague to support a claim), the link may be unnecessary (no specific assertion), or the underlying analytical position may not yet be tight enough to be testable. In each case, address the underlying issue rather than admitting a vague claim.

#### 3.3.1 Role values

Role describes the structural relationship between the initiative and the entity:

- **principal** — One of the 1-3 main technologies, conditions, or actors that the initiative is fundamentally about. The initiative cannot be separated from this entity. For Shell's NW European hydrogen play, PEM electrolysis is principal because the play is, at its core, about scaling PEM electrolysis. For Shell's Brazilian pre-salt expansion, pre-salt drilling technology is principal because the play is about pre-salt extraction.

  *Convention*: an initiative typically has 1-3 principal links. More than 3 suggests the initiative isn't well-bounded; consider splitting it.

- **enabling** — A technology, market, regulation, or ecosystem actor that the initiative depends on but isn't fundamentally about. The initiative could be reframed without changing what it is, but it can't succeed without this entity. EU ETS carbon price is enabling for Shell's hydrogen play (matters but isn't what the play is about); industrial offtake FIDs are enabling because they're the demand-side counterpart that lets the supply side reach FID.

  *Convention*: most links are enabling. This is the default category for "matters to the initiative but not its primary topic."

- **optional** — Could be incorporated but the initiative could proceed without it. Used sparingly. Example: hydrogen mobility refuelling stations to Shell's industrial hydrogen play — Shell does both, but they're loosely coupled and the industrial play isn't dependent on the mobility one.

  *Convention*: if you find no optional links in an initiative, that's normal. Most well-bounded initiatives don't have optional dependencies.

- **external** — A thing outside the initiative that nonetheless bears on it. Used for competitive technologies, alternative pathways, or threats. The initiative doesn't include or use this entity; the entity exists in the world and could affect whether the initiative succeeds. Direct reduced iron without hydrogen is external to Shell's green hydrogen play because Shell doesn't use it; if it matures, it changes the offtake market for Shell's hydrogen.

  *Convention*: external roles are typically (but not always) paired with `threatening` impact (see 3.3.2). External + neutral is possible but rare and usually means "something to watch but not active force."

#### 3.3.2 Impact values

Impact describes the kind of force the entity exerts on the initiative *when it moves*:

- **neutral** — Movement on this entity affects the initiative in a directionally simple way. Positive movement supports the initiative; negative movement undermines it. Most links are neutral. EU ETS carbon price moving up is good for Shell's hydrogen play; moving down is bad. PEM electrolyser CAPEX moving down is good; moving up is bad.

- **amplifying** — Movement is asymmetric in the positive direction. Positive movement disproportionately helps the initiative; negative movement (the absence of the positive) doesn't disproportionately hurt. Solid-state battery technology to a 12V battery initiative might be amplifying — if it lands, it transforms the initiative; if it doesn't land, the initiative still works as currently scoped.

  *Convention*: amplifying impact is rare. Use only when there's a clear asymmetric upside that wouldn't be captured by treating the entity as neutral. The behaviour rule applies the amplifying multiplier (1.5x) only on positive direction signals.

- **threatening** — Movement is asymmetric in the negative direction. The initiative depends on the entity *not* arriving or *not* maturing; if it does, the impact is structural. Always paired (or almost always) with `external` role. The behaviour rule applies the threatening multiplier (2x) on direction-toward-maturity signals, which for a threat is the direction that hurts the initiative.

#### 3.3.3 Criticality values

Criticality is the most important field on the link. It describes how much initiative success depends on this entity:

- **gating** — If this entity fails (state goes broken or sustained weakening), the initiative cannot succeed regardless of what else happens. The entity is a gate that has to be passed. Multiple gating links can exist on one initiative; they're parallel gates and *all* must be passed.

- **enabling** — Materially affects initiative success but isn't a single point of failure. The initiative could still succeed with this entity weakening, though more difficult. Multiple enabling links combine to determine probability of success.

- **non-critical** — Affects the initiative marginally. Movement on this entity barely changes the probability of success. Tracked because relevant but not load-bearing.

Criticality is the primary lever in the behaviour rule (see section 4). A signal hitting a gating link moves confidence 3x more than a signal hitting an enabling link, and 10x more than a signal hitting a non-critical link.

##### Special case: external + threatening criticality

For links with `external` role and `threatening` impact, criticality is interpreted as *how much the initiative depends on the threat NOT arriving*. A threatening external entity is gating-criticality if its arrival would kill the initiative (the offtake market disappears, the technology becomes obsolete, etc.). It's enabling-criticality if its arrival would hurt but not kill. It's non-critical if its arrival would be a marginal annoyance.

**Discipline on gating external threats**: external + threatening + gating must be rare and explicitly justified as initiative-killing. The test: would the arrival of this entity make the initiative's decision threshold materially unattainable, regardless of what else happens to the principal and enabling links? If yes, gating is justified. If no — if the threat would hurt but not kill — it's enabling-criticality.

Most external threats are enabling-criticality, not gating. Gating external threats are the structural ones — the technology that obsoletes your principal bet, the regulation that makes your business model illegal, the alternative pathway that captures your offtake market. Two or three gating external threats per initiative at most, and usually fewer.

Over-tagging external threats as gating produces a model that is structurally pessimistic — it converts every distant possibility into a major risk and dilutes the gating signal. A model with many gating external threats is harder to read because the biggest-risk query gets dominated by remote possibilities rather than active concerns.

### 3.4 Table: `competitive_events`

One row per competitive or strategic event by another actor that bears on one or more initiatives. Separate from the main link structure because events are temporal, not state-based.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. |
| `actor` | string | The named company, government, or actor that took the action. |
| `event_type` | enum | `exit`, `partnership`, `capacity_announcement`, `divestment`, `acquisition`, `regulatory_action`, `technology_breakthrough`, `other`. |
| `description` | text | What happened. |
| `event_date` | date | When it happened. |
| `affects_initiatives` | array of strings | Which initiatives this event bears on. |
| `affects_entities` | array of strings | Which entities this event provides evidence about. |
| `implication` | text | Analyst note on what this event means for the affected initiatives. |
| `severity` | enum | `minor`, `material`, `major`. How impactful this event is. |
| `source_url` | string | Where the event was reported. |

The competitive event log is read alongside the initiative model when displaying the model. Events influence entity state (a competitive partnership announcement is evidence about the competitive_landscape entity, for example), but they're not themselves a link.

## 4. Behaviour rule

The behaviour rule is the deterministic logic that converts a signal into a confidence band update. The rule is the same for every initiative; the multipliers are constants. This is what makes the system benchmarkable.

### 4.1 Formula

For each (signal, link) pair where the signal targets the link's entity:

```
Δconfidence = base × criticality_weight × impact_weight × direction
```

Where:

- **base** = 0.05. The base unit of confidence movement per signal.
- **criticality_weight** is a constant determined by the link's criticality:
  - `gating` = 3
  - `enabling` = 1
  - `non-critical` = 0.3
- **impact_weight** is a constant determined by the link's impact:
  - `neutral` = 1
  - `amplifying` = 1.5 (applied only when direction is positive; negative direction reverts to 1)
  - `threatening` = 2
- **direction** is the signal's directional contribution to the link's claim:
  - +1 if the signal supports the claim (claim is more likely true)
  - -1 if the signal undermines the claim (claim is less likely true)

### 4.2 Direction interpretation for external + threatening links

For links with `external` role and `threatening` impact, the direction sign convention is:

- A signal showing the threat *progressing* (more likely to arrive, more mature) is direction `-1` for the initiative — the threat coming true hurts the initiative.
- A signal showing the threat *retreating* (less likely to arrive, less mature) is direction `+1` for the initiative — the threat receding helps the initiative.

This is the consistent interpretation: direction is always relative to the *claim* the link makes about the entity. The claim for a threatening external entity is typically of the form "this threat does NOT arrive before [date]." A signal that the threat is arriving undermines that claim — direction `-1`. A signal that the threat is delayed supports that claim — direction `+1`.

### 4.3 Aggregation across links

A signal targets one entity. That entity may be linked from multiple initiatives. The signal is applied independently to each linked initiative — the formula computes a delta per link, and each initiative's confidence updates by its own delta.

For a single initiative receiving multiple signals in one cycle, the deltas sum:

```
new_confidence = clamp(current_confidence + sum_of_all_deltas, 0.000, 1.000)
```

The clamp ensures confidence stays in [0, 1].

### 4.4 Idempotence and order independence

The rule is linear and order-independent. Applying signals A, then B, then C produces the same final confidence as applying C, then A, then B. Removing a previously applied signal subtracts its delta and restores the entity's state to the most recent other signal touching the entity (or to baseline if no other signal touches it).

### 4.5 What the rule does NOT include

The rule deliberately omits several factors that could be added later. They're flagged here so future versions of the model can extend the rule consistently:

- **Magnitude of signal**. Currently every signal applies at base × multipliers. A more sophisticated rule would scale by signal magnitude (incremental / material / structural), giving the formula an extra factor. See SIGNAL_PIPELINE.md for how magnitude is assessed.
- **Confidence in assessment**. The signal pipeline assigns confidence (low / medium / high) to each assessment of a news article against a claim. A more sophisticated rule would scale by assessment confidence so that thin or speculative signals move the band less than well-evidenced ones.
- **Time decay**. Signals applied long ago could carry less weight than recent signals. The current rule has no time decay; a signal applied months ago contributes the same delta as one applied today.

These extensions are deferred to model v2 or beyond. The v1 rule above is deliberately simple to validate the architecture before adding factors.

### 4.6 Sensitivity to signal volume

The v1 rule is sensitive to signal volume by design — more signals produce more confidence movement. This is correct in principle (more evidence should produce more confidence change) but produces a practical asymmetry: an initiative that receives 20 signals in a period will show more confidence movement than an initiative receiving 3 signals over the same period, even if the underlying realities are similar.

When reading confidence band movements across initiatives, read them against signal volume. The biggest-risk query is unaffected by this (it's based on state, not on confidence), but cross-initiative confidence comparisons should account for signal-volume differences. Future rule versions may normalise by signal volume or apply per-initiative signal budgets.

## 5. The biggest-risk query

A core query the model must support: "what is the single biggest risk to this initiative right now?"

Answered by ranking the initiative's links by `criticality_weight × state_severity`, where state severity is:

- `broken` = 3
- `weakening` = 2
- `ambiguous` = 2
- `holding` = 1

With a special case: external + threatening + holding = 1.5 (the threat is dormant but real — it carries some weight even when not active).

The link with the highest ranking score is the biggest risk. This is computable from data without invoking AI reasoning, and produces the same answer for the same data each time.

## 6. Worked micro-examples of the constructs

### 6.1 An initiative

```
{
  id: "SHELL_H3_HYDROGEN_NWE",
  name: "NW European green hydrogen ecosystem play",
  company: "Shell",
  segment: "Renewables & Energy Solutions",
  register: "CLIENT_ACCOUNT",
  hypothesis_statement: "Shell's announced 2030 NW European hydrogen production capacity will be delivered within ±25% of stated targets, contingent on parallel ecosystem maturation across pipeline, offtake, and regulatory dimensions.",
  time_horizon: "2030",
  decision_window: "2027-2028",
  decision_threshold: "Capacity at 2030 within ±25% of currently-announced figures",
  baseline_confidence: 0.500,
  current_confidence: 0.500
}
```

### 6.2 An entity

```
{
  id: "PEM_ELECTROLYSIS",
  name: "PEM electrolyser at industrial scale",
  type: "tech",
  current_state: "TRL 8-9 component; TRL 7-8 system at >100MW",
  threshold: "Stack CAPEX <€1,000/kW at >100MW scale by 2028",
  state: "weakening",
  baseline_state: "weakening",
  note: "Holland Hydrogen 1 (200MW) is genuinely commercial-scale, but second-of-a-kind hasn't yet operated. Cost-down trajectory tracking 10-20% per doubling of cumulative capacity per IRENA; current announced project quotes 1,400-1,800 €/kW versus the <1,000 €/kW threshold needed for Shell's economics to work at announced 2030 scale.",
  sources: "IRENA Hydrogen Cost Report 2024; Holland Hydrogen 1 announcement; REFHYNE II EPC quotes"
}
```

### 6.3 A link

```
{
  id: "SHELL_H3_HYDROGEN_NWE:PEM_ELECTROLYSIS",
  initiative: "SHELL_H3_HYDROGEN_NWE",
  entity: "PEM_ELECTROLYSIS",
  role: "principal",
  impact: "neutral",
  criticality: "gating",
  claim: "Stack CAPEX reaches <€1,000/kW at >100MW scale by 2028",
  claim_basis: "Without this CAPEX trajectory, Holland Hydrogen 1 follow-on and REFHYNE II don't reach FID. Cost-down dependent on cumulative deployment volume."
}
```

This link asserts: PEM electrolyser CAPEX is the principal technology dependency for Shell's NW European hydrogen play; movement on this entity has neutral impact on the initiative; the dependency is gating (failure here kills the initiative); the specific claim is the CAPEX threshold; the basis is the FID logic.

### 6.4 A threatening external link

```
{
  id: "SHELL_H3_HYDROGEN_NWE:DRI_NON_HYDROGEN",
  initiative: "SHELL_H3_HYDROGEN_NWE",
  entity: "DRI_NON_HYDROGEN",
  role: "external",
  impact: "threatening",
  criticality: "gating",
  claim: "Non-H2 DRI does NOT reach commercial scale before 2030",
  claim_basis: "If Boston Metal or similar electrolytic iron technology reaches scale, the steel decarbonisation offtake market for green hydrogen narrows materially."
}
```

This link asserts: direct reduced iron without hydrogen is external to Shell's play (Shell isn't doing it); the impact is threatening (its arrival hurts Shell); the criticality is gating against non-arrival (if it does arrive, the offtake market dies). The claim is the non-arrival; the basis is the offtake-market logic.

## 7. Build order

When populating an initiative from scratch, the recommended order is:

**Step 1 — Initiative metadata**. Fill in the `initiatives` row first: id, name, company, segment, register, hypothesis_statement, time_horizon, decision_window, decision_threshold, baseline_confidence. The hypothesis_statement is the load-bearing field — it bounds what the initiative is and isn't. If the statement is vague or covers multiple distinct bets, split into multiple initiatives before continuing.

**Step 2 — Identify principal links** (1-3 entities). What is this initiative *fundamentally about*? Which 1-3 technologies, conditions, or actors are its core? Create those entities (or reference existing ones if reusable) and the principal links. Write claims at this point.

**Step 3 — Identify enabling links** (3-5 entities). What does the initiative *depend on* that isn't its core? Markets, regulations, ecosystem actors, infrastructure. Create or reference entities; create the enabling links; write claims.

**Step 4 — Identify external threats** (1-2 entities, sometimes 0, rarely more). What could happen *outside* the initiative that would invalidate it? Disruptive technologies, alternative pathways, regulatory shifts. Create or reference entities; create external links with `threatening` impact; write claims (typically negation form: "X does NOT arrive before Y").

**Step 5 — Assess state** for each entity. For each entity referenced, evaluate its current state (`holding`, `weakening`, `broken`, `ambiguous`) per the operational definitions in 3.2.2. Document the basis in `note` and `sources`.

**Step 6 — Assess criticality** for each link. For each link, evaluate criticality (`gating`, `enabling`, `non-critical`). The criticality is the most important field on the link — it determines how the behaviour rule weights signals to this entity. Be deliberate. Most links should be `enabling`. Gating links should be the genuine single-points-of-failure. Non-critical links exist but should be the minority.

**Step 7 — Set baseline confidence**. Given the link set and the current state of each entity, what's the analyst's starting confidence in the initiative? Default to 0.500 and adjust toward 0.400 if multiple gating links are weakening, toward 0.600 if all gating links are holding, toward 0.300 if any gating link is broken.

**Step 8 — Review**. Read the populated initiative as a whole. Does the dependency structure make sense? Are there obvious gaps? Does the biggest-risk query (criticality × state severity) produce a sensible answer? If not, return to whichever step needs revisiting.

The whole procedure should take 30-90 minutes for a well-bounded initiative once the analyst is fluent. First-time population takes longer because entity creation requires catalogue checking. As the catalogue matures, the marginal cost per initiative falls.

## 8. Anti-patterns and failure modes

### 7.1 Common errors in role assignment

**Tagging too many things as principal.** If three or more links carry principal role, the initiative is probably under-bounded — it's actually multiple initiatives. Test: would a reasonable analyst describe the initiative as fundamentally being about all of these things, or are most of them dependencies? If the latter, downgrade to enabling.

**Tagging dependencies as external.** External role is reserved for things outside the initiative. If the initiative incorporates or uses the entity, it's principal or enabling, not external. Mistakenly tagging an enabling dependency as external causes the threatening-impact reinterpretation logic to fire, which is wrong.

**Missing the external threats.** A common omission. The initiative gets populated with all its internal dependencies but no external threats. Then the model can't answer "what could blindside this initiative." Force the question: what could happen in the world, *outside* this initiative, that would make it irrelevant?

### 7.2 Common errors in criticality assignment

**Over-assigning gating.** If 5+ links are gating, the model's behaviour rule will be dominated by whichever signals happen to arrive first, because every gating link moves confidence by 0.15 per signal. Realistic initiatives have 2-4 gating links. If you find yourself with more, ask which are truly single-points-of-failure versus which are merely important.

**Confusing criticality with impact.** Criticality is *how much success depends on this*. Impact is *what kind of force this entity exerts when it moves*. A non-critical link can still have neutral impact (a marginal entity that exerts symmetric force). A gating link can have threatening impact (a critical threat). They're orthogonal dimensions.

### 7.3 Common errors in claim writing

**Vague claims.** "Hydrogen ecosystem develops favourably" is not a claim. It can't be assessed. Every claim needs a quantified or otherwise testable threshold and a date. "PEM electrolyser CAPEX reaches <€1,000/kW at >100MW scale by 2028" is a claim — it has a metric, a threshold, a scale qualification, and a date.

**Claims that are facts not predictions.** "Shell has committed to Holland Hydrogen 1" isn't a useful claim because it's already true and unfalsifiable. The claim needs to be about something that could go either way.

**Claims that don't match the link's role and criticality.** A gating principal link should have a load-bearing claim — the initiative's success genuinely turns on whether this claim is true. A non-critical enabling link can have a softer claim. The claim's weight should match the link's structural importance.

### 7.4 The "describable as text" test

If you find yourself wanting to put long prose into a single field, the data model is straining. Long prose belongs in `note` (on entity) or `claim_basis` (on link). The structured fields (role, impact, criticality, state) should be the enum values; the text fields should be specific and bounded. If a state can't be expressed as one of the four enum values, the model isn't accommodating the situation, and you need to either choose the closest enum and document the discomfort in the note, or flag a real model gap.

## 9. Reuse across companies

When populating a second company (BP after Shell, for example), entities are reused.

The entity catalogue is global. EU ETS exists once; it's the same entity whether referenced from a Shell initiative or a BP initiative. Its current state is a fact about the world, not about either company's interpretation.

Links are per-(initiative, entity). BP's link to EU ETS may carry different role, criticality, or claim than Shell's link to EU ETS. That's expected — the entity's role relative to BP's strategy may be different from its role relative to Shell's strategy.

When populating a new company:

- For each entity referenced, check if it exists in the catalogue. If yes, reference it. If no, create it.
- Write the link from scratch with this initiative's specific role, criticality, claim, etc.
- Update the entity's `note` and `sources` if the new analysis surfaces information that should be incorporated.
- Do not duplicate entities. Two entities with similar but different names ("EU ETS" and "EU emissions trading system carbon price") are a population error, not a real distinction.

This reuse mechanism is what makes the model scale. The marginal cost per company falls as the entity catalogue matures. Five companies in scope, with ~30% entity overlap each, yields a smaller-than-additive total entity count.

## 10. Confidence band semantics over time

The confidence band on an initiative is a current-moment assessment, not a historical record. Each signal application updates `current_confidence` in place. The history of confidence movements is preserved by the signal log, not by storing past confidence values on the initiative row.

Reset behaviour: when an initiative is reset (or when the model state is rolled back), `current_confidence` returns to `baseline_confidence`. Baseline is the analyst-set initial position; current is what signals have moved it to.

## 11. What this document does not cover

This document specifies the data model and behaviour rule only. It does not cover:

- How to populate the model from public sources. See INITIATIVE_METHODOLOGY.md.
- How news articles become signals that update the model. See SIGNAL_PIPELINE.md.
- How the model is implemented in n8n. See N8N_IMPLEMENTATION.md.
- A fully populated example. See WORKED_EXAMPLE_SHELL_H3.md.

A reader who has only this document should be able to: define the database tables, write the behaviour rule as code, build a visualisation that renders an initiative graph from the data, and answer the biggest-risk query for any populated initiative. They will not be able to populate the model from sources without the methodology document.

## 12. Versioning

This is version 1.0 of the model spec. Future versions may extend the behaviour rule (adding magnitude and assessment confidence factors), introduce technology-to-technology dependency relationships (a separate table allowing entities to depend on other entities), or refine the enums. Breaking changes to the schema require a migration; the migration must preserve existing data semantics.

The model spec, the methodology document, the signal pipeline document, the n8n implementation document, and the worked example document are versioned together. A v1 model spec implies v1 methodology, v1 signal pipeline, etc. Mixing versions across documents is an error.
