---
name: compound-learning
description: Route a correction to the right instruction surface and record it as an evidence-linked learning. Use when the agent got something wrong and the fix belongs in standards, role guidance, or a domain doc — not in the diff.
---

# Compound Learning

Route corrections to the **instruction**, not the diff. This skill is the front
door to the Accepted Learning Ledger compounding loop.

## When to invoke

- The agent repeated a mistake that a rule or doc should prevent.
- A correction applies globally, to one role, or to one domain module.
- You want the learning to resurface on future runs touching the same surface.

## Routing surfaces

| Surface | Target | Example |
| --- | --- | --- |
| global | Constitution / standards | "Always run tests with `npm test`, not `yarn`." |
| role | `roleAddenda` / role grounding | "Tester must not skip integration tests for API changes." |
| domain | `.sdlc/overlay/domain-docs/<domain>.md` | "Auth module uses JWT rotation — see `src/auth/`." |

## Workflow

1. Capture the correction in one sentence and gather **evidence** (`file:line` paths).
2. Classify the surface (global / role / domain). Use `--surface` when ambiguous.
3. Propose a pending learning — review before accept.
4. On accept, the entry promotes to `.sdlc/memory/accepted-learnings.jsonl` and
   appears in role guidance and `aisdlc status`.

## Rules

- No free-form chat memory — every entry must cite evidence.
- Do not accept learnings that weaken hard gates or write scopes.
- Prefer the narrowest surface that fixes the mistake.

## CLI integration

Use the compound-learning helpers in the compiled toolchain to propose, list
pending, accept, or reject learnings. Pending entries live at
`.sdlc/memory/pending-learnings.jsonl`.
