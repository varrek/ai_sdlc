import type { EmittedFile, NeutralModel } from "../../core/types.js";

/** Cursor reads `AGENTS.md` natively, so the constitution passes through unchanged. */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  return [{ path: "AGENTS.md", contents: model.constitution }];
}
