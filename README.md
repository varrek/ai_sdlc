# ai-sdlc

An open, cross-host AI SDLC framework. You author your software
development process **once** as a host-neutral base, and the `aisdlc` compiler
emits native configuration for each AI coding host — **Cursor**, **Claude Code**,
**GitHub Copilot**, and **OpenAI Codex** — so every host enforces the same gates, roles, and
standards.

- **Base** — the host-neutral source of truth: the Constitution (non-negotiable
  gates + configurable edges), roles, skills, and integration contracts.
- **Overlay** — the per-project layer that records accepted customization
  (added standards, integration bindings, role-model overrides, ceremony track,
  operating mode, and generated role guidance). Plugin Mode is the default.
- **Adapters** — pure per-host emitters that turn the merged model into each
  host's native files.

See [`CONCEPTS.md`](./CONCEPTS.md) for the full domain vocabulary.

## Requirements

- Node.js **>= 20**

## Install ai-sdlc for development

Clone the framework when you are developing ai-sdlc itself or testing it before a
published package exists:

```bash
git clone <repo-url> ai_sdlc
cd ai_sdlc
npm install
npm run build
```

To get the `aisdlc` command on your `PATH` during development, link it globally:

```bash
npm link        # exposes `aisdlc` (bin -> dist/cli/index.js)
```

Without linking, invoke the built CLI directly:

```bash
node /path/to/ai_sdlc/dist/cli/index.js --help
```

## Quickstart: set up a repository

Run native setup from the root of the repository you want to onboard. The setup
wrapper runs the normal `customize -> compile -> smoke` chain, and each phase is
idempotent and freshness-aware.

```bash
aisdlc setup --repo .
```

`aisdlc init` is an alias for the same target-repo setup path.

For explicit phase control, run the chain directly:

```bash
# 1. Mine the repo for evidence and write the Plugin Mode project overlay.
aisdlc customize --repo .

# 2. Compile the base (+ overlay) into host-native config in this repo.
aisdlc compile --out .

# 3. Validate the result and report whether the repo is setup-ready.
aisdlc smoke --repo . --config .
```

`compile` and `smoke` automatically pick up the overlay written by `customize`
(`.sdlc/overlay/.customize.yaml`), so you usually don't need `--overlay`.
When the CLI is run from a built or packaged ai-sdlc checkout, the default base
resolves to the bundled `sdlc-base/`; pass `--base` only to use a different base.

To extend the base without forking it, pass additive packs during compile and
smoke:

```bash
aisdlc compile --base /path/to/ai_sdlc/sdlc-base --packs ./packs/security,./packs/mobile --out .
aisdlc smoke --repo . --config . --packs ./packs/security,./packs/mobile --compile
```

Each pack is a directory with `pack.yaml` plus optional `AGENTS.md`, `roles/`,
`skills/`, and `integrations/`. Pack artifacts are additive: duplicate role,
skill, integration, or pack names fail validation instead of overriding the base.

Reference packs ship under [`packs/`](./packs/README.md) (security, frontend,
backend-api, infra, mobile). See [`docs/packs.md`](./docs/packs.md) for usage,
authoring, and safety constraints.

A repo is **setup-ready** when: there are no blocking interview gaps, the smoke
gate passes, and the emitted config is schema-valid. Integration bindings
(GitLab/Jira) are deferred — they're bound just-in-time when a task actually
needs them, not during setup.

Loop quality is evaluated offline from emitted guidance and synthetic loop
traces. `ai-sdlc` does not run a custom SDLC orchestrator; Cursor, Claude Code,
Copilot, and Codex continue to execute through their native dispatch surfaces.

If `customize` reports a blocking gap (e.g. it couldn't mine a test command),
answer it in `.sdlc/overlay/.customize.yaml` (or pass `--answers-file`) and
re-run. Use `aisdlc customize --repo . --mode deterministic` only for projects
that explicitly opt out of host-LLM personalization.

### Skill-driven flow

Inside a configured host, the `/customize` skill orchestrates the same
`customize → personalize → compile → smoke` chain for you and resumes from the
first stale phase. The CLI commands above are what that skill calls under the
hood.

## Commands

| Command | What it does |
| --- | --- |
| `aisdlc setup` | Run `customize`, `compile`, and `smoke` as one native target-repo setup chain. |
| `aisdlc customize` | Mine the current repo, build the standards index, and write the project overlay. |
| `aisdlc compile` | Compile the host-neutral base (+ overlay) to host-native config. |
| `aisdlc smoke` | Run the smoke validation gate and report setup-readiness. |
| `aisdlc upgrade` | Re-pin the base and replay compile, flagging overlay conflicts. |
| `aisdlc gen-matrix` | Regenerate `docs/capability-matrix.md` from adapter capabilities. |
| `aisdlc bench` | Run a reproducible external-repo setup evaluation from the pinned catalog. |
| `aisdlc garden-docs` | Report stale or noisy agent-facing docs for continuous doc gardening. |
| `aisdlc help` | Show usage. |

Common flags:

- `setup`: `--repo <dir>` (default: cwd), `--base <dir>`, `--packs <dir,dir>`,
  `--hosts cursor,claude-code,copilot,codex`, `--mode plugin|deterministic`,
  `--force`
- `customize`: `--repo <dir>` (default: cwd), `--answers-file <file>`,
  `--mode plugin|deterministic` (default: plugin), `--force`
- `compile`: `--base <dir>` (default: bundled `sdlc-base/`, with source-checkout
  fallback to `./sdlc-base`), `--packs <dir,dir>`, `--out <dir>` (required), `--overlay <file>`,
  `--hosts cursor,claude-code,copilot,codex`, `--force`
- `smoke`: `--repo <dir>`, `--config <dir>`, `--packs <dir,dir>`,
  `--overlay <file>`, `--compile`
- `bench`: `--seed <n>`, `--count <n>`, `--catalog <file>`,
  `--cache-dir <dir>`, `--report-dir <dir>`, `--base <dir>`,
  `--mode deterministic|plugin`, `--dry-run`, `--skip-clone`, `--force`,
  `--repo-timeout-ms <n>`, `--fail-on-class <class,class>`
- `garden-docs`: `--repo <dir>`, `--config <dir>`, `--overlay <file>`,
  `--overlay-dir <dir>`, `--format text|json`, `--write-report`,
  `--fail-on warning|error`

`bench` clones only pinned public repos into `.verify/repos/` and writes reports
under `.verify/reports/`. It is opt-in and does not run external project package
managers, build scripts, or tests. It requires `git` on `PATH`. See
[`docs/eval/external-repo-workflow.md`](./docs/eval/external-repo-workflow.md).

## What gets emitted

Compilation produces native config for each enabled host (plus a host-neutral
`AGENTS.md` and `.agents/` skill set). It also writes
`.sdlc/host-setup.md`, an agent-readable activation guide for the enabled hosts:

- **Claude Code** — `CLAUDE.md` (imports `AGENTS.md`), `.claude/agents/`,
  `.claude/skills/`, `.mcp.json`, and a `PreToolUse` Approved? gate in
  `.claude/settings.json`. Start Claude Code from the repo root and trust the
  workspace before relying on project hooks, skills, or MCP.
- **Cursor** — `.cursor/agents/`, `.cursor/skills/`, `.cursor/mcp.json`,
  `.cursor/permissions.json`, and hooks that enforce the Approved? gate and
  per-role MCP least-privilege (`.cursor/hooks/`, `.cursor/sdlc/role-policy.json`).
  Optionally, set `options.cursor.pluginManifest: true` in `host-manifest.yaml`
  to also emit `.cursor-plugin/plugin.json` with explicit paths to those artifacts
  for Cursor plugin discovery. Cursor plugin options can also carry distribution
  identity (`pluginDisplayName`, `pluginDescription`, `pluginVersion`,
  `pluginPublisher`, `pluginRepository`). When plugin manifest emission is on,
  compile also writes `.sdlc/lsp-guidance.md`, a mined language-server setup guide
  for host/plugin installation. ai-sdlc emits guidance only; it does not install
  or run LSP servers.
- **GitHub Copilot** — `.github/copilot-instructions.md` (gates + project
  standards), `.github/agents/` (custom-agent profiles with `target`, posture
  `tools`, MCP `server/*` scoping, and native handoffs), a sequential handoff
  chain doc, `.github/hooks/` for Copilot CLI/cloud-agent hooks, and a CI
  backstop (`.github/workflows/sdlc-gate.yml`) that runs the mined test command.
  Copilot IDE has no equivalent fail-closed pre-tool hook, so the Approved? gate
  remains an instruction plus CI fallback there.
- **OpenAI Codex** — `AGENTS.md`, `.codex/agents/` (role subagents),
  `.codex/skills/`, `.codex/config.toml` (MCP + `PreToolUse` Approved? gate),
  and `.codex/hooks/` for least-privilege enforcement. Start Codex from a trusted
  project root so project `.codex/` config and hooks load.

Generated artifacts and per-project state live under `.sdlc/` and are
git-ignored by default.

## Doc Gardening

`aisdlc garden-docs` checks the repo's agent-facing docs for issues that make
large codebases harder for agents to navigate: bloated root instruction files,
broken local markdown links, missing codebase-map pointers, and stale generated
capability matrix content. By default it reports findings without changing docs
or failing the command; use `--fail-on warning` or `--fail-on error` for CI, and
`--write-report` to write `.sdlc/doc-gardening-report.json` plus a markdown
summary.

## Default Plugin Mode

`aisdlc customize` defaults to Plugin Mode. The host model drafts reviewable,
repo-specific role guidance into the overlay; compile and smoke only activate
validated overlay state. Deterministic mode is still available for projects that
need a no-host-LLM setup path.

## Base Gates

These four base gates hold unless a future accepted Plugin Mode policy channel
changes the workflow with structured, reviewable rationale:

1. **Review required** — every change is reviewed before it merges.
2. **Tests must pass** — the project test suite is green before a change ships.
3. **Approved? gate** — orchestration halts for explicit human approval before
   writes leave the workspace.
4. **Least-privilege MCP** — each role reaches only the integrations its posture
   allows.

## Development

```bash
npm run check       # format + import-order check (CI mode)
npm run check:fix   # apply safe format/import-order fixes
npm run build       # compile TypeScript to dist/
npm run typecheck   # type-check without emitting
npm test            # run the vitest suite
npm run test:watch  # watch mode
npm run verify:pack # verify the npm package tarball surface after build
```

Root CI runs the offline validation path on pull requests and pushes to `main`:
format/import-order check, typecheck, build, tests, and package tarball
verification. Network-dependent external repository evals remain opt-in through
`aisdlc bench`.

### LFG Worktree Startup

Run new `/lfg` implementation work in a feature-specific git worktree before the
plan file is written. The intended startup order is: detect whether the current
checkout is already an isolated worktree; if not, create a branch and worktree
named for the feature; then run the normal LFG plan -> work -> review -> PR ->
CI pipeline from that worktree.

After `ce-worktree` creates or reuses isolation, verify Git resolves the
worktree as the repo root and reports the feature branch. If the agent harness
still points at the parent checkout, move the agent/session root to the
worktree before editing files. If worktree creation, root movement, or root
verification fails, stop and resolve the isolation decision before editing files
in the current checkout. This keeps plans, formatter churn, review fixes, and PR
commits from mixing with unrelated local work.

### Package Verification

`ai-sdlc` is still documented as clone-first, but the package boundary is
verified so future npm publishing work has a safe base. The package allowlist
ships the compiled CLI plus runtime assets needed by generated setups:
`dist/`, `sdlc-base/`, `packs/`, and `templates/`. It also includes the
package-facing docs and security policy referenced by the README.

Run `npm run build` before `npm run verify:pack`; the verifier fails if the
compiled `aisdlc` bin target or representative runtime assets are missing from
the tarball preview.

## Project layout

```
sdlc-base/   Host-neutral base: constitution, roles, skills, integration contracts
packs/       Curated reference extension packs (optional at compile time)
src/         Compiler: CLI, core engine, customize miner, per-host adapters
templates/   Shared templates used during emission
tests/       Unit, adapter, golden, and end-to-end chain tests (+ sample repos)
docs/        Plans, pack guide, and the generated capability matrix
```
