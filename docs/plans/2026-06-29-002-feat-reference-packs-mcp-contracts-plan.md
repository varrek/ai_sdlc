---
title: "feat: Ship reference packs and broaden MCP integration contracts"
type: feat
status: active
date: 2026-06-29
origin: roadmap item 5
---

# feat: Ship reference packs and broaden MCP integration contracts

## Summary

Ship a small curated set of reference extension packs under `packs/` and add host-neutral integration contracts for widely useful MCP-backed systems. Document pack authoring and usage with least-privilege constraints. Add loader tests that prove reference packs compose with the base and that duplicate or conflicting artifacts fail closed.

---

## Problem frame

The pack schema and loader exist, and README documents the `--packs` flag, but there are no shipped example packs — only ephemeral test-generated directories. Teams cannot copy a vetted security, frontend, backend, or infra starting point. Integration contracts are limited to GitLab and Jira in `sdlc-base/`; GitHub, Linear, Sentry, Playwright, Context7, and database MCP tools have no contract surface for overlay binding and wrap-up validation.

---

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Curated reference packs: `security`, `frontend`, `backend-api`, `infra` — not a marketplace |
| R2 | Each pack has `pack.yaml` plus at least one role or skill where useful |
| R3 | MCP integration contracts live in packs when they extend (not replace) base GitLab/Jira |
| R4 | Contracts for github, linear, sentry, playwright, context7, database (read-only posture) |
| R5 | Docs cover usage, authoring, examples, and safety constraints (additive, no gate weakening) |
| R6 | Tests load all reference packs with base; reject duplicate role/skill/integration/pack names |
| R7 | No real credentials or live MCP servers required for tests |

---

## Key technical decisions

1. **Packs stay out of `sdlc-base/`.** Reference packs ship beside the base at `packs/<name>/` so teams opt in via `--packs` without changing the default compile surface.

2. **Integration contracts follow the existing thin-contract model.** Each contract names MCP tool ids; concrete servers bind in the project overlay at customize/wrap-up time — same as GitLab/Jira.

3. **Least-privilege by role posture.** Pack roles declare `integrations:` explicitly; read-only reviewers get read-only contract operations; write paths stay on base Engineer/wrap-up flows.

4. **Duplicate names fail at load time.** The loader already throws on duplicate pack, role, skill, or integration names; reference-pack tests assert this for cross-pack and base conflicts.

5. **Docs live in `docs/packs.md`.** `packs/README.md` is a short index pointing to the full guide.

---

## Implementation units

### U1 — Reference pack content

Create four packs:

| Pack | Role | Skill | Integrations |
| --- | --- | --- | --- |
| `security` | `security-reviewer` (read-only) | `threat-model` | `sentry` |
| `frontend` | `frontend-reviewer` (read-only) | `ui-smoke-check` | `playwright`, `context7` |
| `backend-api` | `api-reviewer` (read-only) | `api-contract-review` | `github`, `database` |
| `infra` | `infra-reviewer` (read-only) | `deploy-readiness` | `linear` |

Each pack includes optional `AGENTS.md` guidance scoped to the domain.

### U2 — Integration contracts

Add `.contract.yaml` files under each pack's `integrations/` directory using the existing `IntegrationContract` schema. Tool names follow `{integration}_{operation}` convention matching base GitLab/Jira.

### U3 — Documentation

- `docs/packs.md` — usage (`--packs`), anatomy, authoring checklist, safety constraints, examples
- `packs/README.md` — index of shipped packs
- README link to `docs/packs.md`

### U4 — Tests

- `tests/packs/reference-packs.test.ts` — load base + all reference packs; assert unique artifacts present
- Extend duplicate-rejection cases: cross-pack integration collision, duplicate pack name via two dirs (manifest name clash)

### U5 — Verification

Run `npm run typecheck` and pack/loader tests (`vitest run tests/packs tests/core/loader.test.ts tests/schema/load.test.ts`).

---

## Out of scope

- Pack registry/marketplace, semver publishing, or auto-discovery
- Weakening hard gates via pack content (packs cannot express gate overrides)
- Wiring live MCP servers or credential templates

---

## Residual risks

- MCP tool names in contracts may drift from actual server implementations; contract gaps surface at wrap-up validation time
- Teams combining multiple packs must ensure overlay bindings cover every integration their roles declare
