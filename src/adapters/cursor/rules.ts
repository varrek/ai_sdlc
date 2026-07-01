import { stringify } from "yaml";
import {
  acceptedInstructionScopes,
  scopeApplyGlob,
  slugifyScopePath,
} from "../../core/project-context.js";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { renderHierarchyPointerMarkdown } from "../shared/hierarchy-pointer.js";

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
      contents: ["---", frontmatter, "---", "", renderHierarchyPointerMarkdown(scope)].join("\n"),
    };
  });
}
