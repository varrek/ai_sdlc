# Project Improvement Follow-Ups

This document records the project-improvement shortlist that informed `docs/plans/2026-06-29-008-feat-project-foundation-hardening-plan.md`.

The current foundation slice implements or advances the operational items that make later work safer: root CI, Biome lint/format checks, package tarball verification, README guidance, and a security reporting policy. Larger product and host-parity work remains intentionally deferred to separate LFG runs.

## Status Map

| # | Recommendation | Status | Follow-up |
| --- | --- | --- | --- |
| 1 | Add self-CI and release gates | Baseline covered by the foundation slice | Extend later with release workflow, branch protection, and optional Scorecard/CodeQL once CI is stable. |
| 2 | Add lint and formatting | Format/import-order baseline covered by the foundation slice | Add deliberate lint rules later; consider type-aware ESLint only if Biome leaves important project invariants uncovered. |
| 3 | Split `src/customize/repo-miner.ts` | Deferred | Create a dedicated refactor plan before touching the miner; preserve corpus coverage around CI mining, architecture detection, language detection, and monorepo profiling. |
| 4 | Refresh Copilot adapter parity | Deferred | Continue from `docs/plans/2026-06-29-002-feat-refresh-copilot-custom-agents-plan.md`. |
| 5 | Productize loop trace and live host outcomes | Deferred | Continue from `docs/plans/2026-06-29-006-feat-agent-loop-quality-plan.md` and `docs/residual-review-findings/feat-agent-loop-quality.md`. |
| 6 | Harden generated hook runtime | Deferred | Plan a focused change around `src/adapters/*/gates.ts` and the `aisdlc record-event` runtime contract. |
| 7 | Finish large-repo instruction scaling | Deferred | Continue from `docs/plans/2026-06-14-004-feat-large-repo-scaling-plan.md` and `docs/plans/2026-06-29-007-feat-lsp-plugin-doc-gardening-plan.md`. |
| 8 | Add package distribution hardening | Partially in progress | This slice adds package allowlisting and pack verification. Defer LICENSE selection, package-root asset resolution, trusted publishing, provenance, and release automation. |
| 9 | Make evals more realistic and reproducible | Deferred | Continue from `docs/plans/2026-06-29-006-feat-external-repo-eval-workflow-plan.md` and `docs/plans/2026-06-29-005-feat-behavior-eval-v2-readonly-plan.md`. |
| 10 | Revisit serial Vitest constraint | Deferred | Keep `vitest.config.ts` serial by default until the restricted-environment teardown crash is understood; add an opt-in parallel profile separately. |

## Scope Note

This follow-up map is distinct from `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md`, which tracks an agent-language-tooling backlog. Future agents should use this document for the project hygiene and foundation-improvement shortlist, and use the LFG improvement backlog plan for that separate product-track work.

## Foundation Slice Scope Exception

The foundation branch also carries small, test-backed behavior hardening that was present in the active working tree when the Biome baseline was applied:

- GitHub Actions test-command mining prefers test/CI-named jobs over incidental jobs in the same workflow.
- Standards drift detects changed standard metadata, not only added or removed statements.
- Doc gardening ignores markdown links inside fenced and inline code.

These changes should be called out in the PR body so reviewers do not mistake them for formatter churn. They do not replace the larger follow-up to split `src/customize/repo-miner.ts`.
