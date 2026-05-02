# Next session — gate 5 diagnosis and prompt rewrite

**Status at session close (2026-05-02):** Substrate landed. Gate 5 not closed. Three Haiku runs today all failed the same way. Filter not applying as observed; root cause undiagnosed.

---

## What is live and working

- **PG `hypothesis-db`** at schema v6.0. Migration 004 committed. All eight initiative-model tables plus the four pipeline tables (news, mini_signals, signals, heat_map_aggregates) exist with correct FKs, CHECKs, indexes.
- **API service** `signal-engine-api-production-0cf1.up.railway.app` healthy. Bearer auth working. POST /news, GET /news, DELETE /news/:id, POST /mini_signals all verified by smoke test.
- **WF-WeeklyNews-PG** (`gOwTXiGfkZm5vFTO`) running end-to-end. RSS pull → Detect Companies & Tag → Remove Duplicates → POST /news → Fire WF-15A-PG webhook. Confirmed today: 1469 news rows in PG from gate 5 trigger runs. The workflow exits in red because `Email Alert to Chris` Gmail OAuth is expired (deferred re-auth, pre-existing issue), but the data path completes cleanly before that.
- **WF-15A-PG** (`KtFda6LGUSfbYNDQ`) running end-to-end at the structural level — webhook receives, GET /news fetches, code nodes execute in order, POST /mini_signals + DELETE /news/:id wire correctly. The pipeline mechanics are sound. The Haiku-side decision logic is not producing useful output.

Gates 1–4 closed. Gate 3 verified by 1088 successful POST /news calls in the gate 3 trigger window after credential and body-expression bugs were fixed.

---

## Gate 5 — not closed today

Three Haiku runs today produced 84 → 0/3/3 → 0 mini_signals across four executions, none of which hit the 20–50 target. Across all three runs, the per-node output count from `Parse + Validate Mini-Signal` matched its input count (1102 → 1102 in the most recent run), prompting the user's diagnostic claim:

> *"The filter is not being applied, regardless of which prompt is in the system prompt."*

**Specific next-session task: read `/n8n/wf-15a-pg-current-state.md`** (committed today). It contains the byte-exact verbatim live state of the deployed `Build Extraction Payload` and `Parse + Validate Mini-Signal` nodes, captured from the n8n public API at session close. Local files match live exactly — no divergence.

The file also walks through:
- Why a 1102-in / 1102-out at Parse + Validate is consistent with the validator working as designed (it tags rather than drops; the drop happens at `Collect + Write to Datasette`).
- Why the observed mini_signals=0 outcome rules out the "filter not firing" hypothesis and points to "every Haiku response is skip:true."
- Three candidate causes for the universal-skip pattern.
- The diagnostic sequence to run before any further prompt patch.

**Start here — diagnose before any further trigger.** Per user instruction at session close: hierarchical three-step prompt rewrite is the planned approach (each step conditional on the previous, explicit "Stop" instructions on skip paths) — final form to be written by Chris after diagnosis. Do not iterate-and-trigger blindly.

### Suspected mechanism (working hypothesis — verify before acting)

Either:

- **(p1)** the `centrally about` criterion in the v3 system prompt is being interpreted too literally by Haiku, causing it to return `skip:true` on items where the story is about a *company* in energy/mobility rather than about energy/mobility *as subjects*, OR
- **(p2)** the title-only RSS input shape is causing Haiku to default to skip even though the prompt explicitly allows substantive titles, OR
- **(p3)** something about how Haiku is structuring its response is triggering the `PARSE_FAILED` branch in Parse + Validate before the explicit `skip:true` branch is reached.

Diagnostic step 1 in the state file (sample raw `Claude Haiku Extract` output for ~10 random items from the last execution) discriminates between these.

---

## Captured design decisions from today

These were agreed during the session and need to land in `ARCHITECTURE.md` and `/docs/N8N_IMPLEMENTATION.md` next session:

- **WF-15A v0 is direct-relevance-only.** Adjacency reasoning is deferred. Stories about pharma, aerospace, defence, packaging, chemicals are explicitly out of scope until a later version. Haiku is instructed to drop them even if a clever connection could be made. This is a deliberate v0 recall trade for precision.
- **WF-WeeklyNews-PG cadence is weekly v0.** Schedule trigger is `Weekly Monday 7am`. Active flag is currently `true` on the workflow but Test workflow was used for all gate 5 triggers today.
- **WF-15C cross-domain enrichment is the planned home for adjacency reasoning.** Position in pipeline: after WF-15B routing, before WF-15D claim assessment. WF-15C does not exist yet — design intent only. Once methodology v1's entity catalogue is populated, WF-15C is where adjacency-aware enrichment lives so WF-15A can stay tight.

---

## Open operational issues

- **Gmail OAuth on `Email Alert to Chris` node expired.** WF-WeeklyNews-PG ends in error on every run due to this, even though the data path (POST /news + Fire WF-15A-PG webhook) completes cleanly before the email node. Pre-existing item from earlier `_next.md`. Fix: re-authorise Google OAuth in n8n credentials. Not gate-5-blocking but visually noisy in the executions list.
- **Anthropic API key in plaintext in WF-15A-PG `Claude Haiku Extract` node `headerParameters`.** Carried over from legacy WF-15A. Per R24, this counts as exposed (it appeared in the workflow JSON the user pasted into chat transcript today). Rotate next session — generate new key in Anthropic console, update n8n node, retire old key.
- **Smoke-test residue cleanup script left at `db/_cleanup-smoke-test-residue.mjs`.** Already used. Disposable, safe to delete in cleanup gate.
- **Multiple disposable diagnostic scripts** under `db/` and `n8n/` (prefix `_`) left behind from gate 5 work. List in `n8n/wf-15a-pg-current-state.md` and the gate 5 commit message. Clean up at the start of next session or on close.

---

## What is in scope for next session

1. Read `/n8n/wf-15a-pg-current-state.md` in full.
2. Run the diagnostic sequence in section "Recommended next-session diagnostic sequence" of that file. **Step 1 first** (sample raw Haiku outputs). Do not edit anything before that produces concrete data.
3. Once the cause is identified, implement the hierarchical three-step prompt rewrite per Chris's design intent. Final prompt text to be written by Chris.
4. After re-deploy via sync.js (with R22 diff confirmation), re-run gate 5 verification per the close criteria specified in the gate 5 trigger sequence (clean PG baseline, fresh WF-WeeklyNews-PG trigger, count + 15-sample analysis).
5. Update ARCHITECTURE.md and `/docs/N8N_IMPLEMENTATION.md` with the captured design decisions (direct-relevance-only v0, weekly cadence, WF-15C as home for adjacency).
6. Address operational issues batch (Gmail OAuth + Anthropic key rotation) — possibly a separate session if it expands.
7. Tidy disposable `_*` scripts.

---

## What is NOT in scope for next session

- Modifying gates 1–4 (substrate is good).
- Touching `WF-WeeklyNews-PG` workflow shape (it works; only the email node is broken, and that's a credential issue).
- Methodology-v1 entity-catalogue population (still queued for after gate 5 is closed; it depends on a working signal pipeline).
- Building WF-15B / WF-15C / WF-15D (these are sequenced after gate 5 close per `MIGRATION_004_AND_WORKFLOWS_SPEC.md`).

---

## Reference paths (this session)

- `MIGRATION_004_AND_WORKFLOWS_SPEC.md` — the executable spec for gates 1–5
- `n8n/wf-15a-pg-current-state.md` — live deployed state of WF-15A-PG's two key code nodes
- `db/migrations/004_substrate.sql` + `_runner.js` — committed migration
- `api/index.js` — the deployed API service
- `n8n/code-nodes/wf15apg/build-extraction-payload--4ba2c2.js` — local copy of the v3 prompt code
- `n8n/code-nodes/wf15apg/parse-validate-mini-signal--1a760a.js` — local copy of the validator (skip:true gated, confidence retired)
- Session executions of interest (n8n): WF-WeeklyNews-PG `gOwTXiGfkZm5vFTO` exec ids 906/908/916/919/922; WF-15A-PG `KtFda6LGUSfbYNDQ` exec ids 907/909/911/915/917/920/921/923.

---

## Linked rules to re-read at session start

- **R14** (schema freeze — currently v6.0 deployed; migration 004 committed today)
- **R22** (no n8n push without diff and confirmation — sync.js patched today to sanitise settings on PUT)
- **R23** (morning status check via `node sync.js status --since 24h`)
- **R24** (rotate exposed credentials immediately — Anthropic key noted above)
- **R25** (doc same-day update — design decisions to land in ARCHITECTURE.md tomorrow)
- **R26** (end-of-session git hygiene — applied this session per gate boundary)
