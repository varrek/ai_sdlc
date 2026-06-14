import type { CeremonyTrack, Skill } from "../schema/index.js";
import type { NeutralModel } from "./types.js";

/** A stage in the compiled SDLC loop. `wrap-up` is the MCP MR/Jira step. */
export type LoopStage = "architect" | "engineer" | "reviewer" | "wrap-up";

/**
 * Which role performs each loop stage. The wrap-up stage is not a distinct role:
 * it is performed by the Engineer (the single writer, the only role holding the
 * gitlab/jira integrations), so least-privilege still holds.
 */
export const STAGE_ROLE: Record<LoopStage, string> = {
  architect: "architect",
  engineer: "engineer",
  reviewer: "reviewer",
  "wrap-up": "engineer",
};

/**
 * Map a ceremony track to the loop stages it runs — the single source of truth
 * for "what runs per track", consumed by both the customize emitters and the
 * per-host dispatch/handoff adapters. Quick is the minimal single-writer slice
 * (Engineer -> Reviewer); Standard adds up-front planning; Full adds the
 * integration wrap-up.
 */
export function stagesForTrack(track: CeremonyTrack): LoopStage[] {
  switch (track) {
    case "quick":
      return ["engineer", "reviewer"];
    case "standard":
      return ["architect", "engineer", "reviewer"];
    case "full":
      return ["architect", "engineer", "reviewer", "wrap-up"];
    default: {
      const _exhaustive: never = track;
      return _exhaustive;
    }
  }
}

/**
 * The loop stages for the model's chosen track, intersected with the roles
 * actually present in the model. A stage whose performing role is absent (e.g.
 * a base with no Architect) is dropped, so the compiled chain never references a
 * role that was never emitted. Defaults to `standard` when no track is set.
 */
export function loopStagesForTrack(model: NeutralModel): LoopStage[] {
  const track = model.overlay.defaultTrack ?? "standard";
  const present = new Set(model.roles.map((r) => r.frontmatter.name));
  return stagesForTrack(track).filter((stage) => present.has(STAGE_ROLE[stage]));
}

/**
 * The skills that belong to a given track. A skill with no `tracks` declaration
 * is a general capability emitted on every track; one that lists tracks is
 * emitted only when the chosen track matches (e.g. `wrap-up` -> `full` only).
 */
export function skillsForTrack(skills: Skill[], track: CeremonyTrack): Skill[] {
  return skills.filter((s) => !s.frontmatter.tracks || s.frontmatter.tracks.includes(track));
}
