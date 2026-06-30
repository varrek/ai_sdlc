---
name: bench-triage
description: Triage failures from aisdlc bench external-repo evaluation reports when maintain was run with --bench.
---

# /bench-triage

For maintainers running `aisdlc maintain --bench`. The CLI runs a pinned external
corpus eval; this skill interprets failures without weakening gates.

## Invariants

- **Read the report.** Start from the bench report path in
  `.sdlc/maintenance-report.json` (under `.verify/reports/`).
- **Product vs corpus.** Distinguish miner regressions, catalog pin issues, and
  intentional capability gaps.
- **Fix in repo code/tests**, not by skipping corpus checks.

## Flow

1. Open the bench JSON/markdown report listed in the maintenance handoff.
2. Identify failing repos and failure class (setup, smoke, agent quality).
3. Patch ai-sdlc miner/adapters/tests as needed; re-run `aisdlc maintain --bench`.
