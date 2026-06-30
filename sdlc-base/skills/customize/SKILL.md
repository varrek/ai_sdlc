---
name: customize
description: Adapt the AI SDLC base to the current repository as a resumable first-run chain — mine the stack, draft host-LLM personalization in default Plugin Mode, compile, and gate on a passing smoke run, short-circuiting phases whose inputs are unchanged.
disableModelInvocation: false
---

# /customize

Drive the full first-run chain for *this* repository: **mine → personalize (Plugin
Mode) → compile → smoke**. Repo-mine first; interview only for what mining cannot
answer; emit schema-valid, evidence-backed artifacts; then compile and gate on a
passing smoke run. When a CLI entrypoint is easier, `aisdlc setup --repo .`
runs this same chain; the subcommands below remain the resumable phases.

The chain is **resumable**. Each command records a fingerprinted phase in
`.sdlc/setup-state.yaml` and short-circuits when its inputs are unchanged, so
re-running `/customize` after a crash or an edit resumes from the earliest changed
input rather than redoing settled work. Run the three commands in order every time;
freshness makes the no-op cheap.

## Steps

1. **Mine + emit the overlay.** Run `aisdlc customize --repo .`; Plugin Mode is
   the default and records `operatingMode: plugin`. Use
   `aisdlc customize --repo . --mode deterministic` only when this project must
   opt out of host-LLM personalization. Add `--answers-file <path>` only when you
   have interview answers to apply — the common first run needs no flag. The
   miner detects languages, frameworks, the **runnable test command** (CI >
   Makefile > `package.json`/`pyproject`), test runner, linters, package managers,
   CI, CODEOWNERS, and docs — ignoring vendored/env dirs (`venv/`, `node_modules/`,
   `__pycache__/`, build output). Every detected standard records the repo path(s)
   that justify it. The mined test command closes the "how do tests run" gap
   automatically.

   On an unchanged re-run the command prints `customize fresh — skipped`; on a
   re-run with changed inputs the standards index is diffed against the prior one
   and the delta reported — a reviewable change, never a silent rewrite.

2. **Answer only the blocking gaps.** Mining resolves most config. The only
   blocking gap is a runnable test command when none can be mined; record it (and
   any other answers) in `.sdlc/overlay/.customize.yaml` or an `--answers-file` and
   re-run. **Integrations (GitLab/Jira) are *not* blocking gaps** — they are
   deferred and bind just-in-time as a role precondition when the loop reaches a
   step that needs them (e.g. wrap-up); see `sdlc-loop`. A fresh repo reaches
   setup-ready with zero integration hand-editing.

3. **Draft host-LLM personalization in Plugin Mode.** If
   `.sdlc/overlay/.customize.yaml` says `operatingMode: plugin`, invoke
   `tune-roles` immediately after mining. The host model should draft
   repo-grounded role guidance, write it to `roleAddenda`, and present the overlay
   diff for review before compile/smoke. If host model access is unavailable,
   report that Plugin Mode is blocked rather than pretending deterministic output
   is personalized.

4. **Compile.** Run
   `aisdlc compile --base <base> --overlay .sdlc/overlay/.customize.yaml --out .`
   to emit host-native config for every host in the manifest. Prints
   `compiled config fresh — skipped` when the overlay and base are unchanged.

5. **Smoke gate (the chain's exit criterion).** Run
   `aisdlc smoke --repo . --overlay .sdlc/overlay/.customize.yaml`. It validates
   the generated config and pushes a trivial Engineer→Reviewer change through MCP
   mocks, then reports the single readiness gate:
   - **`setup-ready (integrations deferred: …)`** — no blocking gaps AND smoke
     passed. The chain is done. Listed integrations bind later, just-in-time.
   - **Not setup-ready** — the output names the failing checks (and any open
     blocking gap) plus the resume entrypoint: re-run `/customize` (or the stale
     subcommand directly) and freshness skips the phases that are still good.

6. **Read host activation guidance.** After compile, `.sdlc/host-setup.md`
   lists every enabled host, the files it should load, activation/trust notes,
   and honest degradation such as Copilot's IDE gate fallback. This guide is
   generated for agents and humans; it does not prove a live IDE loaded the
   files.

## Guarantees

- **"Ready" means setup-ready**: no blocking gaps **and** smoke passes **and** the
  emitted config is schema-valid. Deferred integrations never hold readiness back.
- The emitted overlay validates against the base schemas before it is written.
- Plugin Mode is the default. Deterministic mode is an explicit opt-out that keeps
  the base constitution's default gates and skips host-LLM personalization.
  Generated prose is not active until it is visible in the overlay and passes
  compile/smoke validation.
- The chain is idempotent: re-running with unchanged inputs is a no-op, and a base
  upgrade invalidates the compiled + smoke phases so they re-run.
- Placeholder integration server IDs are forbidden — an integration is either bound
  to a real server just-in-time or left deferred, never faked at setup.
