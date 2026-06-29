---
date: 2026-06-29
topic: agent-language-tooling-improvements
focus: ai-sdlc agents, packs, host adapters, repo-miner breadth, evaluation, external/arxiv research
mode: repo-grounded
---

# Ideation: Agent, Language, and Tooling Improvements

## Grounding Context

`ai-sdlc` already has a strong foundation: a host-neutral SDLC base compiled to Cursor, Claude Code, GitHub Copilot, and Codex; evidence-backed repo mining; four reference packs; package-scoped monorepo context; setup status; and a deterministic behavior-eval scaffold. Several active-looking plans are largely implemented in the current codebase, especially Codex adapter support, Copilot custom-agent refresh, broader Rust/JVM/Ruby/.NET/Go miner support, reference packs, and semantic corpus behavior validation.

The remaining opportunities are therefore less about filling the original backlog and more about tightening the product promise: "agents follow this repo's real stack and workflows." The highest-leverage improvements are better role specialization, broader validated ecosystem coverage, real agent-behavior evaluation, and context/memory infrastructure that keeps multi-session agent work aligned.

## External Research Signals

- **Long-horizon SWE evaluation is the frontier.** SWE-EVO and SWE-Bench Pro move beyond one-issue bug fixing into release-sized and enterprise-level changes, where context management and multi-file planning dominate success. Sources: [SWE-EVO](https://arxiv.org/html/2512.18470v6), [SWE-Bench Pro](https://arxiv.org/html/2509.16941).
- **Context reuse measurably improves coding agents when retrieval is accurate.** SWE-ContextBench reports that correctly selected compact prior experience improves accuracy and reduces runtime/token cost, while wrong retrieved context can hurt. Source: [SWE-ContextBench](https://arxiv.org/html/2602.08316v3).
- **Multilingual evaluation is becoming standard.** Multi-SWE-bench covers Java, TypeScript, JavaScript, Go, Rust, C, and C++ with validated, runnable issue tasks. This supports making ecosystem breadth a tested product axis, not only a miner feature. Source: [Multi-SWE-bench](https://arxiv.org/html/2504.02605).
- **Agentless/staged pipelines remain competitive.** Agentless argues that localization -> repair -> validation can match more complex autonomous agents at lower cost. This supports adding deterministic localization/evidence stages before letting host agents act. Source: [Agentless](https://arxiv.org/pdf/2407.01489).
- **Project-level generation research favors explicit architecture models and judge loops.** ProjectGen uses architecture design, skeleton generation, code filling, judge feedback, and memory-based refinement with a Semantic Software Architecture Tree. Source: [ProjectGen / CodeProjectEval](https://arxiv.org/html/2511.03404v1).
- **Context management is becoming a first-class tool.** CAT, Git Context Controller, and Codified Context all treat agent memory/context as structured, queryable infrastructure rather than an append-only chat transcript. Sources: [Context as a Tool](https://arxiv.org/pdf/2512.22087), [Git Context Controller](https://arxiv.org/html/2508.00031v2), [Codified Context](https://arxiv.org/html/2602.20478v1).
- **Host surfaces have moved toward packaged specialization.** Cursor now packages rules, skills, agents, commands, MCP servers, and hooks as plugins; Copilot custom agents support tool/MCP scoping and handoffs; Codex layers `AGENTS.md`, project `.codex/config.toml`, hooks, MCP, and subagents. Sources: [Cursor plugins](https://cursor.com/docs/plugins), [Copilot custom agents](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents), [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md), [Codex advanced config](https://developers.openai.com/codex/config-advanced).

## Topic Axes

- Role and pack specialization.
- Language, framework, build, test, and CI breadth.
- Host adapter fidelity and packaging.
- Evaluation of actual agent behavior.
- Context, memory, and repo knowledge reuse.

## Ranked Opportunities

### 1. Behavior Eval v2: Run Real Host-Agent Scenarios

**Description:** Extend the current deterministic behavior scaffold into a controlled host-agent eval harness. For each corpus fixture, run a small task through emitted Cursor/Claude/Copilot/Codex config and score whether the agent selects the right module, command, role, and approval path.

**Why now:** The current `tests/corpus/behavior-eval.ts` checks whether emitted artifacts contain expected strings. That is a useful precondition, but the product promise is agent behavior. SWE-Bench Pro, SWE-EVO, and SWE-ContextBench all point toward process and long-horizon behavior as the frontier.

**Suggested first slice:** One host, one read-only task class, no writes: "Where should I change X and what test command should I run?" Compare generic config vs `ai-sdlc` emitted config.

**Complexity:** High.

**Confidence:** 90%.

### 2. Corpus-Gate the Newly Supported Ecosystems

**Description:** Promote `go-app`, `rust-cargo`, `java-maven`, `kotlin-gradle`, `ruby-rails`, and `dotnet-app` from sample/unit fixtures into corpus expectations with semantic invariants.

**Why now:** Repo-miner language support is broader than the active plan implies, but the semantic corpus still focuses on Python/TS/monorepo/CI edge cases. Multi-SWE-bench makes multilingual support a visible competitive axis.

**Suggested first slice:** Add corpus expectations for Go, Rust, Java/Kotlin, Ruby, and .NET that assert language, package manager, test command provenance, setup readiness, and emitted role guidance.

**Complexity:** Medium.

**Confidence:** 88%.

### 3. Non-GitHub CI Mining

**Description:** Parse `.gitlab-ci.yml`, `.circleci/config.yml`, and later Jenkins/Azure Pipelines for test commands using the same evidence and ecosystem-gating rules as GitHub Actions.

**Why now:** The miner records GitLab/CircleCI files as CI evidence but `resolveTestCommand` only mines GitHub Actions. This directly affects hands-off setup rate for teams outside GitHub Actions.

**Suggested first slice:** GitLab CI only: extract shell commands from `script:` arrays, prioritize test/ci jobs, reject minority-ecosystem commands, and add a fixture.

**Complexity:** Medium.

**Confidence:** 84%.

### 4. Deterministic Grounding for All Base Roles

**Description:** Generate role-specific deterministic grounding for Engineer, Reviewer, Tester, and Debugger, not just Architect. Each role should receive the mined facts it needs: test commands for Tester, changed-surface/review checklist for Reviewer, package-local commands for Engineer, and reproduction signals for Debugger.

**Why now:** `status` currently reports role grounding for Architect only. Codified Context and ProjectGen both support the value of specialized agents with scoped context instead of one generic instruction blob.

**Suggested first slice:** Tester grounding: test command, package-local commands, CI provenance, known low-confidence gaps, and "do not infer tests from bare directories" reminders.

**Complexity:** Medium.

**Confidence:** 82%.

### 5. Add a Mobile Pack

**Description:** Ship a reference `mobile` pack for iOS/Android/React Native/Flutter changes with a mobile reviewer role, device/simulator test guidance, and optional integrations for build systems or device/browser automation.

**Why now:** `README.md` already uses `./packs/mobile` in examples, but the pack does not exist. This is a low-friction way to expand perceived framework coverage without overloading the base.

**Suggested first slice:** `mobile-reviewer` role plus `mobile-smoke-check` skill; no mandatory MCP contract until the integration story is clearer.

**Complexity:** Low to Medium.

**Confidence:** 78%.

### 6. Add Data/ML and Compliance Packs

**Description:** Add two domain packs: `data-ml` for notebooks, batch jobs, migrations/backfills, model/data contracts, and reproducibility; `compliance` for audit-sensitive change review, privacy checks, and policy evidence.

**Why now:** Packs are the right extension mechanism for domain expertise. External "codified context" research favors specialized domain agents plus on-demand cold knowledge; packs are this repo's natural shape for that.

**Suggested first slice:** `data-reviewer` role and `data-pipeline-review` skill, modeled after `backend-api` and `infra`.

**Complexity:** Medium.

**Confidence:** 74%.

### 7. Stable Claim-Key `explain`

**Description:** Extend `aisdlc explain` from numbered standards to stable claim keys such as `language:rust`, `test-command`, `architecture.primary-roots`, `architecture.rejected-roots`, and `ci.github-actions`.

**Why now:** Evidence-backed claims are central to the product. Stable claim keys would make miner debugging, user trust, and behavior eval much easier than numbered standard rows.

**Suggested first slice:** `aisdlc explain test-command` and `aisdlc explain architecture` with positive and negative evidence.

**Complexity:** Medium.

**Confidence:** 76%.

### 8. Context Memory Ledger for Accepted Learnings

**Description:** Add a small, versioned `.sdlc/memory/` or overlay-backed ledger for accepted project learnings: successful test command corrections, rejected architecture roots, review findings that became standards, and recurring human approvals/blocks.

**Why now:** SWE-ContextBench and context-management papers show that retrieved experience helps only when summarized and selected well. `ai-sdlc` can keep this deterministic and reviewable by storing accepted, evidence-linked learnings instead of free-form chat memory.

**Suggested first slice:** Record accepted human answers and later miner-confirmed corrections as stable entries, then surface them in `status` and emitted role guidance.

**Complexity:** Medium to High.

**Confidence:** 72%.

### 9. Host Packaging and Distribution Track

**Description:** Package the emitted host artifacts into native distribution units where possible: Cursor plugin bundles, Codex project config packs, and organization-level Copilot agent profiles.

**Why now:** Host customization surfaces increasingly support distributable components, especially Cursor plugins. The current compiler emits files, but package-level distribution would reduce setup friction for internal teams.

**Suggested first slice:** Cursor plugin manifest emission behind an adapter option, since Cursor's plugin shape maps cleanly to rules, skills, agents, hooks, commands, and MCP.

**Complexity:** Medium.

**Confidence:** 70%.

### 10. Broaden Framework and Tool Detection After CI/Corpus

**Description:** Add detection for PHP/Composer/Laravel, C/C++/CMake, Scala/sbt, Swift/SPM/Xcode, Dart/Flutter, Bazel, Nix, Cypress, Playwright, Angular, Vue, Svelte, NestJS, ASP.NET, and Android/iOS manifests.

**Why now:** Broad language/tool support is valuable, but the current risk is unsupported claims more than missing strings. The next wave should be corpus-backed and evidence-gated.

**Suggested first slice:** Pick one domain at a time: mobile first if the mobile pack lands; frontend E2E next if Playwright/Cypress command detection becomes necessary.

**Complexity:** High if done broadly; Medium per ecosystem.

**Confidence:** 68%.

## Rejection / Deprioritization Notes

- Adding many base roles is not the first move. Domain-specific roles should mostly arrive via packs so the base loop stays understandable.
- Broad miner detection without corpus fixtures should be avoided. It raises surface area without protecting the evidence-backed guarantee.
- Fully autonomous multi-agent implementation loops are less aligned than staged, gated workflows. Agentless-style localization and validation stages fit the current constitution better.
- Copilot cannot become fully equivalent to Cursor/Claude/Codex for the Approved? gate until the host has an IDE-level `PreToolUse`-style hook. Keep the honest fallback rather than hiding the gap.

## Suggested Roadmap Cluster

1. **Evaluation foundation:** corpus-gate existing new ecosystems, then add behavior eval v2 for one host and one task class.
2. **Hands-off expansion:** GitLab CI mining, then CircleCI/Jenkins/Azure based on target users.
3. **Role usefulness:** deterministic grounding for Tester, Reviewer, Engineer, and Debugger.
4. **Pack breadth:** mobile, then data/ML or compliance.
5. **Context memory:** accepted learnings ledger once evals can show whether retrieved context helps.

