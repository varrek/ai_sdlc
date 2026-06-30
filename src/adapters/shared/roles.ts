import type { NeutralModel } from "../../core/types.js";
import type { Overlay, Role, ToolPosture } from "../../schema/index.js";

/**
 * Claude-style tool allowlists per posture. Read-only roles (Architect,
 * Reviewer) never receive Write/Edit; read-run adds command execution; write
 * is the full set. This is the native enforcement point on Claude Code and the
 * reference postures the hook-based hosts mirror.
 */
export function toolsForPosture(posture: ToolPosture): string[] {
  switch (posture) {
    case "read-only":
      return ["Read", "Grep", "Glob"];
    case "read-run":
      return ["Read", "Grep", "Glob", "Bash"];
    case "write":
      return ["Read", "Grep", "Glob", "Bash", "Write", "Edit"];
    default: {
      const _exhaustive: never = posture;
      return _exhaustive;
    }
  }
}

/** Kiro uses lowercase built-in tool names in custom-agent frontmatter. */
export function kiroToolsForPosture(posture: ToolPosture): string[] {
  switch (posture) {
    case "read-only":
      return ["read", "web"];
    case "read-run":
      return ["read", "web", "shell"];
    case "write":
      return ["read", "web", "write", "shell"];
    default: {
      const _exhaustive: never = posture;
      return _exhaustive;
    }
  }
}

/**
 * The concrete MCP server ids a role is permitted to reach: the contracts named
 * in the role's frontmatter, intersected with bindings whose `allowedRoles`
 * admit this role (empty allowedRoles = any role the contract is wired to).
 */
export function allowedServersForRole(role: Role, overlay: Overlay): string[] {
  const servers: string[] = [];
  for (const contractId of role.frontmatter.integrations) {
    const binding = overlay.integrations[contractId];
    if (!binding) continue;
    const roleAdmitted =
      binding.allowedRoles.length === 0 || binding.allowedRoles.includes(role.frontmatter.name);
    if (roleAdmitted) servers.push(binding.serverId);
  }
  return [...new Set(servers)].sort();
}

export interface RolePolicyEntry {
  posture: ToolPosture;
  /** MCP server ids this role may call. */
  servers: string[];
}

/** Role -> {posture, allowed servers}; consumed by hook-based hosts. */
export function buildRolePolicy(model: NeutralModel): Record<string, RolePolicyEntry> {
  const policy: Record<string, RolePolicyEntry> = {};
  for (const role of model.roles) {
    policy[role.frontmatter.name] = {
      posture: role.frontmatter.posture,
      servers: allowedServersForRole(role, model.overlay),
    };
  }
  return policy;
}

/** Stable JSON for emitted policy/config files (sorted keys, trailing newline). */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// The loop's per-track stage chain (Architect -> Engineer -> Reviewer -> wrap-up,
// sliced by track) lives in core/loop.ts as the single source of truth, shared
// with the customize emitters. Dispatch adapters import `loopStagesForTrack`.
