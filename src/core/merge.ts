import type { Overlay, Role } from "../schema/index.js";
import type { LoadedBase } from "./loader.js";
import { skillsForTrack } from "./loop.js";
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
  // Track-aware: drop skills that don't belong to the chosen track (e.g. the
  // integration `wrap-up` skill on a quick/standard repo). Filtering here keeps
  // the NeutralModel the single source of truth — adapters and the smoke gate
  // all read the already-scoped skill set.
  const skills = skillsForTrack(base.skills, overlay.defaultTrack ?? "standard");

  return {
    manifest: base.manifest,
    constitution,
    roles,
    skills,
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
