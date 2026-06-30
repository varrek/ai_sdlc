# Eval Framework Ownership

This repo ships three complementary eval layers. Each answers a different product
question; they are not interchangeable.

## Loop behavior eval (`tests/corpus/loop-behavior-eval.ts`)

**Question:** Does emitted host guidance produce a loop that hits the expected
stages, records approval gates, and terminates cleanly?

**Inputs:** Synthetic loop trace fixtures and compiled host outputs.

**When to run:** Local corpus tests (`npm test`); optional CI when touching loop
scoring or host dispatch adapters.

## Behavior eval v2 (`tests/corpus/behavior-eval-v2.ts`)

**Question:** Do role instruction surfaces contain deterministic grounding for
architect/engineer/tester/reviewer/debugger without relying on host LLM calls?

**Inputs:** Compiled agent files and mined standards from fixture repos.

**When to run:** Local corpus tests; primary guard for role-grounding regressions.

## External bench (`aisdlc bench`)

**Question:** Can the setup chain reach setup-ready on pinned public repositories
under reproducible selection?

**Inputs:** `eval-corpus/external-repos.json`, git clone cache under `.verify/`.

**When to run:** Opt-in locally or in scheduled CI; requires network and git.
See [`external-repo-workflow.md`](./external-repo-workflow.md).

## Choosing the right tool

| Symptom | Start here |
| --- | --- |
| Wrong loop stage ordering or missing approval events | Loop behavior eval |
| Generic role instructions or missing evidence citations | Behavior eval v2 |
| Real-world repo fails setup on bench | External bench + fix loop |

Golden compile snapshots (`tests/golden/compile.test.ts`) remain the contract
for host-native emitted file shapes across all hosts.
