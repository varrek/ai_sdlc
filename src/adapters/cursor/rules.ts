import { stringify } from "yaml";
import {
  acceptedInstructionScopes,
  GENERATED_INSTRUCTION_MARKER,
  scopeApplyGlob,
  slugifyScopePath,
} from "../../core/project-context.js";
import type { EmittedFile, NeutralModel } from "../../core/types.js";

export function emitHierarchyRules(model: NeutralModel): EmittedFile[] {
  return acceptedInstructionScopes(model.projectContext).map((scope) => {
    const slug = slugifyScopePath(scope.path);
    const frontmatter = stringify(
      {
        description: `${scope.path} local ai-sdlc guidance`,
        globs: scopeApplyGlob(scope.path),
        alwaysApply: false,
      },
      { sortMapEntries: false },
    ).trim();
    return {
      path: `.cursor/rules/${slug}.mdc`,
      contents: [
        "---",
        frontmatter,
        "---",
        "",
        GENERATED_INSTRUCTION_MARKER,
        "",
        `# \`${scope.path}\` local guidance`,
        "",
        `Follow \`${scope.path}/AGENTS.md\` for the complete local instructions.`,
        "",
        `Role: ${scope.role}.`,
        "",
        "Evidence:",
        "",
        ...scope.sources.map((source) => `- \`${source}\``),
        "",
      ].join("\n"),
    };
  });
}
