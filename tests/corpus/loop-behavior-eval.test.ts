import { describe, expect, it } from "vitest";
import {
  evaluateLoopBehaviorScenario,
  LOOP_BEHAVIOR_SCENARIOS,
  LOOP_ROLE_CHOICE_SCENARIOS,
  selectLoopRoleForTask,
  syntheticPassingTrace,
  testerFailureHandbackTrace,
} from "./loop-behavior-eval.js";
import { scoreLoopTrace } from "../../src/eval/loop-score.js";

describe("loop behavior eval", () => {
  it("passes the pinned quick, standard, and full synthetic scenarios", () => {
    const results = LOOP_BEHAVIOR_SCENARIOS.map(evaluateLoopBehaviorScenario);

    expect(results.map((result) => result.score.passed)).toEqual([true, true, true]);
    expect(results[0]?.score.metrics.expectedStages).toBe(2);
    expect(results[1]?.score.metrics.expectedStages).toBe(4);
    expect(results[2]?.score.metrics.expectedStages).toBe(5);
  });

  it("detects when standard-track review happens without tester verification", () => {
    const trace = syntheticPassingTrace(["architect", "engineer", "reviewer"]);

    const score = scoreLoopTrace(trace, {
      stages: ["architect", "engineer", "test", "reviewer"],
      approvalBeforeStages: ["reviewer"],
    });

    expect(score.passed).toBe(false);
    expect(score.violations).toContainEqual(expect.objectContaining({ kind: "missing-stage", stage: "test" }));
    expect(score.violations).not.toContainEqual(expect.objectContaining({ kind: "tester-before-reviewer" }));
  });

  it("selects the right loop role for pinned decision prompts", () => {
    for (const scenario of LOOP_ROLE_CHOICE_SCENARIOS) {
      expect(selectLoopRoleForTask(scenario.task)).toBe(scenario.expectedRole);
    }
    expect(selectLoopRoleForTask("Who should debug the review failure?")).toBe("debugger");
  });

  it("accepts a Tester failure only when it hands back to Engineer before done", () => {
    const handbackScore = scoreLoopTrace(testerFailureHandbackTrace(), {
      stages: ["architect", "engineer", "test", "reviewer"],
    });
    const noHandbackTrace = testerFailureHandbackTrace().filter(
      (event) => !(event.type === "handoff" && event.toRole === "engineer") && event.type !== "replan",
    );
    const noHandbackScore = scoreLoopTrace(noHandbackTrace, {
      stages: ["architect", "engineer", "test", "reviewer"],
    });

    expect(handbackScore.passed).toBe(true);
    expect(noHandbackScore.passed).toBe(false);
    expect(noHandbackScore.violations).toContainEqual(
      expect.objectContaining({ kind: "evaluator-handback" }),
    );
  });
});
