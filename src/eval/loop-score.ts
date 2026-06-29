import { STAGE_ROLE, type LoopStage } from "../core/loop.js";
import { isLoopTerminalEvent, type LoopTraceEvent } from "./loop-trace.js";

export type LoopViolationKind =
  | "missing-stage"
  | "stage-order"
  | "role-ownership"
  | "approval-gate"
  | "tester-before-reviewer"
  | "missing-evaluator-verdict"
  | "evaluator-handback"
  | "replan-budget"
  | "terminal";

export interface LoopViolation {
  kind: LoopViolationKind;
  message: string;
  stage?: LoopStage;
  eventIndex?: number;
}

export interface LoopScoreExpectation {
  stages: LoopStage[];
  /** Stages that require an approved human gate before they run. */
  approvalBeforeStages?: LoopStage[];
  maxReplans?: number;
  requireTerminal?: boolean;
}

export interface LoopScoreMetrics {
  expectedStages: number;
  observedStages: number;
  missingStages: LoopStage[];
  replanCount: number;
  approvalGateCount: number;
  terminalStatus: "done" | "stuck" | "missing";
}

export interface LoopScore {
  passed: boolean;
  metrics: LoopScoreMetrics;
  violations: LoopViolation[];
}

export function scoreLoopTrace(
  trace: LoopTraceEvent[],
  expectation: LoopScoreExpectation,
): LoopScore {
  const violations: LoopViolation[] = [];
  const firstIndexByStage = firstStageIndexes(trace);
  const missingStages = expectation.stages.filter((stage) => firstIndexByStage.get(stage) === undefined);

  for (const stage of missingStages) {
    violations.push({ kind: "missing-stage", stage, message: `Missing loop stage: ${stage}` });
  }

  for (let i = 1; i < expectation.stages.length; i += 1) {
    const previous = expectation.stages[i - 1]!;
    const current = expectation.stages[i]!;
    const previousIndex = firstIndexByStage.get(previous);
    const currentIndex = firstIndexByStage.get(current);
    if (previousIndex !== undefined && currentIndex !== undefined && previousIndex > currentIndex) {
      violations.push({
        kind: "stage-order",
        stage: current,
        eventIndex: currentIndex,
        message: `${current} ran before ${previous}`,
      });
    }
  }

  trace.forEach((event, index) => {
    if (event.type === "approval_gate") return;
    const stage = eventStage(event);
    const role = eventRole(event);
    if (!stage || !role) return;
    const expectedRole = STAGE_ROLE[stage];
    if (role !== expectedRole) {
      violations.push({
        kind: "role-ownership",
        stage,
        eventIndex: index,
        message: `${stage} stage must be performed by ${expectedRole}, not ${role}`,
      });
    }
  });

  const approvalStages = expectation.approvalBeforeStages ?? defaultApprovalStages(expectation.stages);
  for (const stage of approvalStages.filter((s) => expectation.stages.includes(s))) {
    const stageIndex = firstIndexByStage.get(stage);
    if (stageIndex === undefined) continue;
    const previousStage = previousExpectedStage(expectation.stages, stage);
    const afterIndex = previousStage ? firstIndexByStage.get(previousStage) : undefined;
    if (!hasApprovedGateBetween(trace, afterIndex ?? -1, stageIndex)) {
      violations.push({
        kind: "approval-gate",
        stage,
        eventIndex: stageIndex,
        message: `Approved? gate must pass before ${stage}`,
      });
    }
  }

  const testerIndex = firstIndexByStage.get("test");
  const reviewerIndex = firstIndexByStage.get("reviewer");
  if (expectation.stages.includes("test") && expectation.stages.includes("reviewer")) {
    if (testerIndex !== undefined && reviewerIndex !== undefined && testerIndex > reviewerIndex) {
      violations.push({
        kind: "tester-before-reviewer",
        stage: "reviewer",
        eventIndex: reviewerIndex,
        message: "Tester must verify before Reviewer on standard/full tracks",
      });
    }
  }

  if (expectation.stages.includes("test") && !trace.some((event) => event.type === "test_run" && event.stage === "test")) {
    violations.push({
      kind: "missing-evaluator-verdict",
      stage: "test",
      message: "Tester stage must include a test_run verdict",
    });
  }
  if (
    expectation.stages.includes("reviewer") &&
    !trace.some((event) => event.type === "review_verdict" && event.stage === "reviewer")
  ) {
    violations.push({
      kind: "missing-evaluator-verdict",
      stage: "reviewer",
      message: "Reviewer stage must include a review_verdict",
    });
  }

  trace.forEach((event, index) => {
    if (event.type === "test_run" && event.verdict === "fail" && hasTerminalWithoutEngineerRework(trace, index)) {
      violations.push({
        kind: "evaluator-handback",
        stage: "test",
        eventIndex: index,
        message: "Failed Tester verdict must hand back to Engineer before done",
      });
    }
    if (
      event.type === "review_verdict" &&
      event.verdict === "request-changes" &&
      hasTerminalWithoutEngineerRework(trace, index)
    ) {
      violations.push({
        kind: "evaluator-handback",
        stage: "reviewer",
        eventIndex: index,
        message: "Reviewer request-changes verdict must hand back to Engineer before done",
      });
    }
  });

  const replanCount = trace.filter((event) => event.type === "replan").length;
  const maxReplans = expectation.maxReplans ?? 2;
  if (replanCount > maxReplans) {
    violations.push({
      kind: "replan-budget",
      message: `Replan count ${replanCount} exceeds budget ${maxReplans}`,
    });
  }

  const terminal = lastTerminal(trace);
  if ((expectation.requireTerminal ?? true) && !terminal) {
    violations.push({ kind: "terminal", message: "Loop trace must end with done or stuck" });
  }

  return {
    passed: violations.length === 0,
    metrics: {
      expectedStages: expectation.stages.length,
      observedStages: expectation.stages.length - missingStages.length,
      missingStages,
      replanCount,
      approvalGateCount: trace.filter((event) => event.type === "approval_gate").length,
      terminalStatus: terminalStatus(terminal),
    },
    violations,
  };
}

function firstStageIndexes(trace: LoopTraceEvent[]): Map<LoopStage, number> {
  const indexes = new Map<LoopStage, number>();
  trace.forEach((event, index) => {
    const stage = eventStage(event);
    if (stage && !indexes.has(stage)) indexes.set(stage, index);
  });
  return indexes;
}

function eventStage(event: LoopTraceEvent): LoopStage | undefined {
  switch (event.type) {
    case "plan_created":
    case "tool_attempt":
    case "test_run":
    case "review_verdict":
    case "replan":
    case "done":
    case "stuck":
      return event.stage;
    case "approval_gate":
      return undefined;
    case "handoff":
      return undefined;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

function eventRole(event: LoopTraceEvent): string | undefined {
  switch (event.type) {
    case "plan_created":
    case "tool_attempt":
    case "test_run":
    case "review_verdict":
    case "replan":
    case "done":
    case "stuck":
      return event.role;
    case "approval_gate":
      return event.role;
    case "handoff":
      return event.toRole;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

function previousExpectedStage(stages: LoopStage[], stage: LoopStage): LoopStage | undefined {
  const index = stages.indexOf(stage);
  return index > 0 ? stages[index - 1] : undefined;
}

function defaultApprovalStages(stages: LoopStage[]): LoopStage[] {
  return stages.includes("architect") ? ["engineer", "reviewer", "wrap-up"] : ["reviewer", "wrap-up"];
}

function hasApprovedGateBetween(trace: LoopTraceEvent[], afterIndex: number, beforeIndex: number): boolean {
  for (let i = afterIndex + 1; i < beforeIndex; i += 1) {
    const event = trace[i]!;
    if (event.type === "approval_gate" && event.verdict === "approved") return true;
  }
  return false;
}

function hasTerminalWithoutEngineerRework(trace: LoopTraceEvent[], fromIndex: number): boolean {
  for (let i = fromIndex + 1; i < trace.length; i += 1) {
    const event = trace[i]!;
    if (event.type === "replan" && event.role === "engineer") return false;
    if (event.type === "plan_created" && event.role === "engineer") return false;
    if (event.type === "handoff" && event.toRole === "engineer") return false;
    if (event.type === "tool_attempt" && event.role === "engineer") return false;
    if (event.type === "test_run" && event.role === "engineer") return false;
    if (event.type === "done" || event.type === "stuck") return true;
  }
  return false;
}

function lastTerminal(trace: LoopTraceEvent[]): LoopTraceEvent | undefined {
  for (let i = trace.length - 1; i >= 0; i -= 1) {
    const event = trace[i]!;
    if (isLoopTerminalEvent(event)) return event;
  }
  return undefined;
}

function terminalStatus(event: LoopTraceEvent | undefined): LoopScoreMetrics["terminalStatus"] {
  if (!event) return "missing";
  if (event.type === "done") return "done";
  return "stuck";
}
