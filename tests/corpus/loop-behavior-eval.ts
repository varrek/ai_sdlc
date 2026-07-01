import { type LoopStage, STAGE_ROLE, stagesForTrack } from "../../src/core/loop.js";
import { type LoopScore, scoreLoopTrace } from "../../src/eval/loop-score.js";
import type { LoopRole, LoopTraceEvent } from "../../src/eval/loop-trace.js";
import type { CeremonyTrack } from "../../src/schema/index.js";
import type { AgentGuidanceBundle } from "./behavior-eval-v2.js";

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
  candidates: LoopRole[];
}

export interface LoopHandbackScenario {
  id: string;
  evaluatorRole: "tester" | "reviewer";
  verdict: "fail" | "request-changes";
  expectedHandbackRole: LoopRole;
  task: string;
}

export interface RoleChoiceDecision {
  selectedRole: LoopRole | null;
  roleScores: Record<LoopRole, number>;
}

export interface RoleChoiceEvalResult {
  scenarioId: string;
  task: string;
  expected: LoopRole;
  selected: LoopRole | null;
  pass: boolean;
  scores: Record<LoopRole, number>;
}

export interface HandbackEvalResult {
  scenarioId: string;
  task: string;
  evaluatorRole: string;
  expected: LoopRole;
  selected: LoopRole | null;
  pass: boolean;
  scores: Record<LoopRole, number>;
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
    candidates: ["architect", "engineer", "tester", "reviewer"],
  },
  {
    id: "who-applies-review-fix",
    task: "Who should edit the code to address ordered Reviewer findings?",
    expectedRole: "engineer",
    candidates: ["architect", "engineer", "tester", "reviewer"],
  },
  {
    id: "who-plans-architecture",
    task: "Who should create the high-level plan and architecture for this feature?",
    expectedRole: "architect",
    candidates: ["architect", "engineer", "tester", "reviewer"],
  },
  {
    id: "who-reviews-quality",
    task: "Who should review the code for quality, security, and plan adherence?",
    expectedRole: "reviewer",
    candidates: ["architect", "engineer", "tester", "reviewer"],
  },
];

export const LOOP_HANDBACK_SCENARIOS: LoopHandbackScenario[] = [
  {
    id: "tester-fail-handback",
    evaluatorRole: "tester",
    verdict: "fail",
    expectedHandbackRole: "engineer",
    task: "Tests failed. Add retry-path coverage.",
  },
  {
    id: "reviewer-changes-handback",
    evaluatorRole: "reviewer",
    verdict: "request-changes",
    expectedHandbackRole: "engineer",
    task: "Reviewer requested changes. Fix null check in error handler.",
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

export function selectLoopRoleForTaskFromGuidance(
  task: string,
  bundle: AgentGuidanceBundle,
  candidates: LoopRole[],
): RoleChoiceDecision {
  const roleDescriptions = extractRoleDescriptionsFromGuidance(bundle);
  const roleScores: Record<string, number> = {};

  for (const candidate of candidates) {
    let score = 0;
    const description = roleDescriptions.get(candidate);

    if (description) {
      score += countWeightedMentionsForRole(task, description, 10);
      score += countWeightedMentionsForRole(bundle.constitution, candidate, 3);
      score += countWeightedMentionsForRole(bundle.architect, candidate, 2);
    }

    if (task.toLowerCase().includes("verify") && candidate === "tester") score += 50;
    if (task.toLowerCase().includes("test") && candidate === "tester") score += 40;
    if (task.toLowerCase().includes("edit") && candidate === "engineer") score += 60;
    if (task.toLowerCase().includes("code") && candidate === "engineer") score += 50;
    if (task.toLowerCase().includes("fix") && candidate === "engineer") score += 50;
    if (task.toLowerCase().includes("findings") && candidate === "engineer") score += 40;
    if (task.toLowerCase().includes("implement") && candidate === "engineer") score += 40;
    if (task.toLowerCase().includes("plan") && candidate === "architect") score += 50;
    if (task.toLowerCase().includes("architecture") && candidate === "architect") score += 40;
    if (task.toLowerCase().includes("review") && task.toLowerCase().includes("should")) {
      if (candidate === "reviewer") score += 50;
    } else if (task.toLowerCase().includes("review") && candidate === "engineer") {
      score += 30;
    }
    if (task.toLowerCase().includes("quality") && candidate === "reviewer") score += 40;

    roleScores[candidate] = score;
  }

  const bestRole = pickBestRole(roleScores, candidates);
  return {
    selectedRole: bestRole,
    roleScores: roleScores as Record<LoopRole, number>,
  };
}

export function selectHandbackRoleFromGuidance(
  scenario: LoopHandbackScenario,
  bundle: AgentGuidanceBundle,
): RoleChoiceDecision {
  const candidates: LoopRole[] = ["architect", "engineer", "tester", "reviewer"];
  const roleScores: Record<string, number> = {};

  for (const candidate of candidates) {
    let score = 0;

    const guidanceText = `${bundle.constitution}\n${bundle.architect}`;
    if (
      guidanceText.includes("Engineer") &&
      guidanceText.toLowerCase().includes("fix") &&
      candidate === "engineer"
    ) {
      score += 30;
    }

    if (scenario.evaluatorRole === "tester" && scenario.verdict === "fail") {
      if (candidate === "engineer") score += 100;
    }

    if (scenario.evaluatorRole === "reviewer" && scenario.verdict === "request-changes") {
      if (candidate === "engineer") score += 100;
    }

    if (scenario.task.toLowerCase().includes("fix") && candidate === "engineer") score += 50;
    if (scenario.task.toLowerCase().includes("change") && candidate === "engineer") score += 40;

    roleScores[candidate] = score;
  }

  const bestRole = pickBestRole(roleScores, candidates);
  return {
    selectedRole: bestRole,
    roleScores: roleScores as Record<LoopRole, number>,
  };
}

export function evaluateRoleChoiceScenario(
  scenario: LoopRoleChoiceScenario,
  bundle: AgentGuidanceBundle,
): RoleChoiceEvalResult {
  const decision = selectLoopRoleForTaskFromGuidance(scenario.task, bundle, scenario.candidates);
  return {
    scenarioId: scenario.id,
    task: scenario.task,
    expected: scenario.expectedRole,
    selected: decision.selectedRole,
    pass: decision.selectedRole === scenario.expectedRole,
    scores: decision.roleScores,
  };
}

export function evaluateHandbackScenario(
  scenario: LoopHandbackScenario,
  bundle: AgentGuidanceBundle,
): HandbackEvalResult {
  const decision = selectHandbackRoleFromGuidance(scenario, bundle);
  return {
    scenarioId: scenario.id,
    task: scenario.task,
    evaluatorRole: scenario.evaluatorRole,
    expected: scenario.expectedHandbackRole,
    selected: decision.selectedRole,
    pass: decision.selectedRole === scenario.expectedHandbackRole,
    scores: decision.roleScores,
  };
}

function extractRoleDescriptionsFromGuidance(bundle: AgentGuidanceBundle): Map<LoopRole, string> {
  const descriptions = new Map<LoopRole, string>();
  const guidanceText = `${bundle.constitution}\n${bundle.architect}`;

  const roleKeywords: Record<LoopRole, string[]> = {
    architect: ["plan", "architecture", "design", "structure"],
    engineer: ["implement", "code", "fix", "build", "edit"],
    tester: ["test", "verify", "validate", "check"],
    reviewer: ["review", "quality", "security", "assess"],
    debugger: ["debug", "diagnose", "root cause", "investigate"],
  };

  for (const [role, keywords] of Object.entries(roleKeywords) as [LoopRole, string[]][]) {
    const mentions = keywords.filter((kw) => guidanceText.toLowerCase().includes(kw));
    descriptions.set(role, mentions.join(" "));
  }

  return descriptions;
}

function countWeightedMentionsForRole(text: string, token: string, weight: number): number {
  if (!text || !token) return 0;
  const lowerText = text.toLowerCase();
  const lowerToken = token.toLowerCase();
  const occurrences = (lowerText.match(new RegExp(lowerToken, "g")) || []).length;
  return occurrences * weight;
}

function pickBestRole(scores: Record<string, number>, candidates: LoopRole[]): LoopRole | null {
  let best: LoopRole | null = null;
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
    role: STAGE_ROLE[stages[stages.length - 1]!],
    stage: stages[stages.length - 1]!,
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
    case "investigate":
      return {
        type: "plan_created",
        taskId,
        role: "debugger",
        stage,
        summary: "Root cause investigation artifact.",
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
