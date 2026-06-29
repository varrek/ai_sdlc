import { afterEach, describe, expect, it } from "vitest";
import {
  BEHAVIOR_SCENARIOS,
  evaluateBehaviorScenario,
  evaluateBehaviorScenarios,
} from "./behavior-eval.js";
import { cleanupCorpusTempDirs, copyFixture, runSetup } from "./corpus-harness.js";

afterEach(() => cleanupCorpusTempDirs());

describe("deterministic behavior-eval scaffold", () => {
  const fixtureNames = [...new Set(BEHAVIOR_SCENARIOS.map((scenario) => scenario.fixture))];

  it("scores pinned scenarios from generated guidance signals", () => {
    const artifactsByFixture = new Map(
      fixtureNames.map((fixture) => {
        const root = copyFixture(fixture);
        return [fixture, runSetup(root)] as const;
      }),
    );

    const results = evaluateBehaviorScenarios(artifactsByFixture);
    const failures = results.filter((result) => !result.pass);
    expect(failures, failures.map((f) => `${f.scenarioId}: ${f.missing.join("; ")}`).join("\n")).toEqual(
      [],
    );
  });

  it.each(BEHAVIOR_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s carries module and test-command signals",
    (scenarioId, scenario) => {
      const root = copyFixture(scenario.fixture);
      const artifacts = runSetup(root);
      const result = evaluateBehaviorScenario(artifacts, scenario);
      expect(result.pass, result.missing.join("; ")).toBe(true);
      expect(result.scenarioId).toBe(scenarioId);
    },
  );
});
