import type { Overlay, Role } from "../schema/index.js";
import type { LoadedBase } from "./loader.js";
import type { NeutralModel } from "./types.js";

/**
 * Merge a project overlay onto the loaded base to produce the resolved
 * NeutralModel. Only the configurable edges are merged; hard gates live in the
 * constitution and have no overlay representation, so they cannot be merged
 * away. Overlay values win over base values where both apply.
 */
export function mergeOverlay(base: LoadedBase, overlay: Overlay): NeutralModel {
  const roles = base.roles.map((role) => applyRoleOverlay(role, overlay));
  const constitution = appendStandards(base.constitution, overlay.standards);

  return {
    manifest: base.manifest,
    constitution,
    roles,
    skills: base.skills,
    integrations: base.integrations,
    overlay,
  };
}

function applyRoleOverlay(role: Role, overlay: Overlay): Role {
  const modelOverride = overlay.roleModels[role.frontmatter.name];
  if (!modelOverride) return role;
  return {
    ...role,
    frontmatter: { ...role.frontmatter, model: modelOverride },
  };
}

function appendStandards(constitution: string, standards: string[]): string {
  if (standards.length === 0) return constitution;
  const lines = ["", "## Project standards (from overlay)", ""];
  for (const s of standards) lines.push(`- ${s}`);
  return `${constitution}\n${lines.join("\n")}\n`;
}
