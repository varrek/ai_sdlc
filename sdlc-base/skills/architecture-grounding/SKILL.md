---
name: architecture-grounding
description: Improve architecture grounding when confidence is low or Architect/Reviewer/Debugger roles remain generic — maps, ADRs, and bounded addenda.
---

# /architecture-grounding

Use when `aisdlc status` or maintain reports low architecture confidence or
generic role grounding for Architect, Reviewer, or Debugger.

## Invariants

- **Do not fake high confidence.** Prefer advisory low-confidence notes with
  reasons over inventing a codebase map.
- **Maps and ADRs.** Point agents at real `docs/`, ADRs, or mined map entries.
- **Plugin Mode.** Use `tune-roles` for bounded `roleAddenda` when evidence
  supports stack-specific guidance.
- **Verify.** Re-run `aisdlc maintain` until `architecture-grounding` clears.

## Flow

1. Read `aisdlc status` architecture reasons and role states.
2. Improve navigation docs or overlay map pointers; draft role addenda from evidence.
3. Compile, smoke, maintain.
