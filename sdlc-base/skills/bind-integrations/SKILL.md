---
name: bind-integrations
description: Bind deferred GitLab/Jira integration contracts in the overlay when wrap-up or Full-track work needs MCP servers.
---

# /bind-integrations

Integrations are **deferred at setup** so repos reach setup-ready without
hand-editing MCP. Bind them just-in-time before `wrap-up`.

## Invariants

- **Least privilege.** Each binding lists `serverId`, optional `server` spec, and
  `allowedRoles` — only roles that need the integration.
- **No placeholders.** Use real server ids or leave deferred; never fake bindings.
- **Verify.** Re-run `aisdlc compile` and confirm `bind-integrations` clears from
  `.sdlc/maintenance-report.json`.

## Flow

1. Read `.sdlc/maintenance-report.json` and integration contracts under
   `sdlc-base/integrations/`.
2. Propose `integrations.gitlab` / `integrations.jira` entries in
   `.sdlc/overlay/.customize.yaml`.
3. Present diff for approval; compile; re-run `aisdlc maintain`.
