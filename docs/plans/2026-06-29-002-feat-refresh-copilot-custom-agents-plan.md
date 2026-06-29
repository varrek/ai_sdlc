---
title: "feat: Refresh Copilot adapter for current custom-agent capabilities"
type: feat
date: 2026-06-29
origin: roadmap item 6 — Copilot adapter refresh
---

# feat: Refresh Copilot adapter for current custom-agent capabilities

## Summary

Update the Copilot adapter to emit `.github/agents/*.agent.md` profiles that use current GitHub Copilot custom-agent frontmatter: explicit `target`, posture `tools`, per-role MCP scoping via `serverId/*`, and native `handoffs` for the SDLC loop. Keep the Approved? gate honest as instruction-checklist + CI/cloud-hook fallback — Copilot IDE still has no PreToolUse-style hook.

---

## Problem Frame

The Copilot adapter was authored when custom agents were newer and handoffs lived in a bespoke `handoffs.json`. GitHub and VS Code docs now document richer agent profiles (`target`, `tools` with MCP `server/*` patterns, native `handoffs`, optional `mcp-servers` for cloud agents). The adapter underuses these primitives and its capability comments understate what partial enforcement exists today.

---

## Research (current Copilot custom-agent primitives)

| Property | IDE (`target: vscode`) | Cloud/CLI (`target: github-copilot`) |
|---|---|---|
| `tools` | Posture allowlist + `serverId/*` for MCP scoping | Same |
| `mcp-servers` | **Not used** — workspace `.vscode/mcp.json` | Per-agent MCP config |
| `handoffs` | Native UI buttons between agents | Supported |
| `hooks` | Preview, opt-in setting | CLI/cloud hook JSON (existing emit) |
| PreToolUse gate | **No IDE equivalent** | CLI/cloud only |

---

## Requirements

- R1. Emit `target: vscode` on loop agents (IDE-first SDLC orchestration).
- R2. Include posture tools plus `serverId/*` entries for each role's bound MCP servers (least-privilege declaration).
- R3. Emit native `handoffs` frontmatter on agents that participate in the active ceremony track.
- R4. Retain `handoffs.json` as machine-readable loop documentation (stage → role mapping, gate fallback note).
- R5. Keep `.vscode/mcp.json` as the workspace MCP envelope; do not emit per-agent `mcp-servers` for IDE targets.
- R6. Preserve Approved? gate as `fallback`: instructions + CI + cloud hook; record `approved-gate-hook` gap.
- R7. Add honest gap for per-role MCP enforcement limits on IDE (tools partial; no `beforeMCPExecution`).
- R8. Update adapter tests and golden compile snapshot.

---

## Implementation

### U1. Shared loop handoff helper (`src/adapters/copilot/loop-handoffs.ts`)

- Map loop stages to next stage via `loopStagesForTrack`.
- Build native handoff objects `{ label, agent, prompt, send: false }` using `STAGE_ROLE` for agent ids.
- Export `handoffsForRole(roleName, model)` consumed by `agents.ts` and `handoffs.ts`.

### U2. Agent profile emit (`src/adapters/copilot/agents.ts`)

- Frontmatter: `name`, `description`, `target: vscode`, `tools`, optional `model`, optional `handoffs`.
- Tools = `toolsForPosture(...)` + `allowedServersForRole(...).map(s => \`${s}/*\`)`.

### U3. Capability + gaps (`src/adapters/copilot/index.ts`)

- Refresh comments for `roleSubagents`, `perRoleToolRestriction`, `gates`.
- Add `per-role-mcp-hook` gap with honest partial-enforcement rationale.
- Keep `approved-gate-hook` gap unchanged in spirit.

### U4. Handoffs note (`src/adapters/copilot/handoffs.ts`)

- Update `note` to reference native frontmatter handoffs + remaining gate fallback.

### U5. Tests + docs

- Extend `tests/adapters/agents.test.ts` for target, MCP tools, handoffs frontmatter.
- Update golden snapshot via `npm test`.
- Touch README Copilot bullet if emission shape changed materially.

---

## Residual risks

- Copilot IDE tool names may diverge from Claude-style names we emit; profiles remain best-effort.
- `tools` + `server/*` is partial enforcement — workspace MCP config still lists all servers.
- Native handoffs require a recent VS Code / Copilot build; `handoffs.json` remains the portable doc.
- Cloud autonomous wrap-up still lacks a dedicated `github-copilot` agent profile (deferred).

---

## Verification

```bash
npm run typecheck
npm test -- tests/adapters/agents.test.ts tests/adapters/gates.test.ts tests/loop/compiled-shape.test.ts tests/core/engine.test.ts tests/golden/compile.test.ts
```
