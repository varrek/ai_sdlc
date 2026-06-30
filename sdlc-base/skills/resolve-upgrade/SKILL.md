---
name: resolve-upgrade
description: Resolve overlay conflicts after a blocked aisdlc upgrade using upgrade-conflicts.yml, then retry upgrade.
---

# /resolve-upgrade

When `aisdlc upgrade` blocks, it writes `.sdlc/upgrade-conflicts.yml` and leaves
the overlay byte-identical. You reconcile base changes with project-owned edges.

## Invariants

- **Read the report.** Start from `.sdlc/upgrade-conflicts.yml` — do not guess
  collisions.
- **Preserve intent.** Keep team choices for standards, integrations, track, and
  role models unless the new base requires a deliberate migration.
- **Verify.** After editing the overlay, run `aisdlc upgrade` again, then
  `aisdlc maintain`.

## Flow

1. Read `.sdlc/maintenance-report.json` and `upgrade-conflicts.yml`.
2. For each conflict, choose overlay vs new-base value with a one-line rationale.
3. Present the overlay diff for approval; retry upgrade.
4. Re-run `aisdlc maintain` to refresh the maintenance report.
