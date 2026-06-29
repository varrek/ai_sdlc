# AI SDLC Constitution (base)

This is the host-neutral constitution for the internal AI SDLC framework. It is
compiled into each host's native format (Cursor rules, Claude Code / `AGENTS.md`,
Copilot instructions). Teams extend it through their **overlay** — they never
edit this file directly.

## Base Gates

These four gates are the base workflow every project starts from. They are not
changed by prose role guidance or typo-prone ad hoc overlay fields:

1. **Review required** — every change is reviewed before it merges (by a human, or
   an agent reviewer whose findings a human signs off on).
2. **Tests must pass** — the project test suite is green before a change ships.
3. **Approved? gate** — orchestration halts for explicit human approval at the
   defined checkpoint before writes leave the workspace.
4. **Least-privilege MCP** — each role reaches only the integrations its declared
   posture allows. Nothing gets blanket tool access.

## Configurable edges (set via overlay)

Everything below the gates is team-owned and lives in the project overlay:

- Default ceremony track (quick / standard / full).
- Additional project coding standards.
- Integration bindings (which MCP server backs each contract, and which roles may
  reach it).
- Per-role model overrides.
- Operating mode (Plugin Mode by default, deterministic as an explicit opt-out).
- Reviewable generated role guidance.

Plugin Mode policy changes that adapt gates, role postures, or review flow must
be structured, visible, and validated before adapters emit them. Hidden prose does
not grant capabilities.

## Roles

The base ships role definitions under `roles/`. Each role declares a tool
`posture` that the compiler turns into concrete per-host permissions.
