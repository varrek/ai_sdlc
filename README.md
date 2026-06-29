# ai-sdlc

An open, cross-host AI SDLC framework. You author your software
development process **once** as a host-neutral base, and the `aisdlc` compiler
emits native configuration for each AI coding host — **Cursor**, **Claude Code**,
and **GitHub Copilot** — so every host enforces the same gates, roles, and
standards.

- **Base** — the host-neutral source of truth: the Constitution (non-negotiable
  gates + configurable edges), roles, skills, and integration contracts.
- **Overlay** — the per-project layer that tunes only the configurable edges
  (added standards, integration bindings, role-model overrides, ceremony track).
  It can never weaken a hard gate.
- **Adapters** — pure per-host emitters that turn the merged model into each
  host's native files.

See [`CONCEPTS.md`](./CONCEPTS.md) for the full domain vocabulary.

## Requirements

- Node.js **>= 20**

## Installation

Install it from a clone:

```bash
git clone <repo-url> ai_sdlc
cd ai_sdlc
npm install
npm run build
```

To get the `aisdlc` command on your `PATH`, link it globally:

```bash
npm link        # exposes `aisdlc` (bin -> dist/cli/index.js)
```

Without linking, invoke the built CLI directly:

```bash
node /path/to/ai_sdlc/dist/cli/index.js --help
```

## Quickstart: set up a repository

Run the chain from the root of the repository you want to onboard. Each step is
idempotent and freshness-aware — re-running skips work whose inputs are
unchanged.

```bash
# 1. Mine the repo for evidence and write the project overlay.
aisdlc customize --repo .

# 2. Compile the base (+ overlay) into host-native config in this repo.
aisdlc compile --base /path/to/ai_sdlc/sdlc-base --out .

# 3. Validate the result and report whether the repo is setup-ready.
aisdlc smoke --repo . --config .
```

`compile` and `smoke` automatically pick up the overlay written by `customize`
(`.sdlc/overlay/.customize.yaml`), so you usually don't need `--overlay`.

To extend the base without forking it, pass additive packs during compile and
smoke:

```bash
aisdlc compile --base /path/to/ai_sdlc/sdlc-base --packs ./packs/security,./packs/mobile --out .
aisdlc smoke --repo . --config . --packs ./packs/security,./packs/mobile --compile
```

Each pack is a directory with `pack.yaml` plus optional `AGENTS.md`, `roles/`,
`skills/`, and `integrations/`. Pack artifacts are additive: duplicate role,
skill, integration, or pack names fail validation instead of overriding the base.

A repo is **setup-ready** when: there are no blocking interview gaps, the smoke
gate passes, and the emitted config is schema-valid. Integration bindings
(GitLab/Jira) are deferred — they're bound just-in-time when a task actually
needs them, not during setup.

If `customize` reports a blocking gap (e.g. it couldn't mine a test command),
answer it in `.sdlc/overlay/.customize.yaml` (or pass `--answers-file`) and
re-run.

### Skill-driven flow

Inside a configured host, the `/customize` skill orchestrates the same
`customize → compile → smoke` chain for you and resumes from the first stale
phase. The CLI commands above are what that skill calls under the hood.

## Commands

| Command | What it does |
| --- | --- |
| `aisdlc customize` | Mine the current repo, build the standards index, and write the project overlay. |
| `aisdlc compile` | Compile the host-neutral base (+ overlay) to host-native config. |
| `aisdlc smoke` | Run the smoke validation gate and report setup-readiness. |
| `aisdlc upgrade` | Re-pin the base and replay compile, flagging overlay conflicts. |
| `aisdlc gen-matrix` | Regenerate `docs/capability-matrix.md` from adapter capabilities. |
| `aisdlc help` | Show usage. |

Common flags:

- `customize`: `--repo <dir>` (default: cwd), `--answers-file <file>`, `--force`
- `compile`: `--base <dir>` (default: `sdlc-base`), `--packs <dir,dir>`,
  `--out <dir>` (required), `--overlay <file>`,
  `--hosts cursor,claude-code,copilot`, `--force`
- `smoke`: `--repo <dir>`, `--config <dir>`, `--packs <dir,dir>`,
  `--overlay <file>`, `--compile`

## What gets emitted

Compilation produces native config for each enabled host (plus a host-neutral
`AGENTS.md` and `.agents/` skill set):

- **Claude Code** — `CLAUDE.md` (imports `AGENTS.md`), `.claude/agents/`,
  `.claude/skills/`, and a `PreToolUse` Approved? gate in `.claude/settings.json`.
- **Cursor** — `.cursor/agents/`, `.cursor/skills/`, `.cursor/mcp.json`,
  `.cursor/permissions.json`, and hooks that enforce the Approved? gate and
  per-role MCP least-privilege (`.cursor/hooks/`, `.cursor/sdlc/role-policy.json`).
- **GitHub Copilot** — `.github/copilot-instructions.md` (gates + project
  standards), `.github/agents/` (custom-agent profiles with `target`, posture
  `tools`, MCP `server/*` scoping, and native handoffs), a sequential handoff
  chain doc, and a CI backstop (`.github/workflows/sdlc-gate.yml`) that runs the
  mined test command.

Generated artifacts and per-project state live under `.sdlc/` and are
git-ignored by default.

## Non-negotiable gates

These four gates hold on every host and cannot be disabled by an overlay:

1. **Review required** — every change is reviewed before it merges.
2. **Tests must pass** — the project test suite is green before a change ships.
3. **Approved? gate** — orchestration halts for explicit human approval before
   writes leave the workspace.
4. **Least-privilege MCP** — each role reaches only the integrations its posture
   allows.

## Development

```bash
npm run build       # compile TypeScript to dist/
npm run typecheck   # type-check without emitting
npm test            # run the vitest suite
npm run test:watch  # watch mode
```

## Project layout

```
sdlc-base/   Host-neutral base: constitution, roles, skills, integration contracts
src/         Compiler: CLI, core engine, customize miner, per-host adapters
templates/   Shared templates used during emission
tests/       Unit, adapter, golden, and end-to-end chain tests (+ sample repos)
docs/        Plans and the generated capability matrix
```
