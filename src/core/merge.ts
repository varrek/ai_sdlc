import type { Overlay, Role } from "../schema/index.js";
import type { LoadedBase } from "./loader.js";
import { skillsForTrack } from "./loop.js";
import { renderCodebaseMap, type ProjectContext } from "./project-context.js";
import { appendAddendum, assertRoleAddendumWithinContract } from "./role-addenda.js";
import type { AcceptedLearningEntry } from "./accepted-learnings.js";
import { appendAcceptedLearnings, appendRoleGrounding, type RoleGroundingInput } from "./role-grounding.js";
import type { NeutralModel } from "./types.js";

/**
 * Merge a project overlay onto the loaded base to produce the resolved
 * NeutralModel. Only the configurable edges are merged; hard gates live in the
 * constitution and have no overlay representation, so they cannot be merged
 * away. Overlay values win over base values where both apply.
 *
 * An optional ProjectContext (mined repo shape) is attached to the model and its
 * codebase map appended to the constitution, so every host inherits the same
 * navigation aid. When absent, the model degrades to today's output.
 */
export function mergeOverlay(
  base: LoadedBase,
  overlay: Overlay,
  projectContext?: ProjectContext,
  acceptedLearnings: AcceptedLearningEntry[] = [],
): NeutralModel {
  const groundingInput: RoleGroundingInput = { overlay, projectContext };
  const roles = base.roles
    .map((role) => applyRoleOverlay(role, overlay))
    .map((role) => appendRoleGrounding(role, groundingInput))
    .map((role) => appendAcceptedLearnings(role, acceptedLearnings));
  let constitution = appendStandards(base.constitution, overlay.standards);
  if (projectContext && projectContext.map.length > 0) {
    constitution = `${constitution}\n${renderCodebaseMap(projectContext.map)}\n`;
  }
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
    projectContext,
  };
}

function applyRoleOverlay(role: Role, overlay: Overlay): Role {
  const { name, posture } = role.frontmatter;
  const modelOverride = overlay.roleModels[name];
  // Addenda for a role absent from the model are never reached (this only runs for
  // base roles), mirroring how `loopStagesForTrack` drops absent stages.
  const addendum = overlay.roleAddenda[name];

  if (!modelOverride && !addendum) return role;

  const frontmatter = modelOverride
    ? { ...role.frontmatter, model: modelOverride }
    : role.frontmatter;

  if (!addendum) return { ...role, frontmatter };

  // Gate-safety is enforced here (not at schema time) because it depends on the
  // role's declared posture. An out-of-contract addendum throws, failing compile.
  assertRoleAddendumWithinContract(name, posture, addendum);
  return { ...role, frontmatter, body: appendAddendum(role.body, addendum) };
}

function appendStandards(constitution: string, standards: string[]): string {
  if (standards.length === 0) return constitution;
  const lines = ["", "## Project standards (from overlay)", ""];
  for (const s of standards) lines.push(`- ${s}`);
  return `${constitution}\n${lines.join("\n")}\n`;
}
