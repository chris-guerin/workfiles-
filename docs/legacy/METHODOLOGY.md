# METHODOLOGY.md — strategy-to-hypothesis derivation

> \*\*SUPERSEDED.\*\* This document was authored 28-29 April 2026 for the matrix model architecture. Superseded 30 April 2026 by the initiative model documentation set in `/docs/`. Retained for historical reference only. See `/docs/INITIATIVE\_MODEL.md` and `/docs/INITIATIVE\_METHODOLOGY.md` for current architecture.

**Status:** Draft, phase one. Authored 29 April 2026.
**Purpose:** Define a repeatable, blind-runnable procedure that converts a company's public strategic position into a structured set of testable hypotheses, with bucket-layer components populated to a level sufficient for the Signal Engine to filter news against them.
**Test bar:** the procedure run blind against public data should produce hypotheses that match, in substance, 80% of what an analyst with full insider context would author for the same company. The 20% that requires inside view defines the boundary of what the method can do alone.

\---

## 1\. Why this exists

FutureBridge's commercial value compounds when the same hypothesis applies across multiple clients in a sector, and the same component technology applies across multiple sectors. That overlap is only legible if hypotheses are authored consistently. Today they are authored case-by-case, in client briefs, with structure that varies by engagement. The Signal Engine's filter quality depends on hypothesis structure being uniform; the cross-client and cross-industry leverage depends on the same.

The method below is an attempt to remove the variance. Run on the same inputs, by different operators, it should produce substantively similar hypotheses. That uniformity is the precondition for everything else the system is meant to do.

The method is also the precondition for scaling. Authoring hypotheses one at a time during client engagements has a natural ceiling. Authoring them systematically from public data, with engagement-specific work overlaid only where inside view changes the picture, scales differently. The method is the substrate; the engagement is the differentiator.

\---

## 2\. Input definition

Public inputs are tiered by structure and reliability. Higher tiers carry more weight in the derivation. The method does not invent material that is not in the inputs.

**Tier one — corporate initiatives pages.** The company's own structured publication of named programmes, partnerships, and commitments. For globals like Shell, BP, Equinor, this is a corporate site section (often `/what-we-do`, `/sustainability`, `/innovation`, or named scenarios pages) where initiatives are listed with stated objectives, named partners, timeframes, and geographic scope. This is the primary input. The company has done the segmentation work; the method extracts what is there rather than synthesising from prose.

**Tier two — technology radar.** A pre-built structured assessment of every technology in the relevant sector(s), with scores across TRL, disruption potential, market size, time-to-market, ecosystem maturity, startup activity, regulatory impact, sustainability, integration complexity, and business case strength. Used to populate the bucket-layer components of each hypothesis. The radar is independent of any specific company; it is the substrate against which company initiatives are mapped.

**Tier three — financial filings.** Annual report, 20-F or 10-K, capital markets day materials, segment-level capex disclosure, project-level disclosure where projects are large enough to warrant SEC mention. Used to test whether stated initiatives have financial substance behind them and to apportion capital commitment across initiatives where segment-level data permits.

**Tier four — regulatory and policy submissions.** The company's submissions to public consultations, public comments on rulings, lobbying disclosures where available. Used to surface forward signals on the company's expectations about regulatory trajectory. Often more revealing than the public narrative because regulatory submissions are made under different incentive structures.

**Tier five — executive commentary and interviews.** Capital markets day transcripts, earnings call transcripts, named executive interviews. Provides interpretation and tone. Explicitly weighted lower than the structured tiers because it is selected for narrative effect, not analytical content.

**Excluded inputs.** Anything from current or past engagements with the company in question. Anything from private FutureBridge analysis not derivable from public material. Anything not freely accessible to a competitor reading the same publicly available sources. The method must produce its outputs from inputs a competitor could replicate.

**Input completeness requirement.** Tier one and tier two are required. A company without a structured initiatives presence cannot be processed by this method without modification (see Section 12). A sector without a built radar cannot be processed at all until the radar exists.

\---

## 3\. Output definition

Each hypothesis produced by the method has the following fields populated. Field names align with the v5 schema (see ARCHITECTURE.md Section 8).

**Identity (Section A of v5):**

* `hyp\_id` — generated per company prefix convention
* `register` — CLIENT, INDUSTRY, CHRIS, or CONSULTING (this method primarily produces CLIENT)
* `sector` — primary sector
* `system\_layer` — primary R16 bucket (tech / cost / reg / eco / competitive)
* `hypothesis\_theme` — one-line strategic restatement
* `phase` — DIVERGENT / CONVERGING / TRIGGER\_READY / RESOLVED (initial value DIVERGENT for new derivations)
* `status` — ACTIVE / RETIRED / DRAFT (DRAFT until reviewed)
* `created\_by` — `methodology\_v1` or operator name
* `source\_artefact` — pointer to the company initiative(s) that originated the hypothesis

**Decision layer (Section B of v5):**

* `probability` — initial estimate based on radar evidence and financial substance, 0-100
* `confidence\_score` — confidence in the probability estimate, reflecting input tier weighting
* `urgency\_score` — based on time-to-market scores in radar plus stated company timeframes
* `decision` — what strategic decision the hypothesis bears on
* `decision\_threshold` — at what evidence point would the company commit, withdraw, or pivot
* `wntbt\_next` — what would have to be true next to validate, iterate, or deny the hypothesis
* `target\_accounts` — initially the company itself; expanded during clustering
* `decision\_if\_true` — implied action posture if hypothesis resolves true
* `decision\_if\_false` — implied action posture if hypothesis is falsified
* Tags (`company\_tags`, `topic\_tags`, `industry\_tags`, `routing\_geography`) — populated from initiative metadata

**Bucket layer (Section C of v5):**

* `tech\_\*` — drawn from radar scoring of load-bearing technologies. Critical pathways, bottlenecks, credible actors, trajectory changers, displacement risks.
* `cost\_\*` — drawn from radar market and time-to-market scores plus financial filings. Critical conditions, economic gap, who commits, deal structure.
* `reg\_\*` — drawn from radar regulatory scoring and tier four sources. Load-bearing regulations, gaps and blockers, decision makers, unlock-delay-kill triggers.
* `eco\_\*` — drawn from radar ecosystem scoring and named partners in initiatives. Missing dependencies, required partnerships, who moves first, derisking commitments.
* `geo\_\*` — geography of leadership, exclusion, where shifts matter (legacy bucket per v5; cross-cutting modifier per R16)
* `signal\_types` — pipe-delimited signal categories for filter routing
* `falsifiers` — pipe-delimited specific events that would falsify the hypothesis
* `primary\_sources` — pipe-delimited signal sources to monitor
* `related\_hyp\_ids` — links to other hypotheses (intra-company, industry, cross-industry)

**Provenance (method-specific):**

* `provenance\_tier\_mix` — which input tiers contributed to this hypothesis. Format: `T1:5,T2:3,T3:2` meaning five inputs from tier one, three from tier two, two from tier three.
* `financial\_substance` — TIGHT (project-level disclosure), MODERATE (segment-level apportionment), LOOSE (announcement only), ABSENT (no financial trace)
* `derivation\_confidence` — HIGH / MODERATE / LOW based on input tier mix and radar score variance

The `provenance\_tier\_mix`, `financial\_substance`, and `derivation\_confidence` fields are not in the v5 schema today and would require a v5.2 schema bump to add. Included here as method outputs; schema integration is a follow-on step.

\---

## 4\. The procedure (ten steps)

Each step has explicit inputs, explicit outputs, and a definition tight enough that two operators running the procedure on the same materials would produce substantively similar results. Where judgement is required, the judgement criteria are stated.

### Step 1 — initiative inventory

**Input:** corporate initiatives pages and any directly linked sub-pages.

**Process:** read each named initiative. Extract, per initiative, the following structured record:

* Initiative name (verbatim from source)
* Stated objective (one or two sentences, paraphrased only where source is verbose)
* Named partners (verbatim list)
* Timeframe (explicit dates where given; bracketed estimate otherwise)
* Geography (where the initiative operates)
* Stage indicator (pilot / scale-up / commercial; inferred from language if not explicit)
* Capital commitment (amount and source if disclosed; "not disclosed" otherwise)
* Source URL

**Output:** a structured list of initiatives. For Shell, a typical pass produces 30-60 named initiatives across the corporate site. Initiatives may be nested (a programme contains projects); the method records both levels.

**Judgement criteria:** an entry is an "initiative" if the company has named it and stated an objective. Strategic narrative without a named programme attached is not an initiative. Press-release announcements are initiatives only if they appear in the structured initiatives section of the corporate site, not just in the news feed.

### Step 2 — radar mapping

**Input:** initiative inventory from step 1, plus the relevant technology radar.

**Process:** for each initiative, identify which radar technologies are load-bearing. A technology is load-bearing if the initiative cannot deliver its stated objective without that technology working. An initiative typically maps to two to four technologies. Sometimes one if narrow (a single-technology pilot); sometimes more if a programme.

For each mapped technology, pull the radar's scoring: TRL, disruption, market, time-to-market, ecosystem, startup, regulatory, sustainability, integration, business case, plus the scenario alignment columns (where the radar uses scenarios, like Shell's A/S/H).

**Output:** initiative-to-technology mapping with full radar scores attached.

**Judgement criteria:** "load-bearing" means the technology is on the critical path. A technology that would be useful but not essential is a related technology, recorded separately. A technology that the initiative implicitly depends on but the company has not named is added with an explicit "inferred" tag.

### Step 3 — financial substance test

**Input:** initiative inventory, plus tier three financial filings.

**Process:** for each initiative, find the corresponding capital commitment in financial filings. Three possible findings:

* **Project-level disclosure.** The initiative or a named sub-project appears in financial filings with a capital figure attached. Tag: TIGHT.
* **Segment-level apportionment.** The initiative is part of a disclosed segment (e.g. Shell's Renewables and Energy Solutions), with segment-level capex disclosed. Apportion across initiatives in the segment using available signals (named projects, stated programme size, geography). Tag: MODERATE.
* **Announcement only.** The initiative has a press-release commitment ("$X over Y years") but no corresponding line in audited financials. Tag: LOOSE.
* **No trace.** The initiative is on the corporate site but cannot be linked to any financial disclosure. Tag: ABSENT.

**Output:** financial-substance score per initiative.

**Judgement criteria:** the test asks whether the company has put money behind the narrative. A high-tier initiative on the corporate site with ABSENT financial substance is downweighted. A modest initiative with TIGHT financial substance is upweighted. The method does not assume financial discipline equals strategic priority, but it does assume that capital is the strongest non-narrative signal of seriousness.

### Step 4 — strategic restatement

**Input:** initiative inventory plus radar mapping.

**Process:** for each initiative, restate the stated objective as a falsifiable claim. The restatement must:

* Be specific enough that signals can move probability against it
* Include a timeframe (from the initiative or inferred from radar time-to-market scores of load-bearing technologies)
* Name the strategic outcome (what the company wants to be true)
* Be falsifiable (a clearly imaginable signal would invalidate it)

A worked example. An initiative stated as "Shell is exploring opportunities in low-carbon power generation for AI datacenters" becomes "Shell will hold commercial offtake or equity positions in at least 500MW of low-carbon power capacity dedicated to hyperscaler customers by 2030." The restatement is testable; the original is not.

**Output:** a falsifiable strategic claim per initiative.

**Judgement criteria:** the restatement should be the most aggressive defensible reading of what the company has actually committed to publicly. Not what they might privately intend, not what they might be forced into. The discipline is staying within what's been said while making it testable.

### Step 5 — bucket-layer extraction

**Input:** restated claim, radar mapping with full scores, financial substance score, regulatory submissions where available.

**Process:** populate the bucket-layer fields for each hypothesis, drawing from the structured inputs.

**Tech bucket.** For each load-bearing technology, populate `tech\_critical\_pathways` (what the technology must achieve), `tech\_bottlenecks` (where the radar indicates constraints — typically the lowest-scored dimension), `tech\_credible\_actors` (radar key players), `tech\_trajectory\_changers` (technologies that could displace this one — radar entries with similar function but different category), `tech\_displacement\_risks` (what would obsolete the load-bearing tech).

**Cost bucket.** Critical conditions (what cost-curve point the hypothesis depends on), economic gap (radar market score combined with public financial data on current cost vs. target), who commits (named investors, capital sources), deal structure (M\&A, JV, organic build, offtake).

**Reg bucket.** Load-bearing regulations (what existing or proposed rules enable or constrain the hypothesis), gaps and blockers (where the regulatory framework is incomplete), decision makers (named regulatory bodies and key individuals), unlock-delay-kill triggers (specific regulatory decisions that would change the hypothesis's status).

**Eco bucket.** Missing dependencies (what's not yet in place for the hypothesis to deliver — supply chain, infrastructure, customer readiness), required partnerships (named partners in the initiative, plus inferred ones from radar ecosystem scoring), who moves first (the actor whose move triggers the rest), derisking commitments (what commitments by others would derisk the position).

**Geo bucket.** Where the hypothesis is leading (which geographies are ahead), where excluded (where the hypothesis explicitly does not apply), where shifts matter (geographies whose regulatory or market changes would update probability).

**Output:** fully populated bucket-layer per hypothesis.

**Judgement criteria:** every field gets populated from the structured inputs where possible. Empty fields are explicitly marked "not in public sources" rather than left blank — that's a signal about where the inside view would add value.

### Step 6 — WNTBT and falsifiers

**Input:** restated claim, bucket-layer fields.

**Process:** articulate the forward test plan.

**WNTBT (what would have to be true next).** Three to five specific signals that, if observed, would validate the hypothesis is on track. These are drawn from the bucket-layer fields — they are observable events that move radar scores, regulatory positions, partner moves, or financial commitments in directions consistent with the hypothesis.

**Falsifiers.** Three to five specific signals that, if observed, would invalidate the hypothesis. These are drawn from the same fields, looking at the opposite direction. A falsifier might be a competitor reaching commercial deployment first (tech), a regulatory reversal (reg), a partner withdrawing (eco), or a strategic capex pullback (cost).

**Output:** structured WNTBT and falsifier lists, both pipe-delimited, both grounded in bucket-layer fields.

**Judgement criteria:** WNTBT and falsifiers must be observable from public signals. "Internal Shell strategy review concludes X" is not a falsifier — it's not observable. "Shell announces partnership with \[named technology provider]" is observable.

**Why this step matters beyond the hypothesis itself.** WNTBT and falsifiers are the join point between this method (backward-looking, evidence-derived) and the Signal Engine (forward-looking, trajectory-tracking). The method produces hypotheses; the Signal Engine consumes WNTBT and falsifiers as the matching surface for incoming signals. A signal that hits a WNTBT entry increases probability on the hypothesis. A signal that hits a falsifier decreases probability or triggers a state change. The quality of the WNTBT and falsifier articulation determines whether the Signal Engine can do its job. Vague WNTBT produces noisy classification; sharp WNTBT produces clean signal-to-hypothesis matching. The procedure therefore treats step 6 as the highest-leverage step in the procedure, not the final formality.

### Step 7 — decision threshold

**Input:** restated claim, WNTBT, falsifiers.

**Process:** identify the evidence point at which the company would be expected to commit, withdraw, or pivot. This is the hypothesis-level gate, distinct from per-metric thresholds in the radar (which are inputs to this gate).

For client-account hypotheses, the threshold is what the client itself would need to see to move. For industry hypotheses, the threshold is what would constitute a confirmed industry shift across multiple companies.

**Output:** decision threshold per hypothesis, expressed as either a quantitative gate ("when X exceeds Y") or a qualitative trigger ("when \[specific event] occurs").

**Judgement criteria:** the threshold should be specific enough that an analyst reviewing the hypothesis monthly could say with confidence whether it has been crossed.

### Step 8 — clustering and deduplication

**Input:** the full set of hypotheses produced by steps 4-7.

**Process:** review the hypothesis set. Multiple initiatives often imply the same underlying strategic hypothesis. Where two or more hypotheses share substantially the same bucket-layer components and decision threshold, merge them into a single hypothesis with multiple source initiatives.

A worked example. Three Shell initiatives — a hydrogen pilot in the Netherlands, a hydrogen offtake agreement with a steelmaker, a hydrogen distribution joint venture — likely all collapse to one hypothesis: "Shell will hold a commercially viable green hydrogen production-and-distribution position by 2030." The three initiatives become source artefacts on one hypothesis.

**Output:** a deduplicated hypothesis set, typically smaller than the initiative count by a factor of two to four. For Shell, an initiative inventory of 40-60 typically clusters to 12-25 hypotheses.

**Judgement criteria:** cluster only when bucket-layer overlap is substantial. Two initiatives that share a technology but have different cost or regulatory profiles are likely two hypotheses. Two initiatives with the same tech, cost, reg, eco, and geo profiles are one hypothesis.

### Step 9 — cross-linkage

**Input:** the deduplicated hypothesis set, plus existing hypotheses in other registers if available.

**Process:** for each hypothesis, identify links.

**Intra-company links.** Hypotheses for the same company that share dependencies. Example: a Shell datacenter hypothesis and a Shell hydrogen hypothesis might both depend on the same regulatory decision on grid interconnection rules.

**Industry-level links.** Hypotheses that match patterns across other companies in the same sector. The Shell datacenter power play likely has equivalents at BP, ExxonMobil, Chevron, Equinor, with different framing but similar bucket-layer logic.

**Cross-industry links.** Where a load-bearing technology is shared with hypotheses in another industry. Example: membrane technology load-bearing for a Shell water-management hypothesis is the same membrane technology load-bearing for an Ingredion food-processing hypothesis.

**Output:** `related\_hyp\_ids` populated per hypothesis, with link type tagged.

**Judgement criteria:** a link is recorded when two hypotheses share a load-bearing technology, a binding regulation, or a critical partner. Vague thematic similarity is not a link.

### Step 10 — confidence and provenance tagging

**Input:** the cross-linked hypothesis set, plus the input-tier record from steps 1-3.

**Process:** for each hypothesis, record:

* `provenance\_tier\_mix` — count of inputs by tier (e.g. T1:5, T2:3, T3:2)
* `financial\_substance` — TIGHT / MODERATE / LOOSE / ABSENT (from step 3)
* `derivation\_confidence` — HIGH / MODERATE / LOW

Confidence rules:

* HIGH if T1 ≥ 3 inputs AND T2 ≥ 2 inputs AND financial\_substance ≥ MODERATE
* MODERATE if T1 ≥ 2 inputs AND (T2 ≥ 1 OR T3 ≥ 1)
* LOW if predominantly T4 or T5 inputs, or financial\_substance = ABSENT

**Output:** per-hypothesis confidence and provenance metadata.

**Judgement criteria:** the confidence rules are mechanical; do not override them. A hypothesis that scores LOW on confidence may still be correct, but the method explicitly flags that public data is thin and inside view would add value disproportionately.

\---

## 5\. Completion test

The procedure does not say "you are done" by default. Without an explicit completion test, operators stop too early (incomplete hypotheses pollute the register and degrade Signal Engine quality) or polish forever (no hypothesis ever becomes operational). The completion test below is the gate.

A hypothesis is **complete** when all of the following are true:

1. **Identity fields populated.** `hyp\_id`, `register`, `sector`, `system\_layer`, `hypothesis\_theme`, `phase`, `status`, `created\_by`, `source\_artefact` all carry values. None are NULL.
2. **Strategic claim is falsifiable.** The `hypothesis\_theme` includes a timeframe, a strategic outcome, and is specific enough that an imaginable signal would invalidate it. Mechanical check: does the claim contain a date or a quantified target? If neither, the hypothesis fails this gate.
3. **At least two load-bearing technologies mapped from the radar.** Single-technology hypotheses are flagged for review — they may be valid, but the absence of redundancy in the bucket-layer often indicates the hypothesis is too narrow or that radar coverage is thin. Mechanical check: count of technologies cross-referenced in `tech\_credible\_actors`. If fewer than two, hypothesis is incomplete unless explicitly justified.
4. **All bucket-layer fields populated or explicitly marked "not in public sources."** Empty bucket-layer fields are not allowed. A field for which public sources have nothing to say must carry the explicit marker, not a NULL. This discipline forces the operator to acknowledge gaps rather than hide them.
5. **WNTBT contains three to five entries.** Each entry must be observable from public signals. Mechanical check: pipe-count of `wntbt\_next` ≥ 3 and ≤ 5. If outside this range, hypothesis is flagged.
6. **Falsifiers contain three to five entries.** Same observability requirement. Same mechanical check.
7. **Decision threshold articulated.** Either a quantitative gate ("when X exceeds Y") or a qualitative trigger ("when \[specific event] occurs"). Mechanical check: `decision\_threshold` is non-empty and contains either a numeric reference or a named event.
8. **Financial substance assigned.** TIGHT, MODERATE, LOOSE, or ABSENT. Never NULL. ABSENT is a valid completion state — it means public data has been searched and nothing was found, not that the test was skipped.
9. **Provenance tier mix recorded.** `provenance\_tier\_mix` shows the count of inputs by tier. A hypothesis with no tier one inputs is incomplete by definition (the method requires tier one as a primary input).
10. **Derivation confidence assigned.** HIGH, MODERATE, or LOW per the rules in step 10. Mechanical, not judgement-based.

A hypothesis that passes all ten checks is operational and can land in the register with status `ACTIVE`. A hypothesis that fails any check is held in `DRAFT` status until the failing check is addressed. The validator should report which checks failed, not just pass/fail overall.

**Why this matters operationally.** The Signal Engine matches signals to hypotheses on bucket-layer fields and WNTBT/falsifier entries. An incomplete hypothesis with empty bucket fields is a hypothesis the engine cannot match against. Letting incomplete hypotheses into the register degrades classification quality across the entire system, not just for that hypothesis. The completion test therefore protects the register's signal-matching surface, not just individual hypothesis quality.

**What this test does not check.** Substantive correctness. A hypothesis can pass all ten mechanical checks and still be wrong about the strategic claim it makes. The accuracy test (Section 11) is what validates substantive correctness; the completion test only validates structural readiness.

\---

## 6\. Worked example — placeholder

A full worked example for one Shell H3 strategic objective (the AI/datacenter power play) belongs in this document as Section 6. Placeholder; to be added in a subsequent session, ideally with an analyst running the procedure live and the output validated against an analyst-with-context view of the same objective.

\---

## 7\. What the method does well

Initiatives that are well-structured on the corporate site, mapped to technologies that exist in the radar, and supported by financial disclosure produce hypotheses with HIGH confidence. These are the hypotheses an analyst could write from the same inputs, and where the method's output should match the analyst's substantively. The 80% accuracy bar should be readily achievable in this segment.

Cross-linkage across companies in the same sector. The method's structured outputs make pattern-matching across companies mechanical rather than intuitive. An analyst doing this manually across ten companies would take substantial time; the method should produce the linkage table in minutes.

Provenance and confidence tagging. The method explicitly flags where its output is thin. That's epistemic honesty that case-by-case analyst authoring rarely supplies.

## 8\. What the method does not do

Discover initiatives the company has not publicly named. If a company is doing strategic work it has not yet announced, the method cannot see it. Inside view fills this gap.

Detect strategic dishonesty. If a company's stated initiatives diverge from its actual operating priority, the method takes the public narrative at face value (with the financial substance test as the partial check). An analyst with engagement context detects narrative-action gaps; the method does not.

Generate Chris bets or maverick views. The method derives from evidence; it does not anticipate where the evidence will go. CHRIS register hypotheses (Section 5 of ARCHITECTURE.md when written) come from human judgement, not this procedure.

Adapt to companies without structured public initiative pages. Smaller companies, family-held companies, and some non-Western majors do not publish initiatives in the structured form Shell does. The method needs a tier-one fallback for these cases, undefined here.

## 9\. Inputs the method cannot replace

The decision-layer fields in client briefs (decision\_owner\_role, decision\_threshold tied to client-internal politics, target\_accounts beyond the company itself) require engagement context. The method produces a generic decision\_if\_true; the analyst-with-context produces the version that names the actual person who has to be convinced.

The 20% the method does not cover. Inside view tells the analyst what is privately known about a competitor's intentions, what the company's board is actually focused on, what the political landscape inside the firm is. The method assumes neutrality on these questions.

## 10\. Method versioning and iteration

Each version of this method must produce hypotheses tagged with the version number. When the method is updated, hypotheses derived under prior versions are flagged for review. The accuracy test (Section 11) is re-run on each material version change.

The method is not a frozen artefact. The expectation is that running it against five to ten companies will surface ambiguities and edge cases that today's draft does not address. Each iteration should improve the procedure's reliability, not its scope.

## 11\. The accuracy test

The method is validated by running it blind against companies where an inside-view comparison is possible.

**Test protocol.**

Step 1 — operator with engagement context records, in a sealed document, the hypotheses they would produce for the company under review with full inside view. Sealed before the method is run, to prevent confirmation bias.

Step 2 — operator (or different operator) runs the method on public inputs only. Tier one through tier five only, with explicit exclusion of any engagement-derived material.

Step 3 — comparison. Each method-derived hypothesis is matched to its closest analyst-derived counterpart. Match scoring:

* Substantive match — same strategic claim, same load-bearing technology, same decision threshold (within reasonable tolerance). Counts as 1.
* Partial match — same strategic claim, different bucket-layer detail. Counts as 0.5.
* No match — method produced no equivalent. Counts as 0.

Step 4 — accuracy = sum of matches / number of analyst-derived hypotheses. Target: 80%.

**Test cases.**

First test: Shell, with Chris running both sides. Shell's full structured initiatives presence makes this the rigorous internal test.

Second test: a company with comparable public footprint but no current engagement. Candidates: BP, Equinor, TotalEnergies. Removes the contamination risk of running the test on a company you know from inside.

Third test: a company in a different sector. CV/Truck OEM (Daimler Truck or Volvo Group) using the cv\_truck radar. Tests whether the method generalises beyond energy.

If all three score 80%+, the method is validated. If two score high and one low, the variance tells us where the method is sector-specific. If all three score below 80%, the procedure needs structural revision.

## 12\. Open issues, deferred to phase two

The method assumes a built radar exists for the sector. Sectors without a radar (or with a stale one) cannot be processed. The radar-build procedure is not part of this method; that's a separate methodology.

Tier one input quality varies by company. Shell publishes well-structured initiatives. Smaller companies, regional players, and some private companies do not. Method needs a fallback or a different input shape for these cases.

The provenance and confidence fields (Section 3) require a v5.2 schema bump to be persisted. Until then, they are produced by the method but cannot be stored in the v5 register without additional columns.

The clustering judgement in step 8 has variance across operators. Two operators may cluster differently. The procedure should specify whether this variance matters and, if so, define a tiebreak.

Cross-linkage in step 9 depends on access to other companies' hypothesis sets. The first run of the method, on the first company processed, will have no links. Linkage emerges as the method is applied across multiple companies.

The method does not specify update cadence. A company's initiatives page changes; financial disclosures update annually; regulatory submissions are episodic. The method needs an answer to "when do we re-derive?" that fits FutureBridge's commercial rhythm.

\---

## Document control

**Authored:** 29 April 2026, in conversation between Chris Guerin and Claude.
**Status:** draft, phase one. Not yet validated by accuracy test.
**Next action:** review with fresh eyes; iterate steps 1-10 based on review; write Section 6 worked example using Shell H3 datacenter play; run phase two (build the model that runs this procedure).
**Cross-references:**

* ARCHITECTURE.md v5.3 Section 3 (methodology), Section 8 (register), Section 19 R14 (schema freeze), R16 (bucket invariants).
* ARCHITECTURE.md (when updated): operational integration of this method into the live system loop — when the method is triggered, how its outputs flow into WF-15, how Signal Engine feedback iterates the method — belongs in ARCHITECTURE.md Section 3 or a new dedicated section, not in this document. METHODOLOGY.md defines the procedure; ARCHITECTURE.md defines the system. This boundary is deliberate.
* /db/schema/v5\_design.md (column definitions for output mapping).
* shell\_tech\_radar\_complete.xlsx (worked example substrate, tier two input).

