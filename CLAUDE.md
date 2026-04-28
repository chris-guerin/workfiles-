# CLAUDE.md — workfiles- repo

This file is read on every Claude Code session start. It captures the architecture, current state, and active rules so we don't waste a session re-establishing context.

---

## Canonical reference

`ARCHITECTURE.md` at the repo root is the canonical Signal Engine reference (v5.2, 28 April 2026). Doctrine, methodology, pipeline detail, commercial model, roadmap, and the binding Operating Rules (Section 19, R1 through R25) live there. CLAUDE.md is a session-start summary; where the two disagree, ARCHITECTURE.md wins.

---

## Who I am, what I'm doing

Chris Guerin, Client Partner at FutureBridge Advisory. This repo is the home of the Signal Engine, a daily Claude-driven signal classification pipeline that scores RSS feeds against 118 business hypotheses and writes campaign-ready outputs to a Google Sheet for client outreach.

Sectors in scope: Energy, Mobility, Chemicals, Life Sciences, Food & Nutrition, Manufacturing.

Active client work runs through this repo: Shell H3 engagement, BP, ExxonMobil, Chevron, TechnipFMC, MOL, VW Group, plus PE outreach.

---

## Architecture at a glance

| Layer | Tool | Where |
|---|---|---|
| Orchestration | n8n (self-hosted) | `n8n-production-86279.up.railway.app` |
| Signal classification | Claude API call inside n8n HTTP node | model: `claude-sonnet-4-20250514` |
| Hypothesis store | Google Sheet | ID `1DUlVxb66yIgrd7borMm8NSeJHnvkDEBU4jciSKvvdyM` |
| Apps Script bridge | `HypothesisRepository.gs` | within "signal engine p2" project |
| Contacts DB | Datasette on Render free tier | `futurbridge-signals.onrender.com` (27,473 contacts) |
| Tools front-end | GitHub Pages | `chris-guerin.github.io/workfiles-/` |

Deploy on the front-end side is `git add . && git commit -m "update" && git push`. Token is set in the remote URL.

---

## WF-15 Signal Engine pipeline

Status as of 28 April 2026: **broken — OAuth grant for `Google Sheets account 2` credential revoked.** Every Sheets-touching workflow on the n8n instance failed at trigger time today; 9 of 13 active workflows are in FAIL, 4 STALE. WF-15 first failure at 09:00Z, error in `Get News Feeds` node (`EAUTH`, refresh token invalid). 22 nodes, Daily 6am Trigger through Output Summary. Pipeline must run linearly. Branching causes node execution failures.

Last green: 1 April 2026.

The Google Sheets credential `Google Sheets account 2` (id `9aQCdF0Uwmy5qHDV`) is shared by every Sheets node in WF-15 and at minimum WF-07 / WF-09 / WF-15A / Signal Router / 04-Market-Data / Weekly Scan. One reauth in n8n credentials should clear the cascade. Per R24, rotate the grant (not just reauth) since its state is unknown. Per R23, the cascade should have been caught by a morning status check; that check did not happen.

Second oddity to chase: failing node `Get News Feeds` is present in this morning's execution snapshot but absent from the live workflow JSON pulled later. Either the live workflow was edited between failure and pull, or `updatedAt` from `list` is stale. Verify before any push (per R22).

Critical reads on the pipeline:
- Score and Select Best Signal node reads `probability_updates`, NOT `classifications`
- Filter on `overall_classification === 'ACT'`
- Pre-Score Signals node filters ~2,205 signals down to ~205 before Claude processes them
- Datasette cold-start is handled with 2-retry / 60-second wait on the contacts node

**Signal Tracker column offset trap.** The Tracker headers are misaligned from the actual fields. Title sits in `sector_tags`, signal_id sits in `date_detected`, date sits in `source`. Date filtering happens in code, never in the Google Sheets node.

**Campaigns tab columns** (hypothesis sheet, target tab for WF-15 output):
campaign_id, date, hypothesis_ids, signal_summary, topic, subject_executive, body_executive, subject_strategy, body_strategy, subject_tech, body_tech, status, best_hyp_id, probability_delta.

---

## Open items (next session in scope)

0. **Today's incident — rotate `Google Sheets account 2` OAuth grant** (per R24). Reauthorize the credential in n8n, then confirm WF-15 / WF-07 / WF-09 / WF-15A / Signal Router / 04-Market-Data / Weekly Scan return to green via `node sync.js status`. Investigate why R23 (daily status check) did not fire.
1. Fix Write to Campaigns Tab node — change operation to **Append Row**
2. Bulk-set old Signal Tracker rows to HISTORICAL before adding `status=NEW` filter to Get News Feeds
3. Build a Mark Signals Processed node at pipeline end
4. Wire `campaign_manager_v2.html` to read from the Campaigns tab
5. Run a contact count query on Datasette energy tier 1
6. Resolve YAMM spam quarantine — likely needs dedicated sending domain plus Instantly.ai or Smartlead throttled via n8n

---

## Repo structure

```
workfiles-/
├── ARCHITECTURE.md            ← canonical Signal Engine reference (v5.2)
├── CLAUDE.md                  ← this file
├── .claudeignore
├── tools/                     ← all HTML tools + index.html landing page
├── n8n/
│   ├── workflows/             ← WF-15 JSON exports
│   ├── sync.js                ← n8n REST API bridge (in build)
│   └── code-nodes/            ← JS logic per node, editable locally
├── apps-script/               ← GAS source files
├── signal-engine/
│   ├── db/                    ← local SQLite copy of v6 DB
│   └── queries/               ← saved Datasette queries
└── briefs/                    ← client HTML briefs
```

---

## Hard rules — do not break

The full binding ruleset is **Section 19 of `ARCHITECTURE.md` (R1 through R25)**. Read it before any work that touches classification output, hypothesis register, client copy, or pipeline operation. The items below are session-start reminders, not the authoritative list.

- Do not branch WF-15. Linear execution only.
- Do not modify the Hypothesis Sheet column schema. v4 final, 49 columns, frozen.
- Do not abbreviate WNTBT in any client-facing copy. Always written in full.
- Writing rules for any client copy: short declarative sentences, no em-dashes, no consultant clichés, peer register not vendor register, named companies and specific data points throughout. Body copy under 120 words for emails. No FutureBridge name in email body.
- FutureBridge brand v1.1 colours only on visuals: black, white, grey #4B4B55, red #F84E5D as highlight only. Secondary palette (purple, yellow, green, light blue, blue) is for charts only.
- Typography: Circular Std primary, Arial fallback. Sentence case. No all caps. Left-aligned or centred only.

---

## Reference data

- Signal Engine v6 DB: 94 entities, 195 strategies, 55 techs, 299 relationships, 53 investments, 8 regulations, 1,147 contacts (288 emails, 315 phones), SQLite ~2MB
- Hypotheses: 118 total across four layers — 12 personal bets, 14 industry bets, 44 sector hypotheses, 48 client account hypotheses
- Shell H3: SHELL_H3_001–007 in hypothesis repository. £330k engagement converting technology profiles into seven business frames across five strategic domains.

---

## Session start checklist

1. Read CLAUDE.md (this file).
2. Read ARCHITECTURE.md in full, including all 25 rules in Section 19.
3. Read SESSION.md if it exists (continuing session).
4. Read HANDOFF.md for the handoff protocol between chat-Claude and terminal-Claude.
5. Confirm understanding by listing the rules R1-R25 you expect to apply this session.

---

## Secrets — never commit

These are stored as environment variables on this machine. Names only here:

- `N8N_API_KEY` — Railway n8n REST API
- `ANTHROPIC_API_KEY` — Claude API for Signal Engine
- `GITHUB_TOKEN` — GitHub Pages deploy (already in the remote URL)
- `GOOGLE_SHEETS_SA_KEY` — Apps Script / Sheets writes

---

*Last updated: 28 April 2026*
