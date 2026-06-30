import { GENERATED_INSTRUCTION_MARKER, type InstructionScope } from "../../core/project-context.js";

/** Shared body for host-native scoped pointers back to local AGENTS.md files. */
export function renderHierarchyPointerMarkdown(scope: InstructionScope): string {
  return [
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
  ].join("\n");
}
