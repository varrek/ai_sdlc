# Tech Debt Audit - ai-sdlc

Generated: 2026-06-30 (fresh repeat-run after PR #31 merge)

## Executive Summary

- **RESOLVED in PR #31 + this pass:** F002–F012, F017–F024, F026–F031, F033–F034, F036, F041–F043, **F013/F014** (mined snapshot + `status --refresh`), **F025** (accepted-learnings-sync layering), **F035** (classifySetupFailure tests), **F037** (eval-frameworks doc), **F045** (external bench advanced section), **NEW-F046** (Codex/Kiro MCP fail-closed on corrupt policy via shared loader).
- **Partial:** **F001** — extracted `miner-walk.ts` (walk/inventory fingerprint); full orchestration split still open.
- **Deferred:** F016 (CLI router split), F038 (golden snapshot split), F039–F040 (breaking npm audit fixes), F044 (historical plan fixture path note).
- Tooling on this branch: `npm run typecheck` pass, `npm test` pass, `npm audit` reports dev-only vitest/vite/esbuild chain (accepted residual).

## Tooling Evidence (2026-06-30)

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | pass (474+ tests) |
| `npm audit --audit-level=low` | fail — vitest/vite/esbuild + js-yaml (dev-only / breaking fix) |
| `npx madge --circular src` | no cycles |
| `npx depcheck` | clean |
| `node dist/cli/index.js garden-docs --repo . --format json` | 0 findings |

## Findings Status

| ID | Status | Notes |
| --- | --- | --- |
| F001 | **OPEN (partial)** | `miner-walk.ts` extracted; CI/architecture/package modules remain in `repo-miner.ts` |
| F002 | **RESOLVED** | Package mining uses prefetched inventory |
| F003–F012 | **RESOLVED** | Prior pass |
| F013 | **RESOLVED** | `.sdlc/overlay/.mined-snapshot.json` + inventory fingerprint |
| F014 | **RESOLVED** | `aisdlc status --refresh` |
| F015 | **OPEN** | Smoke still re-mines for gap count |
| F016 | **OPEN** | CLI router split deferred |
| F017–F024 | **RESOLVED** | Prior pass |
| F025 | **RESOLVED** | Sync moved to `src/customize/accepted-learnings-sync.ts` |
| F026–F036 | **RESOLVED** | Prior pass + F035 tests this pass |
| F037 | **RESOLVED** | `docs/eval/eval-frameworks.md` |
| F038 | **OPEN** | Golden snapshot split deferred |
| F039–F040 | **OPEN (accepted)** | Breaking upgrades tracked as residual |
| F041–F043 | **RESOLVED** | Prior pass |
| F044 | **OPEN** | Plan doc references absent fixture dir |
| F045 | **RESOLVED** | Advanced bench section added |
| NEW-F046 | **RESOLVED** | Shared `mcpPolicyLoaderScript` for Cursor/Codex/Kiro |

## Top 5 Remaining

1. **F001** — Finish repo-miner modularization (CI test-command, architecture, workspace-packages).
2. **F016** — Thin `cli/index.ts` router.
3. **F038** — Split golden snapshot by host to reduce review noise.
4. **F039/F040** — Vitest 3 / js-yaml upgrade branch when ready.
5. **F015** — Persist gap inputs during customize for smoke fast path.

## Accepted Residuals

- **npm audit (F039/F040):** Dev-server advisories in vitest/vite/esbuild; upgrade requires dedicated branch.
- **F044:** Historical plan documents may reference fixtures never added; update plans when touched, not bulk rewrite.

## Quick Wins (remaining)

- [ ] F015: Smoke gap count from persisted customize state.
- [ ] F044: Update LSP doc-gardening plan fixture path note.
