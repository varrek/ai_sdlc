import type { ProjectContext } from "../../src/core/project-context.js";
import type { SetupArtifacts } from "./corpus-harness.js";

/** First v2 host surface: Cursor guidance bundle used by the mock read-only agent. */
export type BehaviorEvalHost = "cursor";

export interface AgentGuidanceBundle {
  host: BehaviorEvalHost;
  constitution: string;
  architect: string;
  standardsIndex: string;
  projectContext: ProjectContext;
}

/** Read-only localization: where to change and which test command to run. */
export interface ReadOnlyLocalizationScenario {
  id: string;
  fixture: string;
  task: string;
  expectedModule: string;
  expectedTestCommand: string;
  moduleCandidates: string[];
  testCommandCandidates: string[];
}

export interface MockAgentDecision {
  selectedModule: string | null;
  selectedTestCommand: string | null;
  moduleScores: Record<string, number>;
  testCommandScores: Record<string, number>;
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
}

export const READ_ONLY_LOCALIZATION_SCENARIOS: ReadOnlyLocalizationScenario[] = [
  {
    id: "python-rags-localize-change",
    fixture: "python-rags",
    task: "I need to change application logic. Where is the primary product source, and which test command should I run before shipping?",
    expectedModule: "src",
    expectedTestCommand: "pytest",
    moduleCandidates: ["src", "tests"],
    testCommandCandidates: ["pytest", "python -m pytest", "make test", "npm test"],
  },
];

export function guidanceFromSetup(artifacts: SetupArtifacts): AgentGuidanceBundle {
  return {
    host: "cursor",
    constitution: artifacts.constitution,
    architect: artifacts.architect,
    standardsIndex: artifacts.standardsIndex,
    projectContext: artifacts.projectContext,
  };
}

function guidanceSurfaces(bundle: AgentGuidanceBundle): WeightedSurface[] {
  const mapText = bundle.projectContext.map
    .map((entry) => `${entry.path} ${entry.role}`)
    .join("\n");
  const packageText = bundle.projectContext.packages
    .map((pkg) => `${pkg.path} ${pkg.testCommand ?? ""}\n${pkg.instructionBody}`)
    .join("\n");
  return [
    { label: "architect", text: bundle.architect, moduleWeight: 4, commandWeight: 2 },
    { label: "constitution", text: bundle.constitution, moduleWeight: 3, commandWeight: 3 },
    { label: "standards", text: bundle.standardsIndex, moduleWeight: 2, commandWeight: 4 },
    { label: "map", text: mapText, moduleWeight: 5, commandWeight: 2 },
    { label: "packages", text: packageText, moduleWeight: 4, commandWeight: 5 },
  ];
}

function countWeightedMentions(text: string, token: string, weight: number): number {
  if (!text.includes(token)) return 0;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z0-9_./-])${escaped}([^A-Za-z0-9_./-]|$)`, "g");
  const matches = text.match(pattern);
  return (matches?.length ?? 0) * weight;
}

function scoreCandidates(
  surfaces: WeightedSurface[],
  candidates: string[],
  kind: "module" | "command",
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const candidate of candidates) {
    let total = 0;
    for (const surface of surfaces) {
      const weight = kind === "module" ? surface.moduleWeight : surface.commandWeight;
      total += countWeightedMentions(surface.text, candidate, weight);
    }
    scores[candidate] = total;
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

/**
 * Deterministic mock agent for read-only localization tasks. It does not call a
 * host LLM; it scores candidate modules and test commands from emitted guidance
 * surfaces the way a constrained read-only agent would before acting.
 */
export function extractMockLocalizationDecision(
  bundle: AgentGuidanceBundle,
  scenario: ReadOnlyLocalizationScenario,
): MockAgentDecision {
  const surfaces = guidanceSurfaces(bundle);
  const moduleScores = scoreCandidates(surfaces, scenario.moduleCandidates, "module");
  const testCommandScores = scoreCandidates(surfaces, scenario.testCommandCandidates, "command");
  return {
    selectedModule: pickBest(moduleScores, scenario.moduleCandidates),
    selectedTestCommand: pickBest(testCommandScores, scenario.testCommandCandidates),
    moduleScores,
    testCommandScores,
  };
}

function decisionPasses(
  decision: MockAgentDecision,
  scenario: ReadOnlyLocalizationScenario,
): boolean {
  return (
    decision.selectedModule === scenario.expectedModule &&
    decision.selectedTestCommand === scenario.expectedTestCommand
  );
}

export function evaluateReadOnlyLocalizationScenario(
  scenario: ReadOnlyLocalizationScenario,
  generic: AgentGuidanceBundle,
  personalized: AgentGuidanceBundle,
): BehaviorEvalV2Result {
  const genericDecision = extractMockLocalizationDecision(generic, scenario);
  const personalizedDecision = extractMockLocalizationDecision(personalized, scenario);
  const genericPass = decisionPasses(genericDecision, scenario);
  const personalizedPass = decisionPasses(personalizedDecision, scenario);
  const notes: string[] = [];
  if (!personalizedPass) {
    notes.push(
      `personalized selected module=${personalizedDecision.selectedModule ?? "none"} command=${personalizedDecision.selectedTestCommand ?? "none"}; expected ${scenario.expectedModule} + ${scenario.expectedTestCommand}`,
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
