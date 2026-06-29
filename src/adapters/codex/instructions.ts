import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { packageInstructionFiles } from "../shared/package-instructions.js";

/**
 * Codex discovers `AGENTS.md` from the repo root downward, so the constitution
 * passes through unchanged. Per-package standards use the same nested `AGENTS.md`
 * files Cursor emits.
 */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  return [
    { path: "AGENTS.md", contents: model.constitution },
    ...packageInstructionFiles(model, "AGENTS.md"),
  ];
}
