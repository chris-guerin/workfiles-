# HANDOFF.md — the briefing template for moving between chat and terminal

This file solves the carrier-pigeon problem. Chris is the human bridge between two Claude instances: the chat instance (strategic partner) and Claude Code (executor in the terminal). They cannot see each other's work. This file is the structured briefing that flows in either direction.

## How to use it

When switching from chat to terminal: copy the OUTBOUND block below and paste into Claude Code as the first message of the session.

When switching from terminal to chat: have Claude Code fill out the INBOUND block, copy it, paste into the chat conversation.

Each handoff is short and structured. No prose. No ambiguity.

---

## OUTBOUND — chat to terminal

When you're starting a new Claude Code session or giving it a new task block, fill this in and paste:

```
HANDOFF FROM CHAT — [timestamp]

GOAL FOR THIS BLOCK:
[one sentence, specific]

RELEVANT ARCHITECTURE.MD SECTIONS:
[section numbers, e.g. 7.1, 16-Build-E, R22, R25]

DECISIONS ALREADY MADE (do not relitigate):
[bullet list, with rule references where relevant]

OPEN QUESTIONS YOU SHOULD ASK BEFORE STARTING:
[bullet list of things Chris and chat have not yet decided, that you must surface before executing]

EXPECTED ARTEFACTS:
[files you should create or modify, and the test for "done"]

TIME BUDGET:
[rough hours]

ESCALATE TO CHAT IF:
[trigger conditions for stopping and pasting back to chat]
```

---

## INBOUND — terminal to chat

When you need strategic input from chat, fill this in and ask Chris to paste:

```
HANDOFF FROM TERMINAL — [timestamp]

WORK COMPLETED SINCE LAST HANDOFF:
[bullet list, terse]

CURRENT STATE OF SYSTEM:
[what's true right now: workflows green/red, files changed, pending pushes, etc.]

OPEN QUESTION FOR CHAT:
[the strategic question, one specifically. Include the decision space — what are the realistic options, what are the trade-offs.]

WHAT I WILL DO NEXT:
[default plan if no input from chat. This makes the question concrete: chat is choosing between continuing on the default or redirecting.]

FILES CHAT SHOULD READ TO ANSWER:
[paths and line ranges of files that contain the context for the question]
```

---

## Operating rules for the handoff

These rules sit alongside ARCHITECTURE.md Section 19 and govern the chat-terminal handoff specifically.

**H1. Every Claude Code session begins by reading CLAUDE.md, ARCHITECTURE.md (full), and SESSION.md (if continuing).** No work happens before context is loaded.

**H2. Strategic decisions are escalated to chat, not made by Claude Code unilaterally.** Strategic means: changes to architecture, methodology, commercial position, ruleset, or roadmap priority. Tactical means: code edits within an agreed plan, fixing typos, running diagnostics, applying decisions already made. Tactical = proceed. Strategic = escalate.

**H3. The default plan in INBOUND is binding unless chat redirects.** This stops "I asked a question and got nothing back so I waited" failure mode. Claude Code keeps moving on the default. Chat redirects if needed.

**H4. SESSION.md is the working memory. ARCHITECTURE.md is the doctrine and rules.** Don't update ARCHITECTURE.md mid-session unless R25 forces it (material change shipped). Do update SESSION.md continuously.

**H5. At session end, SESSION.md is archived to `sessions/YYYY-MM-DD-HH.md` and cleared.** This protects the working memory from drift across sessions.

---

*This file is read by both Claude Code at session start (alongside CLAUDE.md and ARCHITECTURE.md) and Chris when constructing handoffs. It is not read by the chat Claude on its own; Chris pastes the relevant blocks into the chat manually.*
