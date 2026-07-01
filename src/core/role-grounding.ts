import type { Overlay, Role } from "../schema/index.js";
import {
  type AcceptedLearningEntry,
  type AcceptedLearningKind,
  filterAcceptedLearningsByKinds,
} from "./accepted-learnings.js";
import type { ProjectContext } from "./project-context.js";
import { assertRoleAddendumWithinContract } from "./role-addenda.js";

export const ROLE_GROUNDING_HEADING = "## Deterministic project grounding";
const MAX_ROLE_GROUNDING_CHARS = 1200;
const ACCEPTED_LEARNINGS_HEADING = "## Accepted project learnings";
const MAX_ACCEPTED_LEARNINGS_CHARS = 800;

export const LEARNINGS_BY_ROLE: Record<string, AcceptedLearningKind[]> = {
  architect: [
    "architecture-demotion",
    "standard-added",
    "bench-residual",
    "gate-approval",
    "compound-correction",
  ],
  engineer: [
    "test-command",
    "standard-added",
    "review-finding",
    "test-correction",
    "bench-residual",
    "gate-approval",
    "compound-correction",
  ],
  reviewer: [
    "review-finding",
    "bench-residual",
    "standard-added",
    "gate-approval",
    "compound-correction",
  ],
  tester: [
    "test-command",
    "test-correction",
    "bench-residual",
    "gate-approval",
    "compound-correction",
  ],
  debugger: ["bench-residual", "gate-approval", "compound-correction"],
};

export const SETUP_GROUNDING_LEARNINGS_BY_ROLE: Record<string, AcceptedLearningKind[]> = {
  architect: ["architecture-demotion", "standard-added"],
  engineer: [],
  reviewer: ["standard-added"],
  tester: ["test-command"],
};

const BARE_TEST_DIR_REMINDER =
  "Do not infer a test runner from bare `tests/`, `test/`, or `__tests__/` directories without toolchain evidence.";

const DEBUGGER_READ_ONLY_REMINDER =
  "Stay read-only while investigating — hand any fix to the Engineer.";

export interface RoleGroundingInput {
  overlay: Overlay;
  projectContext?: ProjectContext;
}

function overlayStandards(input: RoleGroundingInput): string[] {
  return input.overlay.standards ?? [];
}

function hasActionablePlanningStandards(standards: string[]): boolean {
  return standards.some(
    (statement) =>
      statement.includes("Run tests with") ||
      statement.startsWith("Lint/format with") ||
      statement.startsWith("Built with") ||
      statement.includes("Co-locate tests") ||
      statement.includes("Place tests under"),
  );
}

export function hasDeterministicArchitectGrounding(input: RoleGroundingInput): boolean {
  const map = input.projectContext?.map ?? [];
  if (map.length > 0) return true;
  return hasStandardsBasedArchitectSignals(input);
}

export function hasStandardsBasedArchitectSignals(input: RoleGroundingInput): boolean {
  const standards = overlayStandards(input);
  if (standards.length === 0) return false;
  return hasActionablePlanningStandards(standards);
}

export function hasDeterministicReviewerGrounding(input: RoleGroundingInput): boolean {
  const standards = overlayStandards(input);
  if (standards.some((statement) => statement.startsWith("Lint/format with"))) return true;
  if (standards.some((statement) => statement.includes("Project architecture:"))) return true;
  if (standards.some((statement) => statement.includes("confidence is low"))) return true;
  if (standards.some((statement) => statement.includes("CI runs"))) return true;
  return (input.projectContext?.map ?? []).length > 0;
}

export function hasDeterministicDebuggerGrounding(input: RoleGroundingInput): boolean {
  return hasDeterministicTesterGrounding(input);
}

export function hasDeterministicTesterGrounding(input: RoleGroundingInput): boolean {
  const rootCommand = input.overlay.interviewAnswers?.["test-command"]?.trim();
  if (rootCommand) return true;
  return (input.projectContext?.packages ?? []).some((pkg) => Boolean(pkg.testCommand?.trim()));
}

export function hasDeterministicEngineerGrounding(input: RoleGroundingInput): boolean {
  return Boolean(
    input.overlay.interviewAnswers?.["test-command"]?.trim() ||
      (input.projectContext?.map.length ?? 0) > 0 ||
      (input.projectContext?.packages ?? []).some((pkg) => Boolean(pkg.testCommand?.trim())),
  );
}

export function appendRoleGrounding(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name === "architect") {
    return appendArchitectGroundingFromInput(role, input);
  }
  if (role.frontmatter.name === "engineer") {
    return appendEngineerGrounding(role, input);
  }
  if (role.frontmatter.name === "tester") {
    return appendTesterGrounding(role, input);
  }
  if (role.frontmatter.name === "reviewer") {
    return appendReviewerGrounding(role, input);
  }
  if (role.frontmatter.name === "debugger") {
    return appendDebuggerGrounding(role, input);
  }
  return role;
}

/** @deprecated Use appendRoleGrounding — kept for direct unit tests of Architect map behavior. */
export function appendArchitectGrounding(
  role: Role,
  projectContext: ProjectContext | undefined,
): Role {
  if (role.frontmatter.name !== "architect" || !projectContext || projectContext.map.length === 0) {
    return role;
  }
  const lines = [
    "Use this mined, deterministic project map before proposing architecture changes:",
    ...projectContext.map.slice(0, 8).map((entry) => `- \`${entry.path}\` — ${entry.role}`),
  ];
  if (projectContext.map.length > 8) {
    lines.push(
      `- ${projectContext.map.length - 8} additional entries are available in the codebase map.`,
    );
  }
  return appendGroundingSection(role, lines.join("\n"));
}

function appendArchitectGroundingFromInput(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name !== "architect") return role;
  const projectContext = input.projectContext;
  if (projectContext && projectContext.map.length > 0) {
    const lines = [
      "Use this mined, deterministic project map before proposing architecture changes:",
      ...projectContext.map.slice(0, 8).map((entry) => `- \`${entry.path}\` — ${entry.role}`),
    ];
    if (projectContext.map.length > 8) {
      lines.push(
        `- ${projectContext.map.length - 8} additional entries are available in the codebase map.`,
      );
    }
    return appendGroundingSection(role, lines.join("\n"));
  }
  if (hasStandardsBasedArchitectSignals(input)) {
    return appendStandardsBasedArchitectGrounding(role, input);
  }
  return role;
}

function appendStandardsBasedArchitectGrounding(role: Role, input: RoleGroundingInput): Role {
  const standards = overlayStandards(input);
  const lines = [
    "No high-confidence codebase map is available. Use these mined planning signals (standards-based / low-confidence — not a module map):",
  ];
  for (const statement of standards.slice(0, 8)) {
    lines.push(`- ${statement}`);
  }
  if (standards.length > 8) {
    lines.push(
      `- ${standards.length - 8} additional standards are in the project standards index.`,
    );
  }
  lines.push("Do not invent module boundaries beyond these evidence-backed standards.");
  return appendGroundingSection(role, lines.join("\n"));
}

function appendReviewerGrounding(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name !== "reviewer" || !hasDeterministicReviewerGrounding(input)) {
    return role;
  }
  const lines = ["Use these mined review signals when checking a change:"];
  const standards = overlayStandards(input);
  for (const statement of standards) {
    if (
      statement.startsWith("Lint/format with") ||
      statement.includes("Project architecture:") ||
      statement.includes("confidence is low") ||
      statement.includes("CI runs") ||
      statement.includes("Run tests with")
    ) {
      lines.push(`- ${statement}`);
    }
  }
  const map = input.projectContext?.map ?? [];
  if (map.length > 0) {
    lines.push(
      "Boundary-sensitive modules from the codebase map:",
      ...map.slice(0, 6).map((entry) => `- \`${entry.path}\` — ${entry.role}`),
    );
  }
  return appendGroundingSection(role, lines.join("\n"));
}

function appendDebuggerGrounding(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name !== "debugger" || !hasDeterministicDebuggerGrounding(input)) {
    return role;
  }
  const lines = [
    "Use these evidence-backed commands when reproducing failures:",
    ...buildTesterGroundingLines(input).slice(1),
  ];
  if (overlayStandards(input).some((statement) => statement.includes("CI runs"))) {
    lines.push("- Check CI workflow logs and artifacts for the failing job output.");
  }
  lines.push(`- ${DEBUGGER_READ_ONLY_REMINDER}`);
  return appendGroundingSection(role, lines.join("\n"));
}

function appendEngineerGrounding(role: Role, input: RoleGroundingInput): Role {
  if (role.frontmatter.name !== "engineer" || !hasDeterministicEngineerGrounding(input)) {
    return role;
  }
  const lines = ["Use this mined context before editing:"];
  const map = input.projectContext?.map ?? [];
  if (map.length > 0) {
    lines.push(
      "Likely edit areas:",
      ...map.slice(0, 6).map((entry) => `- \`${entry.path}\` — ${entry.role}`),
    );
    if (map.length > 6)
      lines.push(`- ${map.length - 6} additional entries are available in the codebase map.`);
  }
  const rootCommand = input.overlay.interviewAnswers?.["test-command"]?.trim();
  if (rootCommand) lines.push(`Run relevant validation with \`${rootCommand}\`.`);
  const packageCommands = (input.projectContext?.packages ?? [])
    .filter((pkg) => pkg.testCommand?.trim())
    .slice(0, 4);
  for (const pkg of packageCommands) lines.push(`For \`${pkg.path}\`, use \`${pkg.testCommand}\`.`);
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
  const lines = ["Use these mined, evidence-backed test commands when verifying changes:"];
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
