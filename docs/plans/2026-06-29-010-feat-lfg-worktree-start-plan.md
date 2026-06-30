---
title: "feat: Start LFG work in feature worktrees"
type: feat
date: 2026-06-29
---

# feat: Start LFG work in feature worktrees

## Summary

Update the LFG workflow guidance so every new `/lfg` run starts from an isolated git worktree and feature branch before planning or implementation touches files. The change should make the worktree requirement durable in this repository's docs and in the local skill instructions that drive future `/lfg` runs in Cursor.

---

## Problem Frame

The repo already has plans that recommend worktree-per-slice execution, but the reusable `/lfg` skill still begins with planning in the current checkout. That leaves room for future runs to mix work into an already-busy branch before isolation exists.

The requested behavior is stricter: `/lfg` should create or detect a feature-specific worktree first, then run the existing plan-first pipeline inside that isolated checkout. Planning remains first among implementation steps, but workspace isolation becomes the preflight that makes the plan and subsequent changes land in the right branch.

---

## Requirements

- R1. A new `/lfg` run must create or reuse an isolated worktree before writing a plan or code.
- R2. The worktree branch and path should be derived from the feature/task name so parallel runs remain understandable.
- R3. The workflow must detect when it is already in an isolated worktree and continue there without nesting another worktree.
- R4. If worktree creation fails, the workflow must stop for a blocking user decision instead of silently using the current checkout.
- R5. The existing LFG step order after isolation must remain intact: plan, work, simplify, review, fixes, residuals, browser test, PR, CI, done.
- R6. Tracked repository docs should record the new invariant so future agents do not depend only on chat history or local plugin state.
- R7. Local skill instructions relevant to `/lfg` should be updated so future invocations start with the worktree preflight.

---

## Key Technical Decisions

- **Add a worktree preflight before plan.** This is setup, not implementation. It preserves the plan-first rule for all file-changing work while ensuring the plan itself lands on the feature branch.
- **Use the existing `ce-worktree` contract.** The repo and plugin already have a worktree isolation skill with detection and fallback behavior. `/lfg` should invoke that rather than duplicating low-level git handling.
- **Document both durable and local surfaces.** Repo docs are commit-ready and reviewable; the installed skill file lives outside this repo, so the PR should document that local skill changes were applied and name the tracked docs that describe the invariant.

---

## Implementation Units

### U1. Document The LFG Worktree Invariant

- **Goal:** Make the worktree-first rule discoverable in tracked repository documentation.
- **Requirements:** R1, R2, R3, R4, R6
- **Dependencies:** None
- **Files:** `README.md`, `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md`, `docs/plans/2026-06-29-010-feat-lfg-worktree-start-plan.md`
- **Approach:** Add concise guidance that new LFG runs use feature-specific worktrees before planning and that failed isolation is a stop condition. Update the existing LFG backlog plan to distinguish its slice-level worktree guidance from the global `/lfg` startup invariant.
- **Patterns to follow:** Existing README development guidance and plan prose.
- **Test scenarios:** Test expectation: none -- documentation-only behavior.
- **Verification:** The docs state the invariant, branch/path naming expectation, already-isolated behavior, Git-root verification, and failure-stop behavior.

### U2. Update Local LFG Skill Instructions

- **Goal:** Make future local `/lfg` invocations start by invoking worktree isolation before `ce-plan`.
- **Requirements:** R1, R2, R3, R4, R5, R7
- **Dependencies:** U1
- **Files:** Local installed skill files for `lfg` and `ce-worktree` outside the repository; tracked PR docs record the contract because those installed files are not part of this repo.
- **Approach:** Add an explicit Step 0 to the local `/lfg` skill: invoke `ce-worktree`, verify the agent is operating from the resulting worktree, then continue to `ce-plan`. Clarify in `ce-worktree` that LFG is an always-isolate caller even for a single task.
- **Patterns to follow:** Current `lfg` step numbering and `ce-worktree` detection rules.
- **Test scenarios:** Manual verification by reading the updated skill files and confirming the preflight appears before the plan step.
- **Verification:** A future `/lfg` skill attachment should include the worktree preflight before Step 1.

### U3. Validate, Commit, PR, And Merge

- **Goal:** Ship the tracked documentation changes through the normal repo gate.
- **Requirements:** R6
- **Dependencies:** U1, U2
- **Files:** Changed tracked docs and plan files.
- **Approach:** Run formatting and relevant tests for the documentation-only repo change. Commit the branch, push it, open a PR, watch CI, and merge once green.
- **Patterns to follow:** Recent conventional commit and PR style.
- **Test scenarios:** `npm run check` should pass for Markdown/config formatting coverage.
- **Verification:** The PR is merged and CI is green, or any blocker is recorded durably.

---

## Scope Boundaries

- This change does not alter application runtime behavior or generated host adapters.
- This change does not require every non-LFG task to use a worktree.
- This change does not remove the plan-first rule; it moves workspace isolation before planning.
- This change does not make plugin-cache files part of the npm package or repo tarball.

---

## Risks & Dependencies

- **Local skill source is outside the repo:** The PR cannot commit plugin-cache edits. Mitigate by committing tracked docs and explicitly reporting the local skill update.
- **Nested worktrees:** Starting from an already isolated checkout must not create another worktree. Mitigate by relying on `ce-worktree` detection.
- **Harness root mismatch:** Some harnesses may not move their active root after a worktree is created. Mitigate by verifying `git rev-parse --show-toplevel` and branch before edits.
- **Branch naming collisions:** A feature-derived branch may already exist. Implementation should use the existing worktree skill's fallback/error behavior rather than inventing a parallel scheme.
