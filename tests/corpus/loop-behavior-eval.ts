import { stagesForTrack, STAGE_ROLE, type LoopStage } from "../../src/core/loop.js";
import { scoreLoopTrace, type LoopScore } from "../../src/eval/loop-score.js";
import type { LoopRole, LoopTraceEvent } from "../../src/eval/loop-trace.js";
import type { CeremonyTrack } from "../../src/schema/index.js";

export interface LoopBehaviorScenario {
  id: string;
  track: CeremonyTrack;
  task: string;
}

export interface LoopBehaviorEvalResult {
  scenarioId: string;
  task: string;
  score: LoopScore;
}

export interface LoopRoleChoiceScenario {
  id: string;
  task: string;
  expectedRole: LoopRole;
}

export const LOOP_BEHAVIOR_SCENARIOS: LoopBehaviorScenario[] = [
  {
    id: "quick-engineer-reviewer",
    track: "quick",
    task: "Implement a small scoped change and send it to fresh review.",
  },
  {
    id: "standard-tester-before-reviewer",
    track: "standard",
    task: "Implement a change, run independent verification, then review.",
  },
  {
    id: "full-wrap-up-after-review",
    track: "full",
    task: "Implement, verify, review, then perform integration wrap-up.",
  },
];

export const LOOP_ROLE_CHOICE_SCENARIOS: LoopRoleChoiceScenario[] = [
  {
    id: "who-verifies-change",
    task: "Who should independently verify this change by running tests before review?",
    expectedRole: "tester",
  },
  {
    id: "who-applies-review-fix",
    task: "Who should edit the code to address ordered Reviewer findings?",
    expectedRole: "engineer",
  },
];

export function evaluateLoopBehaviorScenario(
  scenario: LoopBehaviorScenario,
): LoopBehaviorEvalResult {
  const stages = stagesForTrack(scenario.track);
  const trace = syntheticPassingTrace(stages);
  return {
    scenarioId: scenario.id,
    task: scenario.task,
    score: scoreLoopTrace(trace, { stages }),
  };
}

export function selectLoopRoleForTask(task: string): LoopRole {
  const normalized = task.toLowerCase();
  if (normalized.includes("verify") || normalized.includes("running tests")) return "tester";
  if (normalized.includes("reviewer findings") || normalized.includes("edit the code")) return "engineer";
  if (normalized.includes("review")) return "reviewer";
  if (normalized.includes("root cause") || normalized.includes("debug")) return "debugger";
  return "architect";
}

export function testerFailureHandbackTrace(): LoopTraceEvent[] {
  const taskId = "tester-handback";
  return [
    {
      type: "plan_created",
      taskId,
      role: "architect",
      stage: "architect",
      summary: "Bounded plan.",
    },
    {
      type: "approval_gate",
      taskId,
      verdict: "approved",
      reason: "Approved before implementation.",
    },
    {
      type: "handoff",
      taskId,
      fromRole: "architect",
      toRole: "engineer",
      fromStage: "architect",
      toStage: "engineer",
    },
    {
      type: "tool_attempt",
      taskId,
      role: "engineer",
      stage: "engineer",
      tool: "Edit",
      mutating: true,
    },
    {
      type: "handoff",
      taskId,
      fromRole: "engineer",
      toRole: "tester",
      fromStage: "engineer",
      toStage: "test",
    },
    {
      type: "test_run",
      taskId,
      role: "tester",
      stage: "test",
      command: "npm test",
      verdict: "fail",
      failures: ["missing retry coverage"],
    },
    {
      type: "handoff",
      taskId,
      fromRole: "tester",
      toRole: "engineer",
      fromStage: "test",
      toStage: "engineer",
      reason: "Add retry-path coverage.",
    },
    {
      type: "replan",
      taskId,
      role: "engineer",
      stage: "engineer",
      reason: "Address Tester handback.",
    },
    {
      type: "test_run",
      taskId,
      role: "tester",
      stage: "test",
      command: "npm test",
      verdict: "pass",
    },
    {
      type: "approval_gate",
      taskId,
      verdict: "approved",
      reason: "Verification passed.",
    },
    {
      type: "review_verdict",
      taskId,
      role: "reviewer",
      stage: "reviewer",
      verdict: "approve",
    },
    {
      type: "done",
      taskId,
      role: "reviewer",
      stage: "reviewer",
      outcome: "success",
    },
  ];
}

export function syntheticPassingTrace(stages: LoopStage[]): LoopTraceEvent[] {
  const taskId = "synthetic-loop";
  const events: LoopTraceEvent[] = [];
  let previousStage: LoopStage | undefined;
  for (const stage of stages) {
    const role = STAGE_ROLE[stage];
    if (stage === "engineer" && stages.includes("architect")) {
      events.push({
        type: "approval_gate",
        taskId,
        verdict: "approved",
        reason: "Approved before implementation.",
      });
    }
    if (stage === "reviewer" || stage === "wrap-up") {
      events.push({
        type: "approval_gate",
        taskId,
        verdict: "approved",
        reason: `Approved before ${stage}.`,
      });
    }
    if (previousStage) {
      events.push({
        type: "handoff",
        taskId,
        fromRole: STAGE_ROLE[previousStage],
        toRole: role,
        fromStage: previousStage,
        toStage: stage,
      });
    }
    events.push(stageEvent(taskId, stage));
    previousStage = stage;
  }
  events.push({
    type: "done",
    taskId,
    role: STAGE_ROLE[stages[stages.length - 1]],
    stage: stages[stages.length - 1],
    outcome: "success",
  });
  return events;
}

function stageEvent(taskId: string, stage: LoopStage): LoopTraceEvent {
  switch (stage) {
    case "architect":
      return {
        type: "plan_created",
        taskId,
        role: "architect",
        stage,
        summary: "Bounded plan.",
      };
    case "engineer":
      return {
        type: "tool_attempt",
        taskId,
        role: "engineer",
        stage,
        tool: "Edit",
        mutating: true,
      };
    case "test":
      return {
        type: "test_run",
        taskId,
        role: "tester",
        stage,
        command: "npm test",
        verdict: "pass",
      };
    case "reviewer":
      return {
        type: "review_verdict",
        taskId,
        role: "reviewer",
        stage,
        verdict: "approve",
      };
    case "wrap-up":
      return {
        type: "tool_attempt",
        taskId,
        role: "engineer",
        stage,
        tool: "GitLab",
        mutating: true,
      };
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}
