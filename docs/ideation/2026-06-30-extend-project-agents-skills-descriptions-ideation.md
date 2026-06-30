---
date: 2026-06-30
topic: extend-project-agents-skills-descriptions
focus: should we extend project-specific agents/skills descriptions after 10-repo external bench validation
mode: repo-grounded
---

# Ideation: Extend Project-Specific Agents & Skills Descriptions?

## Grounding Context

**Codebase context.** ai-sdlc already personalizes agents through several layers, not one blob:

| Layer | What it carries | Repo-specific today? |
|---|---|---|
| Frontmatter `description` | Host routing / discovery classifier | **No** — identical generic text from `sdlc-base/roles/*.md` and `sdlc-base/skills/*/SKILL.md` on every project |
| Role body (base) | Process, gates, handoffs | **No** — shared base prose |
| `## Deterministic project grounding` | Mined map, test commands, edit hints | **Partial** — architect (when map exists), engineer, tester; **not** reviewer or debugger |
| `## Accepted project learnings` | Ledger claims filtered per role | **Yes** — stack/framework/test-command learnings |
| `overlay.roleAddenda` + `/tune-roles` | LLM-authored bounded prose | **Optional** — Plugin Mode skill exists; deterministic bench runs skip it |
| Constitution / standards | Evidence-backed project rules | **Yes** — fully mined |
| Skills | Workflow orchestration (`customize`, `sdlc-loop`, …) | **No** in descriptions; body references `aisdlc` CLI generically |

Merge path: `src/core/merge.ts` applies grounding + addenda; adapters emit verbatim to Cursor (`.cursor/agents/*.md`), Claude, Codex (`.toml`), Copilot (`.agent.md`).

**10-repo bench (2026-06-30, seed 42, count 10).** Full setup on all clones: 10/10 setup-ready, 10/10 hands-off, agent quality avg 96/100. Every repo got 5 Cursor agents, 5 skills (`.agents/` + `.cursor/skills/` shims), hooks, role-policy, and multi-host emit. Tester grounding carried stack-specific commands (e.g. Laravel `vendor/bin/phpunit --no-coverage`, Vite `pnpm run test-unit`). **Debugger remained generic on all 10.** Flask scored 85 — architect lacks high-confidence map grounding but still passes. **No repo had non-empty `roleAddenda` under deterministic mode.**

**Prior ideation signals.**

- `2026-06-29-agent-language-tooling-improvements-research.md` ranked **deterministic grounding for all base roles** (#4) and **behavior eval v2** (#1) above cosmetic description edits.
- `2026-06-14-llm-authored-role-addenda-ideation.md` shipped `roleAddenda` + `tune-roles` for **body** personalization but **deferred frontmatter description authoring** — "description is a routing classifier; mutating it risks dispatch regressions."
- `STRATEGY.md` bet: agents must follow *this repo's* stack; metrics are hands-off setup, evidence coverage, re-run no-op — not description length.

**Past learnings.** `docs/solutions/design-patterns/round-trip-editable-generated-config.md` — generated config must stay reviewable and round-trippable; extensions should land in overlay/grounding, not opaque compile output.

## Topic Axes

1. **Routing surfaces** — frontmatter `description` fields hosts use to pick agents/skills
2. **Role body grounding** — deterministic sections vs LLM addenda inside agent bodies
3. **Skill descriptions & packs** — when workflow skills need repo-shaped triggers
4. **Coverage gaps exposed by eval** — debugger, flat repos, monorepo noise, deterministic vs Plugin Mode
5. **Quality gate** — how to know an extension helps agents rather than adding tokens

## Ranked Ideas

### 1. Close the deterministic grounding gap (Reviewer + Debugger + flat Architect)

**Description:** Extend `src/core/role-grounding.ts` so Reviewer gets deterministic grounding (review checklist from mined linters, security-sensitive paths from map, demotion learnings) and Debugger gets reproduction grounding (primary test command, log locations, known flaky CI jobs). For flat repos without a map, give Architect **standards-based** grounding (framework, lint, test command) instead of silence.

**Axis:** Role body grounding

**Basis:** `direct:` 10-repo bench — debugger generic on 10/10; Flask architect lacks map section despite deterministic status; `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` #4; `role-grounding.ts` only appends architect/engineer/tester today.

**Rationale:** This is the highest-leverage "extension" — it adds repo-specific *substance* agents actually invoke, without touching routing classifiers. Bench already proves tester/engineer grounding works; the remaining generic roles are the visible gap.

**Downsides:** More merge logic and corpus expectations; debugger grounding must stay read-only and gate-safe; flat-repo architect text must not pretend high-confidence map exists.

**Confidence:** 92%

**Complexity:** Medium

### 2. Run templated (non-LLM) role addenda in deterministic customize

**Description:** After mining, synthesize short, contract-bounded `roleAddenda` from evidence templates — e.g. Engineer: "Stack: Kotlin/Gradle; lint: detekt; respect `okhttp/src/` modules" — without calling a host LLM. Plugin Mode keeps `/tune-roles` for richer prose; deterministic mode gets 80% of the value idempotently.

**Axis:** Role body grounding

**Basis:** `direct:` bench clones have empty `roleAddenda` under deterministic mode; `tune-roles/SKILL.md` exists but is Plugin-Mode-oriented; `emitters.ts` initializes empty addenda.

**Rationale:** Closes the gap identified in 2026-06-14 ideation ("role bodies stay generic") for the default bench/CI path without sacrificing determinism.

**Downsides:** Template sprawl per ecosystem; must reuse `assertRoleAddendumWithinContract`; risk duplicating grounding sections if not coordinated with idea #1.

**Confidence:** 78%

**Complexity:** Medium

### 3. Append a one-line stack hint to frontmatter descriptions at compile time (deterministic)

**Description:** Keep base descriptions stable; append a bounded suffix derived from mining, e.g. `… | Python/pytest/flask repo`. Apply to roles and optionally skills whose triggers benefit (`tester`, `engineer`, `customize`). Cap length; never remove base text.

**Axis:** Routing surfaces

**Basis:** `reasoned:` Cursor/Copilot use descriptions for subagent/skill routing; current descriptions are identical across Flask, Laravel, and Vite; prior ideation deferred *LLM* description rewrites, not deterministic suffixes.

**Rationale:** Cheap discovery win for hosts that match on description keywords — especially when multiple custom agents coexist.

**Downsides:** Host-specific routing behavior poorly tested today; suffix noise if mining wrong; may not help hosts that ignore description for dispatch.

**Confidence:** 65%

**Complexity:** Low

### 4. Ecosystem pack skills with extended descriptions (not longer base skills)

**Description:** Add optional packs (pytest, gradle-jvm, dotnet, php-composer) that ship **additional** skills or skill description overrides — e.g. `pytest-workflows` skill description mentions "this repo uses pytest; prefer `uv run tox` when CI does." Base skills stay portable; packs extend only when detected.

**Axis:** Skill descriptions & packs

**Basis:** `direct:` four reference packs exist; skills are host-neutral workflow drivers; miner already detects ecosystems; constitution already carries standards — packs avoid bloating universal base.

**Rationale:** Extends descriptions where stack-specific *workflow* knowledge matters, without polluting every repo's skill set.

**Downsides:** Pack selection logic, matrix docs, corpus per pack; overlap with standards and grounding if not scoped.

**Confidence:** 74%

**Complexity:** Medium

### 5. Behavior Eval v2 before any broad "description expansion" campaign

**Description:** Before investing in longer descriptions or frontmatter edits, add a readonly host-agent eval: given emitted config vs generic base, does the agent pick the right test command, module, and role? Extend current `behavior-eval.ts` string checks into scored scenarios tied to the 10-repo catalog.

**Axis:** Quality gate

**Basis:** `direct:` `2026-06-29-agent-language-tooling-improvements-research.md` #1; current behavior eval checks artifact strings, not routing outcomes; 10-repo bench validates setup metrics, not host dispatch.

**Rationale:** Answers "should we extend?" with evidence — some extensions may not change agent behavior despite longer text (token trap called out in universal-setup ideation).

**Downsides:** High implementation cost; host LLM variance; may delay user-visible improvements.

**Confidence:** 88%

**Complexity:** High

### 6. Package-scoped instruction files instead of longer root agents (monorepo path)

**Description:** For repos with noisy maps (Cargo 26 packages, OkHttp 28), emit per-package `AGENTS.md` or agent addenda pointers rather than extending root agent descriptions. Root agents stay lean; package agents carry local test/lint commands.

**Axis:** Coverage gaps exposed by eval

**Basis:** `direct:` bench flagged 3 noisy maps; large-repo scaling ideation; `project-context.ts` already models packages; strategy favors progressive disclosure over encyclopedic root files.

**Rationale:** "Extend descriptions" is the wrong shape for monorepos — **scope** beats **length**.

**Downsides:** Large-repo scaling plan scope; adapter parity across four hosts; doc gardening complexity.

**Confidence:** 80%

**Complexity:** High

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | LLM-rewrite frontmatter descriptions in default customize | Prior ideation deferred; routing classifier risk; non-deterministic |
| 2 | Duplicate full standards block into every agent body | Token bloat; constitution already exists; violates lean-root pattern |
| 3 | Extend base `sdlc-base/roles/*.md` bodies with stack examples | Breaks host-neutral base; belongs in overlay/grounding/packs |
| 4 | Longer generic skill descriptions in base | Skills are workflow drivers; repo facts belong in grounding or packs |
| 5 | Manual per-repo description editing in external clones | Violates bench fix loop ("fix ai-sdlc, not external repos") |
| 6 | Extend descriptions only for Cursor, skip other hosts | Breaks capability-matrix parity promise |
| 7 | Add debugger MCP/tools via description prose | Capabilities require structured policy channel, not hidden prose |

## Synthesis: Should you extend?

**Yes, but narrowly — extend grounded facts, not generic prose.**

The 10-repo validation shows setup and Cursor emit are solid; the product gap is **incomplete role coverage** (debugger/reviewer/flat architect) and **empty deterministic addenda**, not missing files. Frontmatter description suffixes are a low-cost experiment; blanket lengthening of base agents/skills is rejected.

**Recommended sequence:** #1 (grounding gap) → #5 (measure) → #2 or #4 depending on whether gaps are role-body or workflow-skill shaped → #3 only if eval shows routing benefit → #6 when monorepo noise hurts quality scores.

**Do not prioritize:** rewriting base descriptions, duplicating constitution into agents, or LLM description authoring before behavior eval exists.
