import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentGuidanceBundle,
  BEHAVIOR_EVAL_V2_SCENARIOS,
  evaluateBehaviorEvalScenario,
  evaluateReadOnlyLocalizationScenario,
  guidanceFromSetup,
  type LocalizeScenario,
} from "./behavior-eval-v2.js";
import { cleanupCorpusTempDirs, copyFixture, runGenericSetup, runSetup } from "./corpus-harness.js";

afterEach(() => cleanupCorpusTempDirs());

describe("behavior eval v2 read-only scenarios", () => {
  it.each(
    BEHAVIOR_EVAL_V2_SCENARIOS.map((scenario) => [scenario.id, scenario] as const),
  )("%s improves personalized guidance over generic Cursor bundle", (scenarioId, scenario) => {
    const root = copyFixture(scenario.fixture);
    const generic = guidanceFromSetup(runGenericSetup(root));

    const personalizedRoot = copyFixture(scenario.fixture);
    const personalized = guidanceFromSetup(runSetup(personalizedRoot));

    const result = evaluateBehaviorEvalScenario(scenario, generic, personalized);

    expect(result.scenarioId).toBe(scenarioId);
    expect(result.host).toBe("cursor");
    expect(result.personalizedPass, result.notes.join("; ")).toBe(true);
    expect(result.genericPass).toBe(false);
    expect(result.improvement).toBe(true);
  });

  it("generic baseline lacks mined map and repo-specific standards", () => {
    const root = copyFixture("python-rags");
    const generic = guidanceFromSetup(runGenericSetup(root));

    expect(generic.projectContext.map).toEqual([]);
    expect(generic.standardsIndex).not.toContain("pytest");
    expect(generic.constitution).not.toContain("## Codebase map");
  });

  it("uses accepted hierarchy scope text as local guidance", () => {
    const scenario: LocalizeScenario = {
      id: "backend-scope-local-guidance",
      kind: "localize",
      fixture: "synthetic",
      task: "Change backend code and run its local tests.",
      expectedModule: "backend",
      expectedTestCommand: "pytest backend",
      moduleCandidates: ["backend", "frontend"],
      testCommandCandidates: ["pytest backend", "npm test"],
    };
    const generic = bundleWithHierarchy();
    const personalized = bundleWithHierarchy(
      "backend",
      "Backend service",
      "# `backend` — local package guidance\n\n- In `backend`, run tests with `pytest backend`.\n",
    );

    const result = evaluateReadOnlyLocalizationScenario(scenario, generic, personalized);

    expect(result.genericPass).toBe(false);
    expect(result.personalizedPass, result.notes.join("; ")).toBe(true);
    expect(result.personalized.selectedModule).toBe("backend");
    expect(result.personalized.selectedTestCommand).toBe("pytest backend");
  });
});

function bundleWithHierarchy(
  path?: string,
  role?: string,
  instructionBody?: string,
): AgentGuidanceBundle {
  return {
    host: "cursor",
    constitution: "# Root\n",
    architect: "",
    engineer: "",
    tester: "",
    reviewer: "",
    debugger: "",
    standardsIndex: "",
    projectContext: {
      packages: [],
      map: path && role ? [{ path, role, sources: [path] }] : [],
      exclusions: [],
      instructionHierarchy:
        path && role && instructionBody
          ? {
              version: 1,
              scopes: [
                {
                  path,
                  kind: "package",
                  role,
                  sources: [path],
                  instructionBody,
                  hostTargets: [`${path}/AGENTS.md`],
                  ownership: "generated",
                  accepted: true,
                },
              ],
            }
          : undefined,
    },
  };
}
