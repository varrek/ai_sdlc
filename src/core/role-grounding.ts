import { assertRoleAddendumWithinContract } from "./role-addenda.js";
import type { AcceptedLearningEntry, AcceptedLearningKind } from "./accepted-learnings.js";
import type { ProjectContext } from "./project-context.js";
import type { Role } from "../schema/index.js";

const ARCHITECT_GROUNDING_HEADING = "## Deterministic project grounding";
const ACCEPTED_LEARNINGS_HEADING = "## Accepted project learnings";
const MAX_ARCHITECT_GROUNDING_CHARS = 1200;
const MAX_ACCEPTED_LEARNINGS_CHARS = 800;

const LEARNINGS_BY_ROLE: Record<string, AcceptedLearningKind[]> = {
  architect: ["architecture-demotion", "standard-added"],
  engineer: ["test-command", "standard-added"],
  tester: ["test-command"],
};

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

export function appendAcceptedLearnings(role: Role, entries: AcceptedLearningEntry[]): Role {
  const kinds = LEARNINGS_BY_ROLE[role.frontmatter.name];
  if (!kinds || entries.length === 0) return role;

  const relevant = entries.filter((entry) => kinds.includes(entry.kind));
  if (relevant.length === 0) return role;

  const lines = [
    "These accepted learnings were recorded during setup — prefer them over inference:",
    ...relevant.slice(0, 6).map((entry) => `- ${entry.claim}`),
  ];
  const block = lines.join("\n").slice(0, MAX_ACCEPTED_LEARNINGS_CHARS);
  assertRoleAddendumWithinContract(role.frontmatter.name, role.frontmatter.posture, block);
  return {
    ...role,
    body: `${role.body.trimEnd()}\n\n${ACCEPTED_LEARNINGS_HEADING}\n\n${block}\n`,
  };
}
