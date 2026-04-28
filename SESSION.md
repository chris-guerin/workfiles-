# SESSION.md — working memory for the current session

This file is the live scratchpad for the work currently in progress. It is updated by Claude Code as work happens. It is read by Chris when switching context. Sections of it are pasted into the chat with the other Claude when strategic input is needed, and answers come back here.

When a session ends, this file is archived to `sessions/YYYY-MM-DD-HH.md` and cleared, ready for the next session.

---

## Session header

**Date:** [updated at session start]
**Operator:** Chris
**Strategic partner (chat):** Claude (desktop app)
**Executor (terminal):** Claude Code
**Session goal in one sentence:** [what we're trying to get done in this session]
**Time budget:** [hours available]
**Linked rules from ARCHITECTURE.md Section 19:** [list any rules that govern this session's work, e.g. R22 no push without diff, R25 doc same-day update]

---

## Context loaded

[Claude Code lists what it has read from the repo at session start: CLAUDE.md, relevant ARCHITECTURE.md sections, prior SESSION.md if continuing, any other files.]

---

## Plan

[The plan for the session, written by Claude Code based on the goal. Numbered steps. Each step has expected outcome and rough time estimate. Plan is shown to Chris before any execution begins.]

---

## Working log

[Append-only log of what happens. Each entry is timestamped. Format:

[HH:MM] STEP N — what was attempted
[HH:MM] RESULT — what happened (success, failure, partial)
[HH:MM] DECISION — choice made and why
[HH:MM] ESCALATE — strategic question for chat
[HH:MM] BLOCKED — waiting on external input

This is the audit trail. When something goes wrong, this is the post-mortem source.]

---

## Open questions for strategic partner (chat)

[Questions that need the chat Claude's input. Numbered. Each question has the context Chris will paste, and the specific decision needed. When the chat answers, the answer goes here too with timestamp.]

---

## Decisions made

[Decisions that have been finalised and are now binding for the rest of the session. Reference rule numbers where relevant.]

---

## Files changed

[Running list of files changed during the session, with brief reason. Format: PATH | ACTION | REASON]

---

## Pending push to n8n

[Per R22, every push to n8n must go through diff and confirm. This section lists workflows that have local changes ready for review before push.]

---

## Session end

[At session end, this section is filled in: what was completed, what is parked, what needs to carry into the next session. Then the file is archived.]
