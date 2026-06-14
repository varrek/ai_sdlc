import { assertRoleAddendumWithinContract } from "./role-addenda.js";
import type { ProjectContext } from "./project-context.js";
import type { Role } from "../schema/index.js";

const ARCHITECT_GROUNDING_HEADING = "## Deterministic project grounding";
const MAX_ARCHITECT_GROUNDING_CHARS = 1200;

export function appendArchitectGrounding(role: Role, projectContext: ProjectContext | undefined): Role {
  if (role.frontmatter.name !== "architect" || !projectContext || projectContext.map.length === 0) {
    return role;
  }
  const lines = [
    "Use this mined, deterministic project map before proposing architecture changes:",
    ...projectContext.map.slice(0, 8).map((entry) => `- \`${entry.path}\` — ${entry.role}`),
  ];
  if (projectContext.map.length > 8) {
    lines.push(`- ${projectContext.map.length - 8} additional entries are available in the codebase map.`);
  }
  const grounding = lines.join("\n").slice(0, MAX_ARCHITECT_GROUNDING_CHARS);
  assertRoleAddendumWithinContract(role.frontmatter.name, role.frontmatter.posture, grounding);
  return {
    ...role,
    body: `${role.body.trimEnd()}\n\n${ARCHITECT_GROUNDING_HEADING}\n\n${grounding}\n`,
  };
}
