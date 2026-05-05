# Ontology heat map refresh — design document

**Status:** Future workflow. Not built. Captured here so the design is not lost.
**Owner when built:** Chris Guerin
**Cadence when built:** Quarterly
**Priority:** Non-critical. High interest. Build after core signal pipeline is stable.

---

## Why this matters

The ontology is a snapshot. Technologies move. Regulatory windows open and close. Cost curves cross thresholds. WNTBT conditions get confirmed or falsified. A technology that was H3 eighteen months ago may be H2 today. One that was H2 may have died.

Without a structured refresh, the ontology becomes a historical document rather than a live intelligence layer. The quarterly scan is what keeps it honest.

The heat map is the output that makes this commercially visible. For any client, it shows every technology pair they touch — classified by horizon, with trajectory — and surfaces the pairs that have moved since the last review. That is a genuine advisory product. It does not exist anywhere else in the market in this form.

The telescope framing is right. Once the ontology covers enough technologies and enough clients, the quarterly scan will surface things no single analyst would find: a technology dying in one application while accelerating in an adjacent one; a regulatory window opening that makes three separate client hypotheses simultaneously more credible; a cost threshold crossing that moves five pairs from H3 to H2 at once. These are the high-value insights that compound across the client base.

---

## What the quarterly scan does

Three distinct outputs per technology. Run in this order.

### 1. Horizon movement review

For each technology in the ontology:

- Pull the named transition conditions from the technology record (the trigger events defined at population time).
- Cross-reference against signals classified by the Signal Pipeline in the quarter. Did any transition condition fire?
- If yes: flag the pair for reclassification. Surface the signal that triggered it, the evidence, and the proposed new horizon.
- If no: confirm trajectory (improving / holding / weakening / volatile) based on signal volume and direction in the quarter.

Output: a reclassification candidate list. Each entry has the pair, the current horizon, the proposed horizon, the trigger event that fired, and the confidence band. A human reviews and approves each reclassification before it commits to the database.

### 2. Art of the possible — new pair candidates

For each technology that moved horizon this quarter (H3→H2 or H2→H1):

- Walk the adjacency graph one hop. What applications are adjacent to the ones this technology already serves?
- Surface candidate new pairs: technology × adjacent application combinations that did not exist in the ontology at the start of the quarter but are now plausible given the horizon movement.
- Score each candidate by adjacency strength and evidence availability.

Output: a candidate pair list. Each entry has the technology, the proposed new application, the adjacency type that connects it, and a recommended confidence band. A human decides which candidates become new rows.

This is the "extending" part. A technology compressing from H3 to H2 in one application will often extend the art of the possible into adjacent applications simultaneously.

### 3. WNTBT falsification audit

For each active hypothesis in the Signal Engine repository:

- Pull the WNTBT conditions attached to the hypothesis.
- Check whether any condition has been falsified in the quarter — either by a named signal, a regulatory outcome, or a cost threshold failure.
- If falsified: flag the hypothesis for review. Flag every ontology pair the hypothesis references. The technology pair may still be valid but the hypothesis-level commercial case has weakened.
- If confirmed (condition held): update trajectory for the relevant pair toward improving.

Some technologies will not die suddenly. They will die by accumulated WNTBT failures — conditions that were required to hold, tested by reality, and found wanting. The WNTBT falsification audit is how the ontology tracks this systematically rather than waiting for someone to notice.

Output: a falsification log. Each entry has the hypothesis, the WNTBT condition tested, the outcome, and the recommended action (flag hypothesis / weaken pair confidence / deprecate pair).

---

## Technology deprecation

When a technology dies — either by WNTBT failure, regulatory block, or cost trajectory that makes commercial viability unreachable in any relevant horizon — it needs a clean exit path.

The deprecation process:

1. Set `draft_status = 'deprecated'` on all pairs involving the technology.
2. Set `trajectory = 'weakening'` and `is_flagged_for_review = TRUE` on those pairs.
3. Surface to every client touching those pairs via the heat map review.
4. Flag every active hypothesis referencing the technology for human review.
5. Do not delete. Deprecated pairs are evidence of what did not work. The adjacency walks and historical record have value.

A technology is deprecated by analyst decision, not by algorithm. The scan surfaces the case; the analyst makes the call.

---

## The heat map output

For each client, a structured view showing:

- Every technology pair they touch, grouped by horizon (H1 / H2 / H3)
- Current confidence band and hard_evidence_count
- Trajectory direction this quarter (arrow: improving / holding / weakening)
- Pairs that moved horizon since last review (highlighted)
- Pairs flagged for review (surfaced separately)
- New candidate pairs in adjacent applications (surfaced as opportunities)

The heat map is the client-facing output of the quarterly scan. It is not generated automatically — it is produced by running the scan, reviewing the outputs, and assembling the client view. It is an advisory product, not a dashboard.

Cross-client overlay: pairs touched by three or more clients are the shared intelligence layer. A signal affecting one of those pairs affects every client simultaneously. The quarterly scan surfaces these compound-exposure pairs explicitly.

---

## Workflow when built

Not designed in detail yet. Rough shape:

1. Claude Code runs the scan queries against the live database — horizon movement candidates, WNTBT falsification log, candidate new pairs.
2. Output lands in a structured review document (Google Doc or markdown).
3. Analyst reviews each candidate. Approves reclassifications, accepts or rejects new pairs, confirms falsifications.
4. Claude Code runs a population script committing the approved decisions.
5. Heat map views generated per client from the updated database.
6. Findings summarised in a quarterly ontology update note — what moved, what died, what opened.

The workflow requires a human decision gate between steps 2 and 4. The scan produces candidates; the analyst makes calls. This is not automated.

---

## Open design questions

These need answers before the workflow is built:

- **Where does the review document live?** Google Doc (version-controlled by Drive), markdown in the workfiles repo, or a structured form in the hypothesis sheet?
- **How are clients notified?** Email from YAMM, a section in the next account plan refresh, or a standalone heat map brief?
- **Who runs the scan?** Claude Code against the local database, or a hosted endpoint?
- **What is the minimum ontology size before the quarterly scan is worth running?** Probably 50+ pairs across 5+ clients. Below that, the heat map is too thin to surface non-obvious connections.

---

## Dependencies

- Signal Pipeline (formerly WF-15) must be stable and running daily — the WNTBT falsification audit reads the classified signal output.
- Ontology must have transition conditions populated for all technologies — the horizon movement review depends on named trigger events, not general signal volume.
- At least 5 clients and 50 pairs before the first scan is worth running.

---

*Captured: 2026-05-05. Revisit when ontology reaches 50 pairs across 5 clients. This is the telescope. Build it when the mirror is big enough.*
