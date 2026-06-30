import { stringify } from "yaml";
import {
  acceptedInstructionScopes,
  scopeApplyGlob,
  slugifyScopePath,
} from "../../core/project-context.js";
import type { EmittedFile, NeutralModel } from "../../core/types.js";

/**
 * Scoped instruction files for hosts that read nested instruction files by name
 * (Claude `CLAUDE.md`, Cursor/Codex `AGENTS.md`). Backward-compatible export
 * name; emission is driven by accepted hierarchy scopes when present.
 */
export function packageInstructionFiles(model: NeutralModel, fileName: string): EmittedFile[] {
  return instructionScopeFiles(model, fileName);
}

export function instructionScopeFiles(model: NeutralModel, fileName: string): EmittedFile[] {
  return acceptedInstructionScopes(model.projectContext).map((scope) => ({
    path: `${scope.path}/${fileName}`,
    contents: scope.instructionBody,
  }));
}

/**
 * Scoped instruction files for Copilot, which scopes instructions via a
 * frontmatter `applyTo` glob in `.github/instructions/<slug>.instructions.md`
 * rather than nested files. The scope path is slugified for a flat filename.
 */
export function copilotPackageInstructionFiles(model: NeutralModel): EmittedFile[] {
  return copilotInstructionScopeFiles(model);
}

export function copilotInstructionScopeFiles(model: NeutralModel): EmittedFile[] {
  return acceptedInstructionScopes(model.projectContext).map((scope) => {
    const slug = slugifyScopePath(scope.path);
    const frontmatter = stringify(
      { applyTo: scopeApplyGlob(scope.path) },
      {
        sortMapEntries: false,
      },
    ).trim();
    return {
      path: `.github/instructions/${slug}.instructions.md`,
      contents: `---\n${frontmatter}\n---\n\n${scope.instructionBody}`,
    };
  });
}
