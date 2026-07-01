---
title: "feat: Templated deterministic role addenda (Track C)"
type: feat
date: 2026-06-30
origin: docs/brainstorms/2026-06-30-agent-skills-description-extension-requirements.md
---

# feat: Templated deterministic role addenda (Track C)

## Summary

Populate `overlay.roleAddenda` during deterministic customize from evidence-backed workflow templates (no host LLM). Prior user/plugin addenda win per role key; template output passes the addenda contract and avoids duplicating deterministic grounding facts.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R14 | Templates fill `roleAddenda` when mining confidence is sufficient |
| R15 | Output passes `assertRoleAddendumWithinContract` |
| R16 | No duplication of commands, map paths, or linter names already in grounding |
| R17 | `prior?.roleAddenda` preserved; templates fill empty keys only |
| R18 | Ready corpus fixtures gain non-empty addenda where evidence exists |

---

## Implementation

- **`src/customize/role-addenda-templates.ts`** — `buildTemplateRoleAddenda(profile, projectContext, answers, provenance)` per role when grounding helpers would emit.
- **`src/customize/emitters.ts`** — `mergeRoleAddenda` in `buildOverlay`.
- **Tests** — `tests/core/role-addenda-templates.test.ts`, customize prior-wins case unchanged.

---

## Verification

- [ ] `npm test`
- [ ] Corpus regression green on fixtures with addenda expectations

---

## Residual

- None for Track C scope.
