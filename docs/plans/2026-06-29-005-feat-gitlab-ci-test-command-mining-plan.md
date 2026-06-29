---
title: "feat: Mine GitLab CI test commands"
type: feat
date: 2026-06-29
origin: docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md
---

# feat: Mine GitLab CI test commands

## Summary

Extend repo-miner test-command resolution to parse `.gitlab-ci.yml` `script` blocks with the same evidence, job-priority, and ecosystem-gating rules used for GitHub Actions. GitHub Actions behavior stays unchanged; GitLab CI is consulted after ranked GitHub workflows and before Makefile/package.json fallbacks.

---

## Problem Frame

The miner records `.gitlab-ci.yml` as CI evidence but `resolveTestCommand` only extracts commands from GitHub Actions workflows. GitLab teams therefore keep an open `test-command` gap despite authoritative CI configuration, lowering hands-off setup rate.

---

## Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| R1 | Parse `.gitlab-ci.yml` job `script` entries (string or array) and reuse `pickTestSegment` normalization. | Unit test with multi-line/array script |
| R2 | Prioritize test/ci-named jobs over incidental jobs (mirror `workflowRank` heuristics). | Fixture prefers `test` job over `nightly` |
| R3 | Apply existing `ecosystemAllowed` gating so minority-language commands are rejected. | Python repo with auxiliary `npm test` stays open |
| R4 | Preserve GitHub Actions precedence and existing workflow ranking when both CI systems exist. | Existing customize tests unchanged |
| R5 | Record `.gitlab-ci.yml` as test-command evidence and CI provenance in customize flow. | Setup-ready GitLab fixture + provenance |
| R6 | Malformed YAML or non-test jobs leave test command unresolved. | Negative fixture |

---

## Key Technical Decisions

- **GitHub first, GitLab second within CI tier:** Most repos use one CI host; when both exist, GitHub Actions keeps current priority so behavior is unchanged for mixed or migration repos.
- **Job detection:** Top-level YAML keys whose values are objects with a `script` field are jobs; skip reserved GitLab keys and hidden template jobs (names starting with `.`).
- **Script-only mining:** Inspect `script` arrays only (not `before_script`), matching the research first slice and GitHub step semantics.
- **Shared ranking:** Reuse `workflowRank` on job names — same test/ci naming heuristics apply.

---

## Implementation Units

### U1. GitLab CI parser and resolver hook

- **Goal:** Extract test commands from GitLab CI jobs and integrate into `resolveTestCommand`.
- **Requirements:** R1, R2, R4
- **Files:** `src/customize/repo-miner.ts`
- **Approach:** Add `testCommandFromGitLabCi`, reserved-key filter, job ranking, and a GitLab pass after the GitHub workflow loop in `resolveTestCommand`.
- **Test scenarios:**
  - Happy path: pytest from a `test` job `script` array becomes primary test command with evidence `.gitlab-ci.yml`.
  - Job priority: `ci`/`test`-named job wins over alphabetically earlier incidental job.
  - GitHub precedence: repo with both GH workflow and GitLab file keeps GitHub-mined command.
- **Verification:** Focused customize tests pass; no change to GitHub-only fixtures.

### U2. Fixtures and negative cases

- **Goal:** Lock behavior with sample repos and scaffold tests.
- **Requirements:** R3, R5, R6
- **Files:** `tests/customize/customize.test.ts`, optional `tests/fixtures/sample-repos/gitlab-ci-repo/`
- **Test scenarios:**
  - GitLab-only Python repo reaches setup-ready with `pytest` and CI provenance.
  - Minority-ecosystem GitLab command rejected on Python-primary repo.
  - GitLab file with only lint/deploy scripts leaves gap open.
- **Verification:** New tests green; full customize suite passes.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- CircleCI, Jenkins, Azure Pipelines parsing.
- GitLab `include:` / multi-file CI composition.
- Mining from `before_script` or `extends` template indirection.

---

## Risks & Dependencies

- **YAML shape variance:** GitLab allows anchors and hidden jobs; first slice handles flat job maps only.
- **Dual CI repos:** Rare; GitHub-first ordering is an explicit conservative choice.

---

## Sources & Research

- `docs/ideation/2026-06-29-agent-language-tooling-improvements-research.md` (ranked opportunity #3)
- `docs/plans/2026-06-29-004-feat-lfg-improvement-backlog-plan.md` (U3)
- Existing `resolveTestCommand`, `testCommandFromWorkflow`, `pickTestSegment`, `ecosystemAllowed`
