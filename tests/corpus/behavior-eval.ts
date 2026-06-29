import type { SetupArtifacts } from "./corpus-harness.js";

/** Surfaces where generated guidance should carry actionable agent signals. */
export type GuidanceSurface = "constitution" | "architect" | "tester" | "standards" | "map" | "packages";

export interface BehaviorScenario {
  id: string;
  fixture: string;
  task: string;
  /** Repo-relative module or package an agent should prefer for this task. */
  preferredModule: string;
  /** Runnable test command an agent should choose. */
  preferredTestCommand: string;
  /** Paths that must not appear as primary guidance for this scenario. */
  avoidPaths?: string[];
  /** Which artifact surfaces must cite the preferred signals. */
  requiredSurfaces: GuidanceSurface[];
}

export interface BehaviorSignalResult {
  surface: GuidanceSurface;
  modulePresent: boolean;
  commandPresent: boolean;
  avoidedPathsClean: boolean;
}

export interface BehaviorEvalResult {
  scenarioId: string;
  pass: boolean;
  signals: BehaviorSignalResult[];
  missing: string[];
}

export const BEHAVIOR_SCENARIOS: BehaviorScenario[] = [
  {
    id: "python-rags-run-tests",
    fixture: "python-rags",
    task: "Run the project test suite before shipping a change to application code.",
    preferredModule: "src",
    preferredTestCommand: "pytest",
    requiredSurfaces: ["constitution", "standards", "map", "tester"],
  },
  {
    id: "ts-app-run-tests",
    fixture: "ts-app",
    task: "Run tests for the TypeScript application source.",
    preferredModule: "src",
    preferredTestCommand: "vitest run",
    requiredSurfaces: ["constitution", "standards", "map", "tester"],
  },
  {
    id: "monorepo-api-tests",
    fixture: "monorepo",
    task: "Change the Python API package and run its tests.",
    preferredModule: "packages/api",
    preferredTestCommand: "pytest",
    requiredSurfaces: ["architect", "standards", "packages", "tester"],
  },
  {
    id: "monorepo-web-tests",
    fixture: "monorepo",
    task: "Change the web frontend package and run its tests.",
    preferredModule: "packages/web",
    preferredTestCommand: "vitest run",
    requiredSurfaces: ["architect", "standards", "packages", "tester"],
  },
  {
    id: "ci-repo-npm-test",
    fixture: "ci-repo",
    task: "Run the CI-equivalent test command locally.",
    preferredModule: "",
    preferredTestCommand: "npm test",
    requiredSurfaces: ["constitution", "standards", "tester"],
  },
  {
    id: "fastapi-like-product-root",
    fixture: "fastapi-like",
    task: "Navigate to the primary FastAPI product source, not tutorial docs.",
    preferredModule: "fastapi",
    preferredTestCommand: "pytest",
    avoidPaths: ["docs_src"],
    requiredSurfaces: ["architect", "map", "constitution"],
  },
  {
    id: "vite-like-product-root",
    fixture: "vite-like",
    task: "Work in the primary Vite package, not playground demos.",
    preferredModule: "packages/vite",
    preferredTestCommand: "vitest run",
    avoidPaths: ["playground"],
    requiredSurfaces: ["architect", "map", "constitution"],
  },
];

function surfaceRequiresTestCommand(surface: GuidanceSurface): boolean {
  return (
    surface === "constitution" ||
    surface === "standards" ||
    surface === "packages" ||
    surface === "tester"
  );
}

function surfaceRequiresModule(surface: GuidanceSurface): boolean {
  return surface !== "tester";
}

function surfaceText(artifacts: SetupArtifacts, surface: GuidanceSurface): string {
  switch (surface) {
    case "constitution":
      return artifacts.constitution;
    case "architect":
      return artifacts.architect;
    case "tester":
      return artifacts.tester;
    case "standards":
      return artifacts.standardsIndex;
    case "map":
      return artifacts.projectContext.map.map((entry) => `${entry.path} ${entry.role}`).join("\n");
    case "packages":
      return artifacts.projectContext.packages
        .map((pkg) => `${pkg.path} ${pkg.testCommand ?? ""}\n${pkg.instructionBody}`)
        .join("\n");
    default: {
      const _exhaustive: never = surface;
      return _exhaustive;
    }
  }
}

function scoreSurface(
  artifacts: SetupArtifacts,
  scenario: BehaviorScenario,
  surface: GuidanceSurface,
): BehaviorSignalResult {
  const text = surfaceText(artifacts, surface);
  const moduleRequired = surfaceRequiresModule(surface);
  const modulePresent =
    !moduleRequired || scenario.preferredModule === "" || text.includes(scenario.preferredModule);
  const commandRequired = surfaceRequiresTestCommand(surface);
  const commandPresent = !commandRequired || text.includes(scenario.preferredTestCommand);
  const avoidOnSurface = surface === "architect" || surface === "map";
  const avoidedPathsClean =
    !avoidOnSurface || scenario.avoidPaths?.every((path) => !text.includes(path)) !== false;
  return { surface, modulePresent, commandPresent, avoidedPathsClean };
}

/**
 * Deterministic v1 behavior eval: score whether generated guidance artifacts
 * carry the module and test-command signals a pinned scenario expects. This
 * does not invoke a host LLM; it validates the preconditions for useful agent
 * behavior on corpus fixtures.
 */
export function evaluateBehaviorScenario(
  artifacts: SetupArtifacts,
  scenario: BehaviorScenario,
): BehaviorEvalResult {
  const signals = scenario.requiredSurfaces.map((surface) =>
    scoreSurface(artifacts, scenario, surface),
  );
  const missing: string[] = [];
  for (const signal of signals) {
    if (surfaceRequiresModule(signal.surface) && scenario.preferredModule && !signal.modulePresent) {
      missing.push(`${signal.surface}: missing module \`${scenario.preferredModule}\``);
    }
    if (surfaceRequiresTestCommand(signal.surface) && !signal.commandPresent) {
      missing.push(`${signal.surface}: missing test command \`${scenario.preferredTestCommand}\``);
    }
    if (!signal.avoidedPathsClean && scenario.avoidPaths) {
      missing.push(`${signal.surface}: mentions avoided path(s) ${scenario.avoidPaths.join(", ")}`);
    }
  }
  const pass = missing.length === 0;
  return { scenarioId: scenario.id, pass, signals, missing };
}

export function evaluateBehaviorScenarios(
  artifactsByFixture: Map<string, SetupArtifacts>,
): BehaviorEvalResult[] {
  return BEHAVIOR_SCENARIOS.map((scenario) => {
    const artifacts = artifactsByFixture.get(scenario.fixture);
    if (!artifacts) {
      return {
        scenarioId: scenario.id,
        pass: false,
        signals: [],
        missing: [`fixture ${scenario.fixture} not loaded`],
      };
    }
    return evaluateBehaviorScenario(artifacts, scenario);
  });
}
