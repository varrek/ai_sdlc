import type { Overlay, Role, ToolPosture } from "../../schema/index.js";
import type { NeutralModel } from "../../core/types.js";

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

/** Role -> {posture, allowed servers}; consumed by hook-based hosts (Cursor/Copilot). */
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

/**
 * The linear SDLC loop order (single-writer). Debugger is on-demand and not part
 * of the linear handoff chain. Used to derive per-host dispatch/handoffs.
 */
export const SDLC_LOOP_ORDER = ["architect", "engineer", "reviewer"] as const;

/** The loop roles present in the model, in canonical order. */
export function presentLoopRoles(model: NeutralModel): string[] {
  const names = new Set(model.roles.map((r) => r.frontmatter.name));
  return SDLC_LOOP_ORDER.filter((r) => names.has(r));
}

/**
 * The loop roles present in the model for its chosen ceremony track. The
 * `quick` track is the minimal single-writer slice (Engineer -> Reviewer) and
 * drops the up-front Architect planning stage; `standard` and `full` keep the
 * full role chain. Defaults to `standard` when the overlay sets no track.
 */
export function presentLoopRolesForTrack(model: NeutralModel): string[] {
  const present = presentLoopRoles(model);
  const track = model.overlay.defaultTrack ?? "standard";
  return track === "quick" ? present.filter((r) => r !== "architect") : present;
}
