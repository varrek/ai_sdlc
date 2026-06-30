import type { ProjectContext } from "../../src/core/project-context.js";
import type { SetupArtifacts } from "./corpus-harness.js";

/** First v2 host surface: Cursor guidance bundle used by the mock read-only agent. */
export type BehaviorEvalHost = "cursor";

export interface AgentGuidanceBundle {
  host: BehaviorEvalHost;
  constitution: string;
  architect: string;
  engineer: string;
  tester: string;
  reviewer: string;
  debugger: string;
  standardsIndex: string;
  projectContext: ProjectContext;
}

export type BehaviorEvalScenarioKind = "localize" | "verify-lint" | "reproduce";

interface BehaviorEvalScenarioBase {
  id: string;
  fixture: string;
  kind: BehaviorEvalScenarioKind;
  task: string;
}

export interface LocalizeScenario extends BehaviorEvalScenarioBase {
  kind: "localize";
  expectedModule: string;
  expectedTestCommand: string;
  moduleCandidates: string[];
  testCommandCandidates: string[];
}

export interface VerifyLintScenario extends BehaviorEvalScenarioBase {
  kind: "verify-lint";
  expectedLint: string;
  lintCandidates: string[];
}

export interface ReproduceScenario extends BehaviorEvalScenarioBase {
  kind: "reproduce";
  expectedTestCommand: string;
  testCommandCandidates: string[];
}

export type BehaviorEvalScenario = LocalizeScenario | VerifyLintScenario | ReproduceScenario;

export interface MockAgentDecision {
  selectedModule: string | null;
  selectedTestCommand: string | null;
  selectedLint: string | null;
  moduleScores: Record<string, number>;
  testCommandScores: Record<string, number>;
  lintScores: Record<string, number>;
}

export interface BehaviorEvalV2Result {
  scenarioId: string;
  host: BehaviorEvalHost;
  task: string;
  generic: MockAgentDecision;
  personalized: MockAgentDecision;
  genericPass: boolean;
  personalizedPass: boolean;
  improvement: boolean;
  notes: string[];
}

interface WeightedSurface {
  label: string;
  text: string;
  moduleWeight: number;
  commandWeight: number;
  lintWeight: number;
}

export const BEHAVIOR_EVAL_V2_SCENARIOS: BehaviorEvalScenario[] = [
  {
    id: "python-rags-localize-change",
    kind: "localize",
    fixture: "python-rags",
    task: "I need to change application logic. Where is the primary product source, and which test command should I run before shipping?",
    expectedModule: "src",
    expectedTestCommand: "pytest",
    moduleCandidates: ["src", "tests"],
    testCommandCandidates: ["pytest", "python -m pytest", "make test", "npm test"],
  },
  {
    id: "go-app-localize-change",
    kind: "localize",
    fixture: "go-app",
    task: "Where should I edit Go application logic, and which test command validates the change?",
    expectedModule: "internal",
    expectedTestCommand: "go test ./...",
    moduleCandidates: ["internal", "pkg", "main.go"],
    testCommandCandidates: ["go test ./...", "go test", "make test", "npm test"],
  },
  {
    id: "rust-cargo-localize-change",
    kind: "localize",
    fixture: "rust-cargo",
    task: "Where is the Rust service source, and how do I run the test suite?",
    expectedModule: "src",
    expectedTestCommand: "cargo test",
    moduleCandidates: ["src", "tests", "benches"],
    testCommandCandidates: ["cargo test", "cargo nextest run", "make test"],
  },
  {
    id: "java-maven-localize-change",
    kind: "localize",
    fixture: "java-maven",
    task: "Which Java package should I change, and what Maven command runs tests?",
    expectedModule: "src/main/java/com/example/owner",
    expectedTestCommand: "mvn test",
    moduleCandidates: [
      "src/main/java/com/example/owner",
      "src/main/java/com/example/vet",
      "src/test/java",
    ],
    testCommandCandidates: ["mvn test", "./mvnw test", "gradle test", "npm test"],
  },
  {
    id: "go-app-verify-lint",
    kind: "verify-lint",
    fixture: "go-app",
    task: "Before approving this Go change, which linter should I confirm passed?",
    expectedLint: "golangci-lint",
    lintCandidates: ["golangci-lint", "eslint", "ruff", "rubocop"],
  },
  {
    id: "go-app-reproduce-failure",
    kind: "reproduce",
    fixture: "go-app",
    task: "A test failed in CI. What command should I run locally to reproduce (read-only)?",
    expectedTestCommand: "go test ./...",
    testCommandCandidates: ["go test ./...", "go test", "make test", "npm test"],
  },
];

/** @deprecated Use BEHAVIOR_EVAL_V2_SCENARIOS filtered by kind localize */
export const READ_ONLY_LOCALIZATION_SCENARIOS: LocalizeScenario[] = BEHAVIOR_EVAL_V2_SCENARIOS.filter(
  (scenario): scenario is LocalizeScenario => scenario.kind === "localize",
);

export function guidanceFromSetup(artifacts: SetupArtifacts): AgentGuidanceBundle {
  return {
    host: "cursor",
    constitution: artifacts.constitution,
    architect: artifacts.architect,
    engineer: artifacts.engineer,
    tester: artifacts.tester,
    reviewer: artifacts.reviewer,
    debugger: artifacts.debugger,
    standardsIndex: artifacts.standardsIndex,
    projectContext: artifacts.projectContext,
  };
}

function guidanceSurfaces(bundle: AgentGuidanceBundle, kind: BehaviorEvalScenarioKind): WeightedSurface[] {
  const mapText = bundle.projectContext.map
    .map((entry) => `${entry.path} ${entry.role}`)
    .join("\n");
  const hierarchyScopes =
    bundle.projectContext.instructionHierarchy?.scopes.filter((scope) => scope.accepted) ?? [];
  const hierarchyPaths = new Set(hierarchyScopes.map((scope) => scope.path));
  const packageText = bundle.projectContext.packages
    .filter((pkg) => !hierarchyPaths.has(pkg.path))
    .map((pkg) => `${pkg.path} ${pkg.testCommand ?? ""}\n${pkg.instructionBody}`)
    .join("\n");
  const hierarchyText = hierarchyScopes
    .map((scope) => `${scope.path} ${scope.role}\n${scope.instructionBody}`)
    .join("\n");
  const engineerBoost = kind === "localize" ? 1.5 : 1;
  const testerBoost = kind === "localize" || kind === "reproduce" ? 1.5 : 1;
  const reviewerBoost = kind === "verify-lint" ? 2 : 1;
  const debuggerBoost = kind === "reproduce" ? 2 : 1;
  return [
    { label: "architect", text: bundle.architect, moduleWeight: 6, commandWeight: 2, lintWeight: 1 },
    {
      label: "engineer",
      text: bundle.engineer,
      moduleWeight: 5 * engineerBoost,
      commandWeight: 3 * engineerBoost,
      lintWeight: 1,
    },
    {
      label: "tester",
      text: bundle.tester,
      moduleWeight: 0,
      commandWeight: 5 * testerBoost,
      lintWeight: 1,
    },
    {
      label: "reviewer",
      text: bundle.reviewer,
      moduleWeight: 1,
      commandWeight: 2,
      lintWeight: 5 * reviewerBoost,
    },
    {
      label: "debugger",
      text: bundle.debugger,
      moduleWeight: 0,
      commandWeight: 5 * debuggerBoost,
      lintWeight: 1,
    },
    { label: "constitution", text: bundle.constitution, moduleWeight: 3, commandWeight: 3, lintWeight: 2 },
    { label: "standards", text: bundle.standardsIndex, moduleWeight: 0, commandWeight: 4, lintWeight: 4 },
    { label: "map", text: mapText, moduleWeight: 8, commandWeight: 2, lintWeight: 1 },
    { label: "packages", text: packageText, moduleWeight: 4, commandWeight: 5, lintWeight: 1 },
    { label: "hierarchy", text: hierarchyText, moduleWeight: 5, commandWeight: 5, lintWeight: 1 },
  ];
}

function countWeightedMentions(text: string, token: string, weight: number): number {
  if (!text.includes(token)) return 0;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_./-])${escaped}($|[^A-Za-z0-9_/]|[.,;:!?)\\]}\\\`])`,
    "g",
  );
  const matches = text.match(pattern);
  return (matches?.length ?? 0) * weight;
}

function scoreCandidates(
  surfaces: WeightedSurface[],
  candidates: string[],
  kind: "module" | "command" | "lint",
  bundle?: AgentGuidanceBundle,
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const candidate of candidates) {
    let total = 0;
    for (const surface of surfaces) {
      const weight =
        kind === "module"
          ? surface.moduleWeight
          : kind === "command"
            ? surface.commandWeight
            : surface.lintWeight;
      total += countWeightedMentions(surface.text, candidate, weight);
    }
    scores[candidate] = total;
  }
  if (kind === "module" && bundle) {
    for (const entry of bundle.projectContext.map) {
      if (entry.path in scores) {
        scores[entry.path] = (scores[entry.path] ?? 0) + 25;
      }
    }
  }
  return scores;
}

function pickBest(scores: Record<string, number>, candidates: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scores[candidate] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore > 0 ? best : null;
}

export function extractMockDecision(
  bundle: AgentGuidanceBundle,
  scenario: BehaviorEvalScenario,
): MockAgentDecision {
  const surfaces = guidanceSurfaces(bundle, scenario.kind);
  const moduleCandidates =
    scenario.kind === "localize" ? scenario.moduleCandidates : [];
  const testCommandCandidates =
    scenario.kind === "localize"
      ? scenario.testCommandCandidates
      : scenario.kind === "reproduce"
        ? scenario.testCommandCandidates
        : [];
  const lintCandidates = scenario.kind === "verify-lint" ? scenario.lintCandidates : [];
  const moduleScores = scoreCandidates(surfaces, moduleCandidates, "module", bundle);
  const testCommandScores = scoreCandidates(surfaces, testCommandCandidates, "command");
  const lintScores = scoreCandidates(surfaces, lintCandidates, "lint");
  return {
    selectedModule: pickBest(moduleScores, moduleCandidates),
    selectedTestCommand: pickBest(testCommandScores, testCommandCandidates),
    selectedLint: pickBest(lintScores, lintCandidates),
    moduleScores,
    testCommandScores,
    lintScores,
  };
}

/** @deprecated Use extractMockDecision */
export function extractMockLocalizationDecision(
  bundle: AgentGuidanceBundle,
  scenario: LocalizeScenario,
): MockAgentDecision {
  return extractMockDecision(bundle, scenario);
}

function decisionPasses(decision: MockAgentDecision, scenario: BehaviorEvalScenario): boolean {
  switch (scenario.kind) {
    case "localize":
      return (
        decision.selectedModule === scenario.expectedModule &&
        decision.selectedTestCommand === scenario.expectedTestCommand
      );
    case "verify-lint":
      return decision.selectedLint === scenario.expectedLint;
    case "reproduce":
      return decision.selectedTestCommand === scenario.expectedTestCommand;
    default: {
      const neverScenario: never = scenario;
      return neverScenario;
    }
  }
}

export function evaluateBehaviorEvalScenario(
  scenario: BehaviorEvalScenario,
  generic: AgentGuidanceBundle,
  personalized: AgentGuidanceBundle,
): BehaviorEvalV2Result {
  const genericDecision = extractMockDecision(generic, scenario);
  const personalizedDecision = extractMockDecision(personalized, scenario);
  const genericPass = decisionPasses(genericDecision, scenario);
  const personalizedPass = decisionPasses(personalizedDecision, scenario);
  const notes: string[] = [];
  if (!personalizedPass) {
    notes.push(
      `personalized selected module=${personalizedDecision.selectedModule ?? "none"} command=${personalizedDecision.selectedTestCommand ?? "none"} lint=${personalizedDecision.selectedLint ?? "none"}`,
    );
  }
  if (genericPass) {
    notes.push("generic baseline unexpectedly matched personalized expectations");
  }
  return {
    scenarioId: scenario.id,
    host: "cursor",
    task: scenario.task,
    generic: genericDecision,
    personalized: personalizedDecision,
    genericPass,
    personalizedPass,
    improvement: personalizedPass && !genericPass,
    notes,
  };
}

/** @deprecated Use evaluateBehaviorEvalScenario */
export function evaluateReadOnlyLocalizationScenario(
  scenario: LocalizeScenario,
  generic: AgentGuidanceBundle,
  personalized: AgentGuidanceBundle,
): BehaviorEvalV2Result {
  return evaluateBehaviorEvalScenario(scenario, generic, personalized);
}
