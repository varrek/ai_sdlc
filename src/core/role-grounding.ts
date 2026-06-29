import { assertRoleAddendumWithinContract } from "./role-addenda.js";
import {
  filterAcceptedLearningsByKinds,
  type AcceptedLearningEntry,
  type AcceptedLearningKind,
} from "./accepted-learnings.js";
import type { ProjectContext } from "./project-context.js";
import type { Overlay, Role } from "../schema/index.js";

export const ROLE_GROUNDING_HEADING = "## Deterministic project grounding";
const MAX_ROLE_GROUNDING_CHARS = 1200;
const ACCEPTED_LEARNINGS_HEADING = "## Accepted project learnings";
const MAX_ACCEPTED_LEARNINGS_CHARS = 800;

export const LEARNINGS_BY_ROLE: Record<string, AcceptedLearningKind[]> = {
  architect: ["architecture-demotion", "standard-added", "bench-residual"],
  engineer: ["test-command", "standard-added", "review-finding", "test-correction", "bench-residual"],
  reviewer: ["review-finding", "bench-residual", "standard-added"],
  tester: ["test-command", "test-correction", "bench-residual"],
};

export const SETUP_GROUNDING_LEARNINGS_BY_ROLE: Record<string, AcceptedLearningKind[]> = {
  architect: ["architecture-demotion", "standard-added"],
  engineer: ["test-command", "standard-added"],
  reviewer: ["standard-added"],
  tester: ["test-command"],
};

const BARE_TEST_DIR_REMINDER =
  "Do not infer a test runner from bare `tests/`, `test/`, or `__tests__/` directories without toolchain evidence.";

export interface RoleGroundingInput {
  overlay: Overlay;
  projectContext?: ProjectContext;
}

export function hasDeterministicTesterGrounding(input: RoleGroundingInput): boolean {
  const rootCommand = input.overlay.interviewAnswers?.["test-command"]?.trim();
  if (rootCommand) return true;
  return (input.projectContext?.packages ?? []).some((pkg) => Boolean(pkg.testCommand?.trim()));
}

export function hasDeterministicEngineerGrounding(input: RoleGroundingInput): boolean {
  return Boolean(input.projectContext && input.projectContext.map.length > 0);
}

export function appendRoleGrounding(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name === "architect") {
    return appendArchitectGrounding(role, input.projectContext);
  }
  if (role.frontmatter.name === "engineer") {
    return appendEngineerGrounding(role, input);
  }
  if (role.frontmatter.name === "tester") {
    return appendTesterGrounding(role, input);
  }
  return role;
}

/** @deprecated Use appendRoleGrounding — kept for direct unit tests of Architect behavior. */
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
  return appendGroundingSection(role, lines.join("\n"));
}

function appendEngineerGrounding(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name !== "engineer" || !hasDeterministicEngineerGrounding(input)) {
    return role;
  }
  const lines = ["Use these mined signals before editing:"];
  const editAreas = input.projectContext?.map.slice(0, 6) ?? [];
  if (editAreas.length > 0) {
    lines.push("- **Likely edit areas:**");
    lines.push(...editAreas.map((entry) => `  - \`${entry.path}\` — ${entry.role}`));
  }
  const rootCommand = input.overlay.interviewAnswers?.["test-command"]?.trim();
  if (rootCommand) {
    lines.push(`- **Verification command:** \`${rootCommand}\``);
  }
  return appendGroundingSection(role, lines.join("\n"));
}

function appendTesterGrounding(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name !== "tester" || !hasDeterministicTesterGrounding(input)) {
    return role;
  }
  const lines = buildTesterGroundingLines(input);
  return appendGroundingSection(role, lines.join("\n"));
}

function buildTesterGroundingLines(input: RoleGroundingInput): string[] {
  const lines = [
    "Use these mined, evidence-backed test commands when verifying changes:",
  ];
  const rootCommand = input.overlay.interviewAnswers?.["test-command"]?.trim();
  if (rootCommand) {
    const provenance = input.overlay.gapClosureProvenance?.["test-command"];
    const provenanceSuffix =
      provenance === "miner" || provenance === "ci" ? ` (provenance: ${provenance})` : "";
    lines.push(`- **Root:** \`${rootCommand}\`${provenanceSuffix}`);
  }
  for (const pkg of input.projectContext?.packages ?? []) {
    const command = pkg.testCommand?.trim();
    if (!command) continue;
    lines.push(`- **\`${pkg.path}\`:** \`${command}\``);
  }
  lines.push(`- ${BARE_TEST_DIR_REMINDER}`);
  return lines;
}

function appendGroundingSection(role: Role, grounding: string): Role {
  const bounded = grounding.slice(0, MAX_ROLE_GROUNDING_CHARS);
  assertRoleAddendumWithinContract(role.frontmatter.name, role.frontmatter.posture, bounded);
  return {
    ...role,
    body: `${role.body.trimEnd()}\n\n${ROLE_GROUNDING_HEADING}\n\n${bounded}\n`,
  };
}

export function appendAcceptedLearnings(role: Role, entries: AcceptedLearningEntry[]): Role {
  const kinds = LEARNINGS_BY_ROLE[role.frontmatter.name];
  if (!kinds || entries.length === 0) return role;

  const relevant = filterAcceptedLearningsByKinds(entries, kinds);
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
