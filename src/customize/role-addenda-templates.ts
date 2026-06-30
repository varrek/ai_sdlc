import { assertRoleAddendumWithinContract } from "../core/role-addenda.js";
import type { ProjectContext } from "../core/project-context.js";
import {
  hasDeterministicArchitectGrounding,
  hasDeterministicDebuggerGrounding,
  hasDeterministicEngineerGrounding,
  hasDeterministicReviewerGrounding,
  hasDeterministicTesterGrounding,
} from "../core/role-grounding.js";
import type { ToolPosture } from "../schema/index.js";
import type { RepoProfile } from "./repo-miner.js";

type RoleName = "architect" | "engineer" | "tester" | "reviewer" | "debugger";

const ROLE_POSTURES: Record<RoleName, ToolPosture> = {
  architect: "read-only",
  engineer: "write",
  tester: "read-run",
  reviewer: "read-only",
  debugger: "read-only",
};

/**
 * Evidence-backed, workflow-oriented addenda for deterministic customize. Facts
 * already surfaced in deterministic grounding (commands, map paths, linter
 * names) stay out — addenda carry conventions and role posture only.
 */
export function buildTemplateRoleAddenda(
  profile: RepoProfile,
  projectContext: ProjectContext,
  answers: Record<string, string> = {},
  gapClosureProvenance: Record<string, "miner" | "ci" | "interview" | "unknown"> = {},
): Partial<Record<RoleName, string>> {
  const groundingInput = {
    overlay: {
      version: 1 as const,
      standards: buildStandardsStatements(profile),
      interviewAnswers: answers,
      gapClosureProvenance,
    },
    projectContext,
  };

  const candidates: Partial<Record<RoleName, string | undefined>> = {
    engineer: engineerAddendum(profile, groundingInput),
    tester: testerAddendum(profile, groundingInput),
    architect: architectAddendum(profile, groundingInput),
    reviewer: reviewerAddendum(profile, groundingInput),
    debugger: debuggerAddendum(profile, groundingInput),
  };

  const addenda: Partial<Record<RoleName, string>> = {};
  for (const role of Object.keys(candidates) as RoleName[]) {
    const text = candidates[role]?.trim();
    if (!text) continue;
    assertRoleAddendumWithinContract(role, ROLE_POSTURES[role], text);
    addenda[role] = text;
  }
  return addenda;
}

function buildStandardsStatements(profile: RepoProfile): string[] {
  const statements: string[] = [];
  if (profile.testRunner || profile.testCommand) {
    const how = profile.testCommand ?? profile.testRunner!;
    statements.push(`Run tests with ${how}; the test suite must pass before a change ships.`);
  }
  for (const linter of profile.linters) {
    statements.push(`Lint/format with ${linter}.`);
  }
  for (const fw of profile.frameworks) {
    statements.push(`Built with ${fw}; follow its conventions.`);
  }
  if (profile.ciFiles.length > 0) statements.push("CI runs on every change.");
  if (profile.architecture?.confidence === "high") {
    const moduleList = profile.architecture.modules.map((m) => `\`${m}\``).join(", ");
    statements.push(`Project architecture: modules ${moduleList} under the repo source tree.`);
  } else if (profile.architecture?.confidence === "low") {
    statements.push(
      `Project architecture confidence is low; do not treat any single directory as authoritative.`,
    );
  }
  if (profile.conventions?.testLayout === "co-located") {
    statements.push("Co-locate tests with the code they cover (e.g. `*.test.*`).");
  } else if (profile.conventions?.testLayout === "separate") {
    statements.push("Place tests under a dedicated `tests/` directory.");
  }
  return statements;
}

function engineerAddendum(
  profile: RepoProfile,
  input: Parameters<typeof hasDeterministicEngineerGrounding>[0],
): string | undefined {
  if (!hasDeterministicEngineerGrounding(input)) return undefined;
  if (!hasStackConfidence(profile)) return undefined;

  const lines = [
    "When implementing changes, follow patterns in neighboring modules before introducing new abstractions.",
  ];
  if (profile.packages && profile.packages.length > 1) {
    lines.push(
      "In a workspace repo, keep edits scoped to the package you are changing and respect its local conventions.",
    );
  }
  if (profile.conventions?.commits === "conventional") {
    lines.push("Write commit messages in the same Conventional Commits style as recent history.");
  }
  return lines.join(" ");
}

function testerAddendum(
  profile: RepoProfile,
  input: Parameters<typeof hasDeterministicTesterGrounding>[0],
): string | undefined {
  if (!hasDeterministicTesterGrounding(input)) return undefined;

  if (profile.conventions?.testLayout === "co-located") {
    return "Add or extend tests beside the source they cover, matching existing co-located test file naming.";
  }
  if (profile.conventions?.testLayout === "separate") {
    return "Place new tests under the dedicated test tree, mirroring the module structure of the code under test.";
  }
  if (profile.testRunner || profile.testCommand) {
    return "Mirror the repo's existing test file placement and naming when adding or extending coverage.";
  }
  return undefined;
}

function architectAddendum(
  profile: RepoProfile,
  input: Parameters<typeof hasDeterministicArchitectGrounding>[0],
): string | undefined {
  if (!hasDeterministicArchitectGrounding(input)) return undefined;

  const map = input.projectContext?.map ?? [];
  if (map.length > 0) {
    return "Anchor plans to the mined module map; propose incremental changes that respect existing package boundaries before suggesting new top-level modules.";
  }
  if (profile.architecture?.confidence === "low" || hasStandardsOnlyArchitect(profile)) {
    return "Treat module boundaries as uncertain; base planning on evidenced standards rather than inventing directory trees.";
  }
  return undefined;
}

function reviewerAddendum(
  _profile: RepoProfile,
  input: Parameters<typeof hasDeterministicReviewerGrounding>[0],
): string | undefined {
  if (!hasDeterministicReviewerGrounding(input)) return undefined;
  return "Prioritize correctness and boundary impact: trace data-flow and error-handling changes, and flag edits that widen public surfaces without accompanying tests.";
}

function debuggerAddendum(
  _profile: RepoProfile,
  input: Parameters<typeof hasDeterministicDebuggerGrounding>[0],
): string | undefined {
  if (!hasDeterministicDebuggerGrounding(input)) return undefined;
  return "Collect reproduction steps, full stderr/stdout, and environment context before escalating; confirm failures locally without modifying source files.";
}

function hasStackConfidence(profile: RepoProfile): boolean {
  return (
    profile.languages.length > 0 ||
    profile.frameworks.length > 0 ||
    Boolean(profile.testRunner || profile.testCommand) ||
    (profile.architecture?.confidence === "high" && profile.architecture.modules.length > 0)
  );
}

function hasStandardsOnlyArchitect(profile: RepoProfile): boolean {
  return (
    profile.testRunner !== undefined ||
    profile.testCommand !== undefined ||
    profile.linters.length > 0 ||
    profile.frameworks.length > 0 ||
    profile.ciFiles.length > 0
  );
}
