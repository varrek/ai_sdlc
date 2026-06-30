## Residual Review Findings

Source review: LFG step 4 report-only review for `docs/plans/2026-06-30-001-feat-host-native-instruction-hierarchy-plan.md`.

- P2 `src/cli/status.ts`: Status hierarchy health is still narrower than the plan. Scope counts are implemented, but conflict count, stale pointers, duplicate scoped guidance, and Codex chain-size risk are not all surfaced directly in `status`.
- P2 `src/garden/doc-gardener.ts`: Doc-gardening still lacks duplicate scoped-guidance and stale-evidence checks for `.cursor/rules/*.mdc` versus nested markdown guidance.
- P2 `tests/smoke/smoke.test.ts`: Smoke tests still do not fail specifically when accepted hierarchy state exists but nested host files are missing; coverage remains in customize/compile tests.
- P2 `tests/corpus/behavior-eval-v2.ts`: Behavior validation now avoids duplicate package/hierarchy scoring, but it still uses project-context hierarchy text rather than compiled per-host instruction surfaces.
- P3 `src/core/project-context.ts`: Hierarchy and legacy package instruction bodies remain duplicated for compatibility; future cleanup should make one source canonical.
- P3 `src/core/project-context.ts`: `accepted-merge` ownership is modeled but not yet wired to a Plugin Mode review/acceptance workflow for LLM-authored local guidance.
- P3 `src/core/engine.ts`: Generated-file ownership is currently marker-string based. A user-authored file that intentionally includes the generated marker would be treated as ai-sdlc-owned; a future manifest hash or structured ownership record would make this stricter.
