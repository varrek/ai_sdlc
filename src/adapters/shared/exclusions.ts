import { DEFAULT_EXCLUSIONS } from "../../core/project-context.js";
import type { NeutralModel } from "../../core/types.js";

/**
 * The directory names agents should not search/read, from the mined
 * ProjectContext when present, otherwise the static default. Sorted so emitted
 * host config (deny lists, ignore files) is byte-stable across runs.
 */
export function exclusionDirs(model: NeutralModel): string[] {
  const dirs = model.projectContext?.exclusions ?? DEFAULT_EXCLUSIONS;
  return [...dirs].sort();
}
