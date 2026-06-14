# Ideation — LLM-authored, repo-specific role addenda (bounded + smoke-gated)

- **Date:** 2026-06-14
- **Mode:** Repo-grounded; specified subject.
- **Subject:** Let an agent synthesize repo-specific *addenda* to the base role prompts (architect/engineer/tester/reviewer/debugger) from mined evidence, without breaking the deterministic, idempotent, reviewable compile.
- **Grounding:** Anthropic `defending-code-reference-harness` `/customize` skill (pure LLM playbook: read → interview → plan → edit files → validate, bounded by a "rewrite vs unchanged" architecture map); the current code (`sdlc-base/roles/*.md` pass through unchanged; `src/core/merge.ts` only overrides `model`; `src/schema/overlay.ts` base/overlay split with `.strict()`; `src/customize/repo-miner.ts` evidence; smoke gate in `src/smoke/harness.ts`); `STRATEGY.md` bet that off-the-shelf agent configs assume the wrong stack/conventions.

## How this connects to strategy

ai-sdlc's bet is that generic agent configs assume the wrong stack/architecture/conventions, and mining-with-evidence fixes that. Today that fix only reaches the **constitution** (flat appended standards) and the **overlay config** (track, test command, integrations). The **role prompts themselves stay generic** — the Engineer never learns "this repo uses Vitest + ESM, follow the adapter pattern in `src/adapters/`", the Reviewer never learns the repo's specific security-sensitive surfaces. The richest per-repo guidance is exactly the part mining never personalizes. This idea closes that gap while protecting the framework's core guarantee (deterministic, reviewable, gate-safe compile).

## The tension to resolve

The Anthropic harness proves the *value* of LLM-authored config (it rewrites prompts/parsers to port the pipeline). But it pays with **non-determinism**: re-running `/customize` yields different files. ai-sdlc's identity is the opposite — byte-identical, idempotent compile with reviewable diffs and four non-negotiable gates. Naively putting an LLM in the compile path would forfeit that.

**Resolution:** quarantine the non-determinism. The LLM authors *addenda text* into the **overlay** (the user-owned, version-controlled, human-reviewed layer) — never into the deterministic compile output. The compiler then merges `role.body + overlay.roleAddenda[name]` deterministically, exactly as it already merges `overlay.standards` into the constitution. Authoring is a separate, reviewable step; compile stays pure.

## Grounded current-state facts (the substance ideas attach to)

- `sdlc-base/roles/*.md` bodies pass through unchanged; `applyRoleOverlay` in `src/core/merge.ts:44` overrides **only** `frontmatter.model` — nothing touches the body.
- `Overlay` (`src/schema/overlay.ts:45`) is `.strict()` and carries `standards`, `integrations`, `roleModels`, `interviewAnswers` — there is no per-role prose field.
- Adapters (`src/adapters/*/agents.ts`) emit `role.body` verbatim, so anything merged into the body reaches every host for free.
- The four gates live in the base constitution and are intentionally not overlay-expressible; `.strict()` prevents a team from typo-ing a gate off.
- Smoke (`src/smoke/harness.ts`) already gates "customize complete" and checks reviewer-read-only; merge/compile throwing on bad input naturally fails the chain.

---

## Surviving ideas (ranked)

### A1 — `overlay.roleAddenda`: a per-role prose field merged into the body `[core data model]`

**Basis (direct):** the overlay has no per-role prose; the body is the one thing mining never personalizes. **Move:** add `roleAddenda: Record<roleName, string>` to `Overlay`; `applyRoleOverlay` appends it to the role body under a clearly marked generated heading, only for roles that exist. **Why it matters:** the minimal, schema-shaped place to carry repo-specific role guidance while keeping compile deterministic. **Meeting test:** yes — defines the data model the rest emit from.

### A2 — Mechanically-enforced addenda contract (the "architecture map", but as code) `[bounding]`

**Basis (direct + external):** the Anthropic skill bounds the LLM with a *prose* "rewrite vs unchanged" map; ai-sdlc's ethos is **mechanical** enforcement (gates that can't be typo'd off). **Move:** a deterministic validator that rejects an addendum that (a) exceeds a length cap, (b) targets an unknown role, or (c) contains directives that attempt to weaken a gate or a role's posture (e.g. "skip review", "you may write" for a read-only role, "bypass the Approved gate"). Runs at overlay load/merge, so an out-of-contract addendum fails compile/smoke loudly. **Why it matters:** turns the harness's prose guardrail into an enforceable one, preserving the gate guarantee even with LLM-authored text. **Meeting test:** yes.

### A3 — `tune-roles` authoring skill (the LLM step, as a skill not an API call) `[authoring]`

**Basis (direct + external):** like the harness, the "LLM" is the *host agent* following a skill — not something ai-sdlc calls over an API. **Move:** a skill that instructs the agent to read the mined `RepoProfile` + project-context, draft addenda **within the A2 contract**, write them to the overlay, then recompile and re-smoke — producing a reviewable overlay diff. **Why it matters:** keeps authoring host-native and reviewable; mirrors the proven harness shape. **Meeting test:** yes.

### A4 — Smoke/review as the gate on authored addenda `[validation]`

**Basis (direct):** smoke is already the hard exit criterion; merge-time validation already fails the chain on bad input. **Move:** no new gate — rely on A2 validation (fails compile) + the existing smoke run + the human reviewing the overlay diff. Optionally surface a one-line "N role addenda authored" in the customize summary. **Why it matters:** reuses the existing safety net; the addendum is just more overlay content the same gates already protect. **Meeting test:** folds into A1–A3; not a standalone track.

---

## Rejected / deferred (with reasons)

- **LLM in the compile path.** Forfeits byte-identical idempotency and reviewable diffs — the product's identity. **Rejected**; authoring is a separate overlay-writing step.
- **Rewriting role bodies wholesale (harness-style).** Removes the base's gate language from the prompt and makes drift unreviewable. **Rejected** in favor of additive, clearly-fenced addenda.
- **ai-sdlc calling an LLM API directly.** Adds a model dependency/secret to a pure compiler. **Deferred**; the host agent is the LLM, via a skill.
- **Per-role *frontmatter* (description) authoring.** The description is a routing classifier; mutating it risks dispatch regressions. **Deferred** to a future ideation.

## Recommended cluster for one implementable plan

**A1 → A2 → A3, with A4 as the connecting discipline.** A1 is the data model, A2 the enforceable contract, A3 the authoring skill; A4 reuses the existing gates. The result keeps deterministic compile, makes LLM authorship safe and reviewable, and personalizes the one surface mining never reached.

## Next step

`ce-brainstorm` the A1–A4 cluster into a requirements document.
