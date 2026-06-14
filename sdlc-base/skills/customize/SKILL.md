---
name: customize
description: Adapt the AI SDLC base to the current repository — mine its stack, emit an evidence-backed overlay + standards index, interview only for gaps, then compile and smoke-test.
disableModelInvocation: true
---

# /customize

Adapt the host-neutral base to *this* repository. Repo-mine first; interview only
for what mining cannot answer; emit schema-valid, evidence-backed artifacts; then
compile and gate on a passing smoke run.

## Steps

1. **Mine the repo.** Run `aisdlc customize --repo .`. The miner detects
   languages, frameworks, test runner, linters, package managers, CI, CODEOWNERS,
   and docs — ignoring vendored/env dirs (`venv/`, `node_modules/`, `__pycache__/`,
   build output). Every detected standard records the repo path(s) that justify it.

2. **Review the suggested track.** Thin POCs get **Quick**; repos with CI + tests
   get **Full**; everything else gets **Standard**. Override in the overlay if wrong.

3. **Answer only the gaps.** Mining resolves most config. For anything it cannot
   infer (e.g. which internal MCP server backs GitLab/Jira), the command prints a
   short interview. Record answers in `.sdlc/overlay/.customize.yaml` and re-run.

4. **Inspect the drift (re-runs).** On a re-run the standards index is diffed
   against the prior one and the delta reported. Re-running is a reviewable change,
   never a silent rewrite.

5. **Compile.** Run `aisdlc compile --base <base> --overlay .sdlc/overlay/.customize.yaml --out .`
   to emit host-native config for every host in the manifest.

6. **Smoke gate (hard exit criterion).** `aisdlc smoke` runs a trivial
   Engineer→Reviewer change against MCP mocks. **`/customize` is not "done" until
   smoke passes** — a failure surfaces a structured fix path, not a green flag.

## Guarantees

- The emitted overlay validates against the base schemas before it is written.
- Only the configurable edges are touched; the non-negotiable gates come from the
  base constitution and are never rewritten here.
