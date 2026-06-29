import { describe, expect, it } from "vitest";
import { scoreLoopTrace } from "../../src/eval/loop-score.js";
import type { LoopTraceEvent } from "../../src/eval/loop-trace.js";
import { syntheticPassingTrace } from "../corpus/loop-behavior-eval.js";

const standardStages = ["architect", "engineer", "test", "reviewer"] as const;

function standardTrace(): LoopTraceEvent[] {
  return syntheticPassingTrace([...standardStages]);
}

describe("loop trace scoring", () => {
  it("passes a standard track trace with tester before reviewer and an approval gate", () => {
    const score = scoreLoopTrace(standardTrace(), { stages: [...standardStages] });

    expect(score.passed).toBe(true);
    expect(score.metrics.observedStages).toBe(4);
    expect(score.metrics.terminalStatus).toBe("done");
  });

  it("flags reviewer before tester and a missing approval gate", () => {
    const trace = standardTrace().filter((event) => event.type !== "approval_gate");
    const reviewerHandoff = trace.find(
      (event) => event.type === "handoff" && event.toStage === "reviewer",
    );
    const testerHandoffIndex = trace.findIndex(
      (event) => event.type === "handoff" && event.toStage === "test",
    );
    const reviewerHandoffIndex = trace.indexOf(reviewerHandoff!);
    trace.splice(reviewerHandoffIndex, 1);
    trace.splice(testerHandoffIndex, 0, reviewerHandoff!);

    const score = scoreLoopTrace(trace, { stages: [...standardStages] });

    expect(score.passed).toBe(false);
    expect(score.violations.map((v) => v.kind)).toEqual(
      expect.arrayContaining(["approval-gate", "tester-before-reviewer", "stage-order"]),
    );
  });

  it("flags a stage performed by the wrong role", () => {
    const trace = standardTrace();
    trace[4] = {
      type: "test_run",
      taskId: "task-1",
      role: "engineer",
      stage: "test",
      command: "npm test",
      verdict: "pass",
    };

    const score = scoreLoopTrace(trace, { stages: [...standardStages] });

    expect(score.passed).toBe(false);
    expect(score.violations).toContainEqual(
      expect.objectContaining({
        kind: "role-ownership",
        message: expect.stringContaining("test stage must be performed by tester"),
      }),
    );
  });

  it("enforces the replan budget", () => {
    const trace: LoopTraceEvent[] = [
      ...standardTrace(),
      { type: "replan", taskId: "task-1", role: "engineer", stage: "engineer", reason: "A" },
      { type: "replan", taskId: "task-1", role: "engineer", stage: "engineer", reason: "B" },
      { type: "replan", taskId: "task-1", role: "engineer", stage: "engineer", reason: "C" },
    ];

    const score = scoreLoopTrace(trace, { stages: [...standardStages], maxReplans: 2 });

    expect(score.passed).toBe(false);
    expect(score.violations).toContainEqual(expect.objectContaining({ kind: "replan-budget" }));
  });

  it("rejects a stale approval gate from before the previous stage", () => {
    const trace = standardTrace().filter((event) => event.type !== "approval_gate");
    trace.splice(1, 0, {
      type: "approval_gate",
      taskId: "synthetic-loop",
      verdict: "approved",
      reason: "Approved before implementation, not before review.",
    });

    const score = scoreLoopTrace(trace, { stages: [...standardStages] });

    expect(score.passed).toBe(false);
    expect(score.violations).toContainEqual(expect.objectContaining({ kind: "approval-gate" }));
  });

  it("requires approval before Engineer work when Architect is in the track", () => {
    const trace = standardTrace().filter((event) => event.type !== "approval_gate");

    const score = scoreLoopTrace(trace, { stages: [...standardStages] });

    expect(score.passed).toBe(false);
    expect(score.violations).toContainEqual(
      expect.objectContaining({ kind: "approval-gate", stage: "engineer" }),
    );
  });

  it("reports missing and stuck terminal status", () => {
    const missingTerminal = standardTrace().filter((event) => event.type !== "done");
    const stuckTrace: LoopTraceEvent[] = [
      ...missingTerminal,
      {
        type: "stuck",
        taskId: "synthetic-loop",
        role: "reviewer",
        stage: "reviewer",
        reason: "Product decision needed.",
      },
    ];

    const missing = scoreLoopTrace(missingTerminal, { stages: [...standardStages] });
    const stuck = scoreLoopTrace(stuckTrace, { stages: [...standardStages] });

    expect(missing.passed).toBe(false);
    expect(missing.metrics.terminalStatus).toBe("missing");
    expect(missing.violations).toContainEqual(expect.objectContaining({ kind: "terminal" }));
    expect(stuck.passed).toBe(true);
    expect(stuck.metrics.terminalStatus).toBe("stuck");
  });

  it("requires evaluator failures to hand back to the engineer before done", () => {
    const failedTestTrace = standardTrace();
    failedTestTrace[4] = {
      type: "test_run",
      taskId: "synthetic-loop",
      role: "tester",
      stage: "test",
      command: "npm test",
      verdict: "fail",
      failures: ["missing retry coverage"],
    };
    const reviewRequestTrace = standardTrace();
    reviewRequestTrace[7] = {
      type: "review_verdict",
      taskId: "synthetic-loop",
      role: "reviewer",
      stage: "reviewer",
      verdict: "request-changes",
      findings: ["scope creep"],
    };

    expect(scoreLoopTrace(failedTestTrace, { stages: [...standardStages] }).violations).toContainEqual(
      expect.objectContaining({ kind: "evaluator-handback", stage: "test" }),
    );
    expect(scoreLoopTrace(reviewRequestTrace, { stages: [...standardStages] }).violations).toContainEqual(
      expect.objectContaining({ kind: "evaluator-handback", stage: "reviewer" }),
    );
  });

  it("recognizes Engineer plan-created events as evaluator handback rework", () => {
    const trace = standardTrace();
    trace[4] = {
      type: "test_run",
      taskId: "synthetic-loop",
      role: "tester",
      stage: "test",
      command: "npm test",
      verdict: "fail",
      failures: ["missing retry coverage"],
    };
    trace.splice(5, 0, {
      type: "plan_created",
      taskId: "synthetic-loop",
      role: "engineer",
      stage: "engineer",
      summary: "Retry fix plan.",
    });

    const score = scoreLoopTrace(trace, { stages: [...standardStages] });

    expect(score.violations).not.toContainEqual(expect.objectContaining({ kind: "evaluator-handback" }));
  });
});
