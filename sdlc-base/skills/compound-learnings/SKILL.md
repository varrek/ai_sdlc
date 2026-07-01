---
name: compound-learnings
description: Review accepted learnings and gate outcomes promoted from customize drift — keep durable repo facts in the learnings ledger.
---

# /compound-learnings

Customize syncs some facts into `.sdlc/accepted-learnings.json` (test commands,
architecture demotions, new standards). Review before they become long-lived
agent guidance.

## Invariants

- **Ledger is durable.** Edits go to accepted learnings or overlay — not hidden
  compile output.
- **Evidence-backed.** Each learning must keep `sources` and `provenance`.
- **Verify.** Re-run `aisdlc status` and `aisdlc maintain`.

## Flow

1. Read `.sdlc/accepted-learnings.json` after a customize drift event.
2. Drop noisy entries; keep high-signal claims agents should prefer over inference.
3. Re-run `aisdlc maintain`.
