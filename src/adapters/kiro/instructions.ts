import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { packageInstructionFiles } from "../shared/package-instructions.js";

/**
 * Kiro picks up root `AGENTS.md` as workspace steering. Nested `AGENTS.md`
 * remains useful for hosts and agents that scan downward through the repo.
 */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  return [
    { path: "AGENTS.md", contents: model.constitution },
    ...packageInstructionFiles(model, "AGENTS.md"),
  ];
}
