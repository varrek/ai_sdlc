---
name: garden-docs
description: Repair agent-facing documentation from a doc-gardening report — fix broken links, trim bloated root instructions, and resolve hierarchy budget warnings after the CLI applies safe deterministic fixes.
---

# /garden-docs

Keep agent-facing docs lean, linked, and navigable. The CLI handles mechanical
repairs; you (the host agent) handle judgment-heavy edits grounded in repo
evidence. Every patch must pass a re-run of `aisdlc garden` before you present
the diff for human review.

## Invariants (non-negotiable)

- **CLI first.** Run `aisdlc garden --repo .` before editing. It regenerates
  stale generated docs and appends missing codebase-map sections, then writes
  `.sdlc/doc-gardening-report.json`.
- **Verify after every edit.** Re-run `aisdlc garden --repo .` (or
  `aisdlc garden-docs --fix --write-report`) so link checks and bloat thresholds
  confirm your patch. Do not claim success from prose alone.
- **Reviewable.** Present a normal git diff of doc changes for human approval.
  Never hide edits outside tracked markdown.
- **No invented targets.** For `broken-local-link`, only point links at files
  that exist in the repo. Search `git log`, similar paths, and headings before
  changing a target.

## Finding playbook

| Finding id | Your job |
| --- | --- |
| `broken-local-link` | Locate the correct file or restore the missing doc; update the markdown link. |
| `root-doc-bloat` | Move package- or task-specific prose into `docs/` or layered skills; keep the root file as a table of contents with pointers. |
| `hierarchy-codex-budget` | Trim or split local `AGENTS.md` bodies so the Codex chain stays under budget; keep root as TOC. |
| `hierarchy-scope-missing` | Prefer `aisdlc compile` to emit missing scope files; only hand-author when compile cannot run. |
| `doc-scan-truncated` | Narrow the docs tree (exclude vendor/generated paths) or ask the team to raise scan limits — do not guess at unscanned links. |

Deterministic fixes (`stale-capability-matrix`, `missing-codebase-map`) are
already applied by `aisdlc garden`; do not redo them unless the report still
lists them after a fresh run.

## Flow

1. **Run the workflow.** `aisdlc garden --repo .` applies safe fixes and writes
   `.sdlc/doc-gardening-report.json` plus `.sdlc/doc-gardening-report.md`.
2. **Read the report.** Load the JSON findings list. Group by `path` and `id`.
3. **Draft minimal patches.** For each judgment finding, change only what the
   check requires. Cite the repo signal you used (path, rename, heading).
4. **Verify.** Re-run `aisdlc garden --repo .` until judgment findings are gone
   or you document why a finding is intentionally accepted.
5. **Review.** Show the doc diff. For remaining warnings the team chooses to
   keep, note them in the PR or task comment.

## When to use

- After `aisdlc garden` reports findings that need judgment.
- On a schedule (weekly doc gardening) alongside CI `aisdlc garden-docs --fail-on warning`.
- Before large refactors that move or rename `docs/` paths agents rely on.

## Notes

- Report-only checks: `aisdlc garden-docs --write-report` (no deterministic fixes).
- CI gate: `aisdlc garden-docs --fail-on warning --write-report`.
- This skill does not open PRs or call external LLM APIs — it uses the host
  model already available in Plugin Mode.
