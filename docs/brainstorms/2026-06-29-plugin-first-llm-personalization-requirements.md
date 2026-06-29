---
date: 2026-06-29
topic: plugin-first-llm-personalization
type: requirements
---

# Requirements: Plugin-First LLM Personalization

## Summary

Redefine ai-sdlc customization for coding-tool plugins where a host LLM is available. `/customize` and compile may both invoke that LLM to produce project-specific role guidance, including project-relevant changes to gates, postures, and review flow, with evaluation proving both guidance quality and agent behavior.

---

## Problem Frame

The current system is built around deterministic compile, reviewable overlay addenda, and non-overlay-expressible gates. That made sense for a host-neutral compiler, but it leaves the strongest repo adaptation step as an optional add-on: `tune-roles` asks the host agent to write short addenda after `/customize`, and current tests mainly prove that the text is bounded, appended, and emitted.

The product direction has changed. ai-sdlc is a plugin for coding tools such as Cursor and Claude Code, so the host LLM is part of the expected runtime. In that world, the product should optimize for project fit: richer role guidance, project-specific workflow policy, and behavior-level validation matter more than preserving byte-identical compile output.

---

## Key Decisions

- **Plugin-first, not host-neutral-pure.** ai-sdlc assumes it is running inside a coding tool with model access, so LLM availability is a product capability rather than an optional enhancement.
- **Compile may invoke the host LLM.** Deterministic compile is no longer a hard product invariant when richer project adaptation needs model judgment.
- **Gates and postures are project-adaptable.** Generated guidance may weaken, strengthen, or reshape gates, postures, and review flow when the project context justifies it.
- **Acceptance remains reviewable.** LLM-generated policy changes become active only through a visible approval point, because changing gates or postures changes how work ships.
- **Evaluation must be behavioral.** Structural config tests are necessary but insufficient; the workflow must show that agents act better with the generated guidance.

---

## Actors

- A1. **Project developer.** Runs `/customize` in a repo and expects the plugin to make agents fit that repo with little hand editing.
- A2. **Host coding tool.** Provides the LLM runtime and tool context used by `/customize`, compile, and evaluation.
- A3. **Generated role agent.** Consumes the compiled guidance and follows the project-specific workflow policy.
- A4. **Reviewer or approver.** Accepts, rejects, or edits generated guidance before it becomes active.

---

## Requirements

**Plugin-host LLM integration**

- R1. `/customize` must include an automatic LLM role-personalization step after deterministic repo mining has produced evidence.
- R2. Compile must be allowed to invoke the host LLM when generating project-specific role guidance or workflow policy.
- R3. LLM invocation must use the coding-tool host context rather than introducing a standalone provider requirement as the default path.
- R4. Missing host LLM access in plugin mode must be reported as a setup blocker, not silently treated as a generic-role success.

**Generated project-specific guidance**

- R5. Generated role guidance must be substantially more detailed than the current short addendum style, while staying grounded in mined repo evidence.
- R6. Guidance must be role-specific: Architect, Engineer, Tester, Reviewer, and Debugger should receive different project facts, risks, commands, and working constraints when evidence supports them.
- R7. The generated `Project-specific guidance` section must cite or name the repo signals it relies on in prose so a reviewer can evaluate the claim.
- R8. Empty or generic addenda must be treated as a personalization failure unless the repo truly lacks useful evidence.

**Project-adaptable workflow policy**

- R9. Generated guidance may weaken, strengthen, or reshape gates when the project context makes the change appropriate.
- R10. Generated guidance may change role postures or review flow when the project context makes the change appropriate.
- R11. Any generated gate, posture, or review-flow change must include a rationale tied to project evidence or project intent.
- R12. Generated policy changes must be visible as a reviewable diff before becoming active.

**Setup and status**

- R13. Setup-ready in plugin mode must require completed and accepted LLM personalization, not only schema-valid emitted files and smoke pass.
- R14. Status must distinguish deterministic mining, LLM-personalized guidance, accepted policy changes, and evaluation state.
- R15. Re-runs must make changed generated guidance visible as drift rather than silently replacing prior accepted guidance.

**Testing and evaluation**

- R16. The eval workflow must first inspect generated guidance for evidence grounding, role specificity, useful detail, and policy-change rationale.
- R17. The eval workflow must then run behavior-level scenarios that compare agent behavior with and without generated guidance.
- R18. Behavior scenarios must cover at least module selection, test-command choice, risk recognition, and review-flow adherence.
- R19. Eval output must separate structural validity, guidance quality, and behavior improvement so one green signal cannot mask another failure.
- R20. The local test runner must be reliable enough that setup/eval failures are attributable to product behavior, not worker teardown instability.

---

## Key Flows

- F1. Automatic plugin customization
  - **Trigger:** A developer invokes `/customize` in a supported coding-tool plugin.
  - **Actors:** A1, A2, A4.
  - **Steps:** The plugin mines the repo, invokes the host LLM to draft role guidance and policy changes, shows the generated diff, and records the user's acceptance or edits.
  - **Outcome:** The repo reaches setup-ready only after project-specific guidance and any workflow-policy changes are accepted.

- F2. LLM-assisted compile
  - **Trigger:** Compile runs after accepted customization or after relevant repo drift.
  - **Actors:** A2, A3.
  - **Steps:** Compile combines deterministic repo evidence, accepted overlay state, and host-LLM synthesis to emit role files with project-specific guidance and workflow policy.
  - **Outcome:** Emitted agents carry guidance that reflects the current repo and accepted policy state, even when model synthesis changes the generated text.

- F3. Policy adaptation review
  - **Trigger:** The LLM proposes changing a gate, role posture, or review flow.
  - **Actors:** A1, A4.
  - **Steps:** The plugin highlights the policy change, explains why it is relevant to the project, and requires approval before activation.
  - **Outcome:** Project-relevant workflow changes are allowed, but they are never hidden inside ordinary prose.

- F4. Staged evaluation
  - **Trigger:** A developer or CI job evaluates a fixture, corpus repo, or current project after personalization.
  - **Actors:** A1, A2, A3.
  - **Steps:** The eval first scores the guidance artifact, then runs behavior scenarios against agents with and without the guidance.
  - **Outcome:** The product can show whether richer guidance improves agent decisions, not just whether config files were emitted.

---

## Acceptance Examples

- AE1. **Covers R1-R8, F1.** Given a repo with mined framework, test, module, and risk evidence, when `/customize` runs in plugin mode, then it drafts detailed role-specific guidance instead of short generic addenda.
- AE2. **Covers R2, R13, F2.** Given accepted personalization state, when compile runs, then host-LLM synthesis can contribute to the emitted role guidance and setup-ready reflects that personalization completed.
- AE3. **Covers R9-R12, F3.** Given a repo where the default review flow is too heavy for the project, when the LLM proposes a lighter flow, then the proposal includes rationale and requires explicit acceptance before activation.
- AE4. **Covers R9-R12, F3.** Given a repo where a read-only posture blocks useful project work, when the LLM proposes a posture change, then the diff names the changed capability and why the project needs it.
- AE5. **Covers R16-R19, F4.** Given a corpus scenario with a known correct module and test command, when eval runs with generated guidance, then the agent chooses the expected module and command more reliably than the generic baseline.
- AE6. **Covers R16-R19, F4.** Given generated guidance with plausible prose but no evidence-backed claims, when eval runs, then guidance quality fails even if structural compile and smoke pass.
- AE7. **Covers R20.** Given the local test suite, when setup/eval verification completes, then the command result is not obscured by a worker teardown crash.

---

## Success Criteria

- `/customize` in plugin mode produces accepted role guidance without requiring a separate manual `tune-roles` invocation.
- Generated `Project-specific guidance` is detailed enough that a reviewer can identify different instructions for each role.
- Policy changes to gates, postures, or review flow are possible and reviewable.
- Behavior-level evals demonstrate improved agent decisions on pinned scenarios.
- Status reports whether a repo is structurally valid, LLM-personalized, policy-accepted, and behavior-evaluated.

---

## Scope Boundaries

### In Scope

- Plugin-host LLM invocation from `/customize`.
- LLM-assisted compile in plugin mode.
- Richer generated role guidance for all base roles.
- Project-adaptable gates, postures, and review flow.
- Reviewable acceptance of generated guidance and policy changes.
- Staged guidance-quality and behavior-level eval workflow.
- Test-runner reliability needed to trust eval results.

### Deferred For Later

- Non-plugin mode parity for environments without a host LLM.
- Multi-provider standalone LLM configuration outside coding tools.
- Large external corpus automation beyond the checked-in and manually runnable corpus paths.
- Fully unattended policy mutation with no acceptance point.

### Outside This Product's Identity

- Preserving deterministic compile as a non-negotiable invariant.
- Treating base gates and role postures as impossible to weaken.
- Claiming setup quality from structural smoke alone.

---

## Dependencies / Assumptions

- Supported hosts provide a usable model invocation path to the plugin.
- The plugin can present generated diffs and capture acceptance in the host workflow.
- Mined repo evidence remains the grounding substrate for LLM synthesis.
- Existing `roleAddenda`, deterministic Architect grounding, status, and corpus checks are starting points, not constraints on the new identity.

---

## Outstanding Questions

### Deferred To Planning

- How should accepted generated policy be represented so re-runs can distinguish accepted state from newly proposed drift?
- Which host abstraction should expose model invocation to `/customize` and compile?
- What exact behavior scenarios should form the first corpus eval slice?
- How should eval compare generic baseline behavior against personalized behavior without making tests flaky or expensive?
- What command/config change is needed to remove the current Vitest worker teardown instability from the verification path?

---

## Sources / Research

- `STRATEGY.md`
- `CONCEPTS.md`
- `sdlc-base/skills/customize/SKILL.md`
- `sdlc-base/skills/tune-roles/SKILL.md`
- `src/schema/overlay.ts`
- `src/core/role-addenda.ts`
- `src/core/merge.ts`
- `tests/loop/compiled-shape.test.ts`
- `tests/corpus/corpus-regression.test.ts`
- `docs/brainstorms/2026-06-14-llm-authored-role-addenda-requirements.md`
- `docs/brainstorms/2026-06-14-deeper-mining-and-metrics-requirements.md`
- `docs/plans/2026-06-14-003-feat-deeper-mining-and-metrics-plan.md`
