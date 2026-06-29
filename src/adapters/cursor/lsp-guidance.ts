import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { LSP_GUIDANCE_PATH, renderLspGuidance } from "../../core/lsp-guidance.js";

export function emitLspGuidance(model: NeutralModel): EmittedFile {
  return {
    path: LSP_GUIDANCE_PATH,
    contents: renderLspGuidance(model.projectContext),
  };
}
