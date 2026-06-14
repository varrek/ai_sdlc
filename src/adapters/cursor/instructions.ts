import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { packageInstructionFiles } from "../shared/package-instructions.js";

/**
 * Cursor reads `AGENTS.md` natively, so the root constitution passes through
 * unchanged. In a workspace, each package also gets a nested `AGENTS.md` Cursor
 * picks up when working inside that directory.
 */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  return [
    { path: "AGENTS.md", contents: model.constitution },
    ...packageInstructionFiles(model, "AGENTS.md"),
  ];
}
