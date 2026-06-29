---
title: "feat: OpenAI Codex as fourth host adapter"
type: feat
status: active
date: 2026-06-29
---

# feat: OpenAI Codex as fourth host adapter

## Summary

Add a focused Codex adapter so `aisdlc compile` emits project-scoped Codex config alongside Cursor, Claude Code, and Copilot. Reuse the host-neutral `AGENTS.md` and `.agents/skills` tree; map roles, MCP, and gates to Codex-native paths (`.codex/config.toml`, `.codex/agents/`, `.codex/skills/`, `.codex/hooks/`).

## Codex surface (research-backed)

| Neutral capability | Codex target |
| --- | --- |
| Instructions | `AGENTS.md` (native discovery) + per-package `AGENTS.md` via shared emitter |
| Skills | `.agents/skills/` (portable) + `.codex/skills/` (host copy) |
| Role subagents | `.codex/agents/<name>.toml` (`name`, `description`, `developer_instructions`, `sandbox_mode`, per-agent `mcp_servers`) |
| MCP | `[mcp_servers.*]` in `.codex/config.toml` |
| Approved? + MCP least-privilege | `[[hooks.PreToolUse]]` in `.codex/config.toml` + hook scripts under `.codex/hooks/` |

## Capability declaration (honest)

| Capability | Level | Notes |
| --- | --- | --- |
| instructions | Native | `AGENTS.md` passthrough |
| skills | Native | Standard `SKILL.md` in `.agents/skills` + `.codex/skills` |
| roleSubagents | Native | `.codex/agents/*.toml` |
| perRoleToolRestriction | Partial | `sandbox_mode` + per-agent MCP enablement; no tool-level allowlist |
| gates | Native | `PreToolUse` hooks in project `config.toml` |
| mcp | Native | `[mcp_servers.*]` in `.codex/config.toml` |

## Implementation steps

1. Extend `HostId` and `HOST_ORDER`; register `CodexAdapter` in `buildRegistry()`.
2. Add `src/adapters/codex/` emitters: `instructions`, `skills`, `agents`, `config` (MCP + hooks TOML), `gates` (scripts), `toml` (deterministic renderer).
3. Update `sdlc-base/host-manifest.yaml`, README, CLI help, capability matrix.
4. Extend adapter tests (instructions, mcp, agents, gates, skills, capability matrix, host manifest).
5. Regenerate golden snapshot if base manifest includes `codex`.

## Files

| Area | Paths |
| --- | --- |
| Schema | `src/schema/host-manifest.ts` |
| Adapter | `src/adapters/codex/*`, `src/adapters/registry.ts` |
| Matrix | `src/core/capability-matrix.ts`, `docs/capability-matrix.md` |
| Base | `sdlc-base/host-manifest.yaml` |
| Tests | `tests/adapters/*.test.ts`, `tests/core/capability-matrix.test.ts`, `tests/schema/load.test.ts` |
| Docs | `README.md`, `package.json` description |

## Test plan

- Host manifest parses with `codex` host id.
- Registry includes four adapters; matrix has four columns.
- Codex emits `AGENTS.md`, `.codex/config.toml` with `[mcp_servers.*]`, `[[hooks.PreToolUse]]`, `.codex/agents/*.toml`, skills in `.agents/skills` and `.codex/skills`.
- MCP server defs match Claude/Cursor for the same overlay binding.
- Reviewer agent is `read-only` with no enabled MCP servers; engineer gets bound MCP.
- `npm run typecheck` and focused vitest suites pass.

## Out of scope

- Plugin-mode / LLM personalization (item 1).
- Codex plugin manifests (`.codex-plugin/`).
- User-global `~/.codex/` config.
