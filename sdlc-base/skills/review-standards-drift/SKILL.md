---
name: review-standards-drift
description: Review standards-index drift after customize re-runs — accept, adjust overlay standards, or document intentional changes.
---

# /review-standards-drift

When mining changes, `customize` diffs the standards index and records drift
(added/removed/changed metadata). This skill makes that delta a human decision.

## Invariants

- **Drift is reviewable by design.** Do not silently ignore added/removed
  standards.
- **Overlay edits only.** Adjust `.sdlc/overlay/.customize.yaml` standards or
  interview answers — not the base constitution.
- **Verify.** Re-run `aisdlc customize` or `aisdlc maintain` and confirm drift
  is resolved or accepted.

## Flow

1. Re-run `aisdlc customize --repo .` and read the drift summary in CLI output.
2. Compare `.sdlc/overlay/standards-index.yaml` to prior git revision if needed.
3. Accept the delta, trim incorrect standards, or add overlay standards that
   encode team policy.
4. Re-run `aisdlc maintain`.
