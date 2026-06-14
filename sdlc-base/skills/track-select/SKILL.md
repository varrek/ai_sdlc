---
name: track-select
description: Choose the ceremony track (Quick / Standard / Full) for a task, mapping task size and risk to how much of the loop runs.
disableModelInvocation: true
---

# /track-select

Pick how much process a task warrants. The track controls which loop stages run —
small changes shouldn't pay for full ceremony, and risky ones shouldn't skip it.

| Track | Stages | Use when |
|---|---|---|
| **Quick** | Engineer → Reviewer | Trivial, low-risk change; thin repos. Skips up-front planning, independent testing, and the integration wrap-up. |
| **Standard** | Architect → Engineer → Tester → Reviewer | Default. A plan is worth writing; the change is independently tested; review is required. |
| **Full** | Architect → Engineer → Tester → Reviewer → wrap-up | Cross-cutting/risky work, or anything that must land as a tracked MR + Jira update. |

The default track comes from `/customize` (inferred from repo richness) and can be
overridden per task. **Review is never skipped** on any track — Quick still runs
the Reviewer; the Architect, Tester, and wrap-up stages scale with ceremony.
(Quick still tests: the Engineer runs the suite as part of implementing — the
Tester adds an independent verification pass on Standard and Full.)

## Compounding memory (minimal)

Each run contributes to a small, gated memory:

- **Gate outcomes** (`approved` / `blocked` / `changes-requested`, with scope and
  reason) append to `.sdlc/gate_history/`.
- **Standards-index deltas** are recorded **only after** the `Approved?` gate
  passes, so the living standards index grows through the gate, never around it.

Promotion of learnings back into skills and similar-failure recall are deferred.
