import { afterEach, describe, expect, it } from "vitest";
import {
  LOOP_BEHAVIOR_SCENARIOS,
  LOOP_HANDBACK_SCENARIOS,
  LOOP_ROLE_CHOICE_SCENARIOS,
  evaluateHandbackScenario,
  evaluateLoopBehaviorScenario,
  evaluateRoleChoiceScenario,
  testerFailureHandbackTrace,
} from "./loop-behavior-eval.js";
import { guidanceFromSetup } from "./behavior-eval-v2.js";
import { cleanupCorpusTempDirs, copyFixture, runSetup } from "./corpus-harness.js";
import { scoreLoopTrace } from "../../src/eval/loop-score.js";

afterEach(() => cleanupCorpusTempDirs());

describe("loop behavior eval synthetic traces", () => {
  it.each(LOOP_BEHAVIOR_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s passes with valid trace",
    (scenarioId, scenario) => {
      const result = evaluateLoopBehaviorScenario(scenario);
      expect(result.scenarioId).toBe(scenarioId);
      expect(result.score.passed).toBe(true);
      expect(result.score.violations).toEqual([]);
    },
  );

  it("tester failure handback trace requires engineer rework", () => {
    const trace = testerFailureHandbackTrace();
    const score = scoreLoopTrace(trace, {
      stages: ["architect", "engineer", "test", "reviewer"],
    });
    expect(score.passed).toBe(true);
    expect(score.metrics.replanCount).toBe(1);
    expect(score.violations).toEqual([]);
  });
});

describe("loop role-choice eval with guidance bundles", () => {
  it.each(LOOP_ROLE_CHOICE_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s selects correct role from guidance bundle",
    (scenarioId, scenario) => {
      const root = copyFixture("python-rags");
      const artifacts = runSetup(root);
      const bundle = guidanceFromSetup(artifacts);

      const result = evaluateRoleChoiceScenario(scenario, bundle);

      expect(result.scenarioId).toBe(scenarioId);
      expect(result.pass, `Expected ${result.expected} but got ${result.selected}`).toBe(true);
      expect(result.selected).toBe(scenario.expectedRole);
    },
  );
});

describe("loop evaluator handback eval with guidance bundles", () => {
  it.each(LOOP_HANDBACK_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s selects correct handback role from guidance",
    (scenarioId, scenario) => {
      const root = copyFixture("python-rags");
      const artifacts = runSetup(root);
      const bundle = guidanceFromSetup(artifacts);

      const result = evaluateHandbackScenario(scenario, bundle);

      expect(result.scenarioId).toBe(scenarioId);
      expect(result.pass, `Expected ${result.expected} but got ${result.selected}`).toBe(true);
      expect(result.selected).toBe(scenario.expectedHandbackRole);
    },
  );
});
