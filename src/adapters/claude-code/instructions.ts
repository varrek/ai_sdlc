import type { EmittedFile, NeutralModel } from "../../core/types.js";

/**
 * Claude Code reads `CLAUDE.md`. We emit `AGENTS.md` as the source of truth and
 * a thin `CLAUDE.md` that imports it (the `@AGENTS.md` import + appendix are
 * fully fleshed out in U3).
 */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  return [{ path: "AGENTS.md", contents: model.constitution }];
}
