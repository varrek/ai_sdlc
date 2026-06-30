# Tech Debt Audit - ai-sdlc

Generated: 2026-06-30 (repeat-run refresh)

## Executive Summary

- **RESOLVED in this pass:** F002, F009, F011, F012, F017, F018, F022, F023, F026, F027, F028, F029, F030, F034, F036, F041, F042, plus previously fixed F003, F005, F008, F010, F019, F020, F021, F024, F031, F033, F043.
- **Remaining (deferred):** F001 (full repo-miner modularization), F013–F016 (CLI/perf refactors), F025 (accepted-learnings-sync layering), F037–F038 (eval framework docs / snapshot split), F039–F040 (breaking dependency upgrades), F044–F045 (historical plan doc drift).
- Test and type checks are green on this branch: `npm run typecheck` passed and `npm test` passed 474 tests with 1 skipped.

## Architectural Mental Model

`ai-sdlc` is a TypeScript CLI/compiler for deriving host-native AI-agent configuration from a host-neutral base. The source model flows from `sdlc-base/` and optional `packs/` through `src/core/loader.ts` and `src/core/merge.ts`, then pure host adapters under `src/adapters/` emit Cursor, Claude Code, Copilot, and Codex files. The CLI in `src/cli/` coordinates `customize`, `compile`, `smoke`, `status`, `bench`, and doc-gardening workflows.

The `customize` path is the highest-risk product path. `src/customize/repo-miner.ts` scans a repository, infers stack, architecture, packages, CI commands, E2E commands, and evidence. `src/customize/emitters.ts` converts that profile into overlay state, standards, and project context. The eval and bench code under `src/eval/` then runs this chain against fixtures and external repos to prove setup quality. That means miner accuracy, freshness fingerprints, and emitted gate scripts are the central contracts. When these contracts are weak, the product either gives agents stale guidance or marks a repo setup-ready on shaky evidence.

## Tooling Evidence

- `npm run typecheck`: passed.
- `npm test`: passed, 46 test files passed, 1 skipped, 360 tests passed, 1 skipped.
- `npm audit --audit-level=low`: failed with 7 vulnerabilities reported. The remediation suggested by npm requires breaking upgrades.
- `npx --yes madge --circular src`: passed, no circular dependency found.
- `npx --yes depcheck`: passed, no depcheck issue.
- `npx --yes knip`: reported 16 unused fixture files, 29 unused exports, and 31 unused exported types.
- `node dist/cli/index.js garden-docs --repo . --config . --format json`: reported one `broken-local-link` finding in `docs/packs.md`.

## Findings

| ID | Category | File:Line | Severity | Effort | Description | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| F001 | Architectural decay | `src/customize/repo-miner.ts:1` | High | L | `repo-miner.ts` is a 1,704-line god module handling directory walking, language detection, architecture inference, package mining, CI parsing, Makefile parsing, E2E detection, and test-command inference. It is also one of the largest and most-modified files. | Split by contract: `walk`, `language-signals`, `architecture`, `workspace-packages`, `ci-test-command`, and `e2e-command`. Keep `mineRepo` as orchestration. |
| F002 | Performance and architecture | `src/customize/repo-miner.ts:1160` | Medium | M | `minePackage` re-runs `mineRepo` for every workspace package. That repeats the full scan logic per package and scales poorly on large monorepos. | Pass a precomputed file inventory/signals object into package mining or make `mineRepo` able to mine a subtree without repeating global discovery. |
| F003 | Consistency rot | `src/customize/repo-miner.ts:1384` | Medium | S | GitHub workflow files are ranked before scanning, but jobs inside a workflow are not ranked for unit tests. | Rank jobs in `testCommandFromWorkflow` the way E2E and GitLab paths already do. |
| F004 | Consistency rot | `src/customize/repo-miner.ts:1507` | Medium | S | E2E workflow parsing ranks jobs, while unit-test workflow parsing at `src/customize/repo-miner.ts:1636` iterates `Object.values(jobs)`. The two paths will drift. | Extract one workflow job/step walker with a rank callback and segment picker. |
| F005 | Test-command contract | `src/customize/repo-miner.ts:1688` | Medium | S | Makefile test-command inference returns the first recipe line without passing through `pickTestSegment`. Install/setup lines under `test:` can be treated as the runnable test command. | Normalize Makefile recipes through `pickTestSegment` before returning. |
| F006 | Documentation drift | `src/customize/repo-miner.ts:1371` | Low | S | The comment says priority includes `package.json/pyproject`, but implementation only has an explicit `package.json` script branch; Python falls through to inferred runner evidence. | Narrow the comment or add an explicit pyproject branch if a manifest script becomes supported. |
| F007 | CI support gap | `src/customize/repo-miner.ts:1374` | Medium | M | The code and comment state CI mining covers GitHub Actions and GitLab CI, while earlier mining collects more CI-shaped files. CircleCI evidence can appear in standards but cannot resolve the test command. | Either mine CircleCI for test commands or keep CircleCI out of command-resolving evidence until supported. |
| F008 | Type and contract debt | `src/customize/gap-interview.ts:24` | High | S | The `test-command` gap is considered answered if the key exists in `answers`, even when the value is an empty string. This can mark setup ready with no runnable command. | Require `answers["test-command"]?.trim()` to be non-empty and add a regression test. |
| F009 | Security and config hygiene | `src/customize/emitters.ts:181` | Low | S | Interview answers for `gitlab-server` and `jira-server` become integration bindings without ID format validation at synthesis time. | Validate server IDs against the overlay schema or a conservative ID regex before building bindings. |
| F010 | Documentation drift | `src/customize/emitters.ts:382` | Medium | S | `diffStandardsIndex` is documented as reviewable standards drift, but it only compares statement text and ignores source/scope changes. Evidence-only drift is invisible. | Compare statement, scope, and sources, or rename the helper to make the limitation explicit. |
| F011 | Consistency rot | `src/customize/repo-miner.ts:7` | Medium | M | Miner exclusions include host config directories such as `.claude`, `.cursor`, `.codex`, `.windsurf`, `.aider`, and `.agents`, but `DEFAULT_EXCLUSIONS` omits them. | Make emitted exclusions derive from the miner ignore set or a shared exclusion registry. |
| F012 | Documentation drift | `src/core/project-context.ts:41` | Low | S | The comment says `DEFAULT_EXCLUSIONS` mirrors repo-miner ignores minus `.git`, but the lists differ beyond `.git`. | Update the list or update the comment to describe the intentional difference. |
| F013 | Performance | `src/cli/customize.ts:86` | Medium | M | `runCustomize` always mines the full repo even when freshness later skips writes. On large repos, freshness still pays the full scan cost. | Cache mined profiles by a file inventory fingerprint or split a cheap freshness precheck from full mining. |
| F014 | Performance | `src/cli/status.ts:90` | Medium | S | `aisdlc status` calls `inspectRepo`, which mines the repo just to produce a read-only report. | Reuse persisted project context and phase fingerprints where possible, with a `--refresh` path for full remine. |
| F015 | Performance | `src/cli/smoke.ts:75` | Low | S | `smoke` re-mines the repo only to compute blocking gap count after loading overlay answers. | Persist the mined gap inputs during customize or accept a known gap count from the setup phase state. |
| F016 | Architectural decay | `src/cli/index.ts:20` | Medium | M | `cli/index.ts` mixes help text, routing, command implementations, loop-event validation, event dedupe, and process exits in one 484-line entry file. | Move command handlers into `src/cli/commands/` or per-command modules. Keep `index.ts` as a thin router. |
| F017 | Type and contract debt | `src/cli/index.ts:52` | High | S | `isLoopTraceEvent` validates only the event type string. Required fields like `taskId`, `verdict`, role/stage fields, and event-specific payloads are not validated before persistence. | Add discriminated runtime validation for loop trace events and reject malformed events at `record-event`. |
| F018 | Test debt | `src/cli/index.ts:407` | Medium | S | `record-event` dedupe and validation live inside the CLI entrypoint and have no focused unit-test surface. Recent fixes touched this area repeatedly. | Extract `record-event` helpers and add unit tests for malformed events, duplicate approvals, and unknown task IDs. |
| F019 | Architectural decay | `src/adapters/claude-code/gates.ts:4` | High | M | Approved-gate scripts are copied across host adapters with only small message/path differences. | Generate all approved gates from a shared template with host-specific options. |
| F020 | Consistency rot | `src/adapters/cursor/gates.ts:55` | Medium | S | The loop stage allowlist is embedded in emitted gate script strings and repeated across host adapters. | Export the allowed stage list from the core loop model and interpolate it into gate templates. |
| F021 | Dependency and security hygiene | `src/adapters/claude-code/gates.ts:54` | High | M | Runtime gate scripts shell out to `npx --yes aisdlc record-event`. That can hit the registry and resolve a different CLI version while enforcing a security-sensitive gate. | Emit a local recorder script or call a project-local compiled CLI path pinned by the generated config. |
| F022 | Error handling | `src/adapters/cursor/gates.ts:17` | Medium | S | Cursor MCP gate swallows role-policy parse failures. If the policy file exists but is malformed, `hasPolicy` becomes false and the gate becomes inert. | Fail closed when a policy file exists but cannot be parsed; keep missing-file bootstrap behavior separate. |
| F023 | Security hygiene | `src/adapters/copilot/gates.ts:130` | High | S | The Copilot CI workflow interpolates `test-command` directly into YAML `run:` at `src/adapters/copilot/gates.ts:142`. Multiline or special YAML content can break or alter the generated workflow. | Emit a YAML block scalar or validate/escape the command before writing workflow YAML. |
| F024 | Test debt | `src/adapters/cursor/gates.ts:35` | High | M | MCP gate runtime behavior is tested, but approved-gate runtime behavior across hosts is not covered with equivalent hook tests. | Add parametrized runtime tests for `SDLC_APPROVED`, exit codes, event recording, and failure-to-record behavior. |
| F025 | Architectural layering | `src/core/accepted-learnings-sync.ts:1` | Medium | S | Core sync code imports customize-layer types and functions, making `core` depend upward on `customize`. | Move the sync orchestration into `customize` or `cli`; keep only ledger primitives in `core`. |
| F026 | Consistency rot | `src/core/memory.ts:90` | Low | S | `readJsonl` is duplicated in `src/core/accepted-learnings.ts:158`. | Extract a shared `core/jsonl.ts` helper. |
| F027 | Type and contract debt | `src/core/memory.ts:76` | Medium | S | `readLoopEvents` casts JSONL lines to `LoopTraceEvent` without runtime validation. Valid JSON with the wrong shape is accepted. | Reuse the loop trace validator used by `record-event` once added. |
| F028 | Type and contract debt | `src/core/project-context.ts:86` | Medium | S | `parseProjectContext` validates only top-level arrays, then returns `packages`, `map`, and `exclusions` unchecked. | Add a Zod schema or explicit validators for package and map entries. |
| F029 | Error handling | `src/eval/setup-chain.ts:125` | High | M | Setup artifact collection reads required generated files with `readFileSync` and no typed error handling. Missing or partial artifacts become opaque thrown I/O errors. | Wrap artifact reads and return/classify structured setup failures. |
| F030 | Error handling | `src/eval/setup-chain.ts:150` | Medium | S | Overlay YAML parse errors in `readSetupArtifacts` throw directly before the eval report can classify them. | Catch YAML parse errors and route them through `resultFromSetupError` or a typed result. |
| F031 | Type and contract debt | `src/eval/loop-behavior-eval-state.ts:61` | High | S | The eval-state writer accepts `LoopBehaviorEvalResult[]` by type assertion and writes without validating. The reader later rejects invalid state, leaving corrupt YAML on disk. | Validate results with `isEvalResult` before writing and make invalid writes throw. |
| F032 | Test debt | `tests/eval/loop-behavior-eval-state.test.ts:65` | Medium | S | The test named "validates result structure before accepting" writes invalid data and only expects the reader to return undefined. It documents the current inconsistency instead of preventing it. | Change the test to expect write-time rejection. |
| F033 | Error handling | `src/eval/repo-cache.ts:165` | Medium | S | Symlink scanning calls `realpathSync`, `readdirSync`, and `lstatSync` without catching broken symlink, permission, or ELOOP failures. | Convert filesystem failures into structured repo materialization failures. |
| F034 | Error handling | `src/eval/catalog.ts:33` | Medium | S | Catalog file read, JSON parse, and schema validation throw before `bench` can write a structured failure report. | Catch catalog-load failures at the bench boundary and emit a report with a workflow failure class. |
| F035 | Test debt | `src/eval/report.ts:272` | Medium | S | `classifySetup` drives bench failure classes but lacks table-driven tests for the major branches. | Add minimal `SetupChainResult` fixtures for `emitter-bug`, `monorepo-miner-limitation`, `repo-edge-case`, and `needs-triage`. |
| F036 | Security hygiene | `src/eval/redact.ts:1` | Medium | S | Redaction is security-sensitive and only seven lines, but it has no dedicated tests for URL credentials, token-like query values, or truncation. | Add a focused `redact.test.ts` covering each regex and the length cap. |
| F037 | Test architecture | `tests/corpus/behavior-eval.ts:1` | Medium | L | The repo carries multiple overlapping eval frameworks: behavior eval v1, behavior eval v2, and loop behavior eval. | Document ownership boundaries and plan deprecation/convergence so each eval answers a distinct product question. |
| F038 | Test debt | `tests/golden/__snapshots__/compile.test.ts.snap:1` | Medium | L | The 3,120-line golden snapshot is the largest file and among the highest-churn files. Small adapter changes can create noisy reviews. | Keep the full snapshot if it protects host output, but add targeted structural assertions and consider splitting by host. |
| F039 | Dependency and config debt | `package.json:20` | High | S | `npm audit` reports vulnerabilities through `gray-matter`/`js-yaml`, including a moderate DoS advisory. Npm's suggested fix is breaking. | Evaluate upgrading or replacing `gray-matter`; if not feasible, document runtime exposure and pin an accepted residual. |
| F040 | Dependency and config debt | `package.json:27` | High | S | `npm audit` reports vulnerable `vitest` -> `vite` -> `esbuild` paths, including high/critical entries. These are dev-server related but still present in the lockfile. | Upgrade Vitest/Vite on a dedicated branch and run the full test suite; otherwise document why dev-only exposure is acceptable. |
| F041 | Dead code | `src/customize/repo-miner.ts:1704` | Low | S | `knip` reports `IGNORE_DIRS` as an unused export. It looks like a leftover API surface rather than an internal constant. | Remove the export or add a real shared consumer if exclusions are meant to be centralized. |
| F042 | Dead code | `src/cli/compile.ts:56` | Low | S | `knip` reports `runCompile` as an unused export. | Make it internal or add a documented programmatic API consumer. |
| F043 | Documentation tooling bug | `src/garden/doc-gardener.ts:269` | Medium | S | `garden-docs` flags the regex text in `docs/packs.md:89` as an undefined reference-style link because markdown link scanning does not ignore code spans. | Strip or mask code spans/fenced code before running markdown link regexes. |
| F044 | Documentation drift | `docs/plans/2026-06-29-007-feat-lsp-plugin-doc-gardening-plan.md:103` | Low | S | The plan lists `tests/fixtures/doc-gardening/`, but current tests use inline temporary repos and that fixture directory is absent. | Update the plan to match the implementation or add the fixture directory. |
| F045 | Documentation gap | `docs/eval/external-repo-workflow.md:20` | Low | S | The external eval workflow documents the fix loop but omits advanced controls such as checkpoint resume, `--fail-on-class`, and the opt-in external corpus environment gate. | Add an "Advanced" section for resume/checkpoint behavior, fail-on classes, and network-gated corpus runs. |

## Top 5 If You Fix Nothing Else

1. **F021 - Remove runtime `npx` from approved gates.** Gate enforcement should not depend on network resolution or whatever npm publishes as `aisdlc` at runtime. Emit a local recorder or invoke a pinned project-local CLI.
2. **F017 - Validate loop trace events at CLI ingress.** The hook/skill event log drives scoring and status, so malformed events should be rejected before persistence.
3. **F008 - Require non-empty test-command answers.** This is a setup-readiness correctness issue with a small fix and direct regression test.
4. **F019/F024 - Deduplicate and test approved-gate scripts.** The highest-churn enforcement path should have one source and runtime tests for every host.
5. **F029/F031 - Harden eval/setup artifact persistence.** Bench and behavior eval should report structured failures instead of writing invalid state or throwing opaque filesystem errors.

## Quick Wins

- [ ] F008: Change `gap-interview.ts` to require a trimmed non-empty `test-command`.
- [ ] F003: Rank GitHub Actions jobs in `testCommandFromWorkflow`.
- [ ] F005: Run Makefile recipes through `pickTestSegment`.
- [ ] F010: Include sources/scope in `diffStandardsIndex` or narrow the doc comment.
- [ ] F017: Add minimal field validation for `record-event`.
- [ ] F022: Fail closed when a present role-policy file cannot be parsed.
- [ ] F023: Emit Copilot test commands as YAML block scalars.
- [ ] F031: Validate loop behavior eval results before writing.
- [ ] F033: Catch symlink scan filesystem errors.
- [ ] F043: Mask markdown code spans before doc-gardener link scanning.

## Things That Look Bad But Are Actually Fine

- `src/customize/gap-interview.ts:20` has only one blocking setup gap. That looks thin, but it matches the product model: GitLab/Jira bindings are intentionally deferred until a task needs them.
- `src/customize/repo-miner.ts:167` style best-effort file reads look too quiet in isolation, but mining needs to tolerate permission-denied paths, generated state, and non-git repos. The debt is observability, not the decision to continue.
- `src/adapters/copilot/index.ts:32` style portability gaps are not unfinished work. They honestly record host capability degradation where Copilot cannot enforce the same native hooks.
- `src/adapters/cursor/gates.ts:17` missing policy file behavior is acceptable during bootstrap. The problem is corrupt-policy fail-open behavior, not absent-policy bootstrap.
- `src/adapters/*/gates.ts` use `console.error`/`console.warn`, which is appropriate because emitted hook scripts communicate through stderr/stdout rather than library APIs.
- `tests/golden/__snapshots__/compile.test.ts.snap:1` is large and noisy, but it protects host-native emitted output. Do not delete it without replacing the coverage with focused structural assertions.
- The fixture files reported by `knip` under `tests/fixtures/sample-repos/` are mostly intentionally unimported sample repository contents. Treat those as fixture inventory unless a specific fixture is obsolete.

## Open Questions For The Maintainer

- Should approved gate scripts record events through a bundled local script, the current repo's `dist/cli/index.js`, or a globally linked `aisdlc`? This affects install UX and supply-chain risk.
- Is CircleCI command mining intentionally deferred, or should CircleCI evidence be strong enough to close the `test-command` gap?
- Are `knip`-reported exported types part of an intended programmatic API, or can unused exports be made internal?
- Should `garden-docs` treat historical plan documents as current truth, or should old plans be archived/superseded so doc-gardening ignores expected drift?
- What is the expected long-term relationship among behavior eval v1, behavior eval v2, and loop behavior eval?
- Should `npm audit` be a CI gate for this repo, or should dev-only advisories be tracked as accepted residuals when fixes require breaking upgrades?
