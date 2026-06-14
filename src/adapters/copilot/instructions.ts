import type { EmittedFile, NeutralModel } from "../../core/types.js";

/**
 * Copilot reads `AGENTS.md` and also a `.github/copilot-instructions.md`. We
 * emit the constitution as `AGENTS.md`; the dedicated excerpt is added in U3.
 */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  return [{ path: "AGENTS.md", contents: model.constitution }];
}
