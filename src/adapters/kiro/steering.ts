import { stringify } from "yaml";
import {
  acceptedInstructionScopes,
  scopeApplyGlob,
  slugifyScopePath,
} from "../../core/project-context.js";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { renderHierarchyPointerMarkdown } from "../shared/hierarchy-pointer.js";

/** Kiro-native scoped steering mirrors Cursor's file-match rule behavior. */
export function emitSteering(model: NeutralModel): EmittedFile[] {
  return acceptedInstructionScopes(model.projectContext).map((scope) => {
    const slug = slugifyScopePath(scope.path);
    const frontmatter = stringify(
      {
        inclusion: "fileMatch",
        fileMatchPattern: scopeApplyGlob(scope.path),
      },
      { sortMapEntries: false },
    ).trim();
    return {
      path: `.kiro/steering/${slug}.md`,
      contents: [
        "---",
        frontmatter,
        "---",
        "",
        renderHierarchyPointerMarkdown(scope),
      ].join("\n"),
    };
  });
}
