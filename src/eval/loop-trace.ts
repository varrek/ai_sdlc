import type { LoopStage } from "../core/loop.js";
import type { GateVerdict } from "../core/memory.js";

export type LoopRole = "architect" | "engineer" | "tester" | "reviewer" | "debugger";

interface LoopTraceEventBase {
  taskId: string;
  timestamp?: string;
  evidence?: string[];
}

export interface PlanCreatedEvent extends LoopTraceEventBase {
  type: "plan_created";
  role: "architect" | "engineer";
  stage: "architect" | "engineer";
  summary: string;
}

export interface HandoffEvent extends LoopTraceEventBase {
  type: "handoff";
  fromRole: LoopRole;
  toRole: LoopRole;
  fromStage?: LoopStage;
  toStage?: LoopStage;
  reason?: string;
}

export interface ToolAttemptEvent extends LoopTraceEventBase {
  type: "tool_attempt";
  role: LoopRole;
  stage?: LoopStage;
  tool: string;
  mutating: boolean;
  command?: string;
}

export interface TestRunEvent extends LoopTraceEventBase {
  type: "test_run";
  role: "engineer" | "tester";
  stage: "engineer" | "test";
  command: string;
  verdict: "pass" | "fail";
  failures?: string[];
}

export interface ApprovalGateEvent extends LoopTraceEventBase {
  type: "approval_gate";
  role?: LoopRole;
  stage?: LoopStage;
  checkpoint?: string;
  verdict: GateVerdict;
  reason?: string;
}

export interface ReviewVerdictEvent extends LoopTraceEventBase {
  type: "review_verdict";
  role: "reviewer";
  stage: "reviewer";
  verdict: "approve" | "request-changes";
  findings?: string[];
}

export interface ReplanEvent extends LoopTraceEventBase {
  type: "replan";
  role: LoopRole;
  stage?: LoopStage;
  reason: string;
}

export interface DoneEvent extends LoopTraceEventBase {
  type: "done";
  role: LoopRole;
  stage?: LoopStage;
  outcome: "success";
}

export interface StuckEvent extends LoopTraceEventBase {
  type: "stuck";
  role: LoopRole;
  stage?: LoopStage;
  reason: string;
}

export type LoopTraceEvent =
  | PlanCreatedEvent
  | HandoffEvent
  | ToolAttemptEvent
  | TestRunEvent
  | ApprovalGateEvent
  | ReviewVerdictEvent
  | ReplanEvent
  | DoneEvent
  | StuckEvent;

export type LoopTerminalEvent = DoneEvent | StuckEvent;

export function isLoopTerminalEvent(event: LoopTraceEvent): event is LoopTerminalEvent {
  switch (event.type) {
    case "done":
    case "stuck":
      return true;
    case "plan_created":
    case "handoff":
    case "tool_attempt":
    case "test_run":
    case "approval_gate":
    case "review_verdict":
    case "replan":
      return false;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

const LOOP_ROLES = new Set<LoopRole>(["architect", "engineer", "tester", "reviewer", "debugger"]);
const LOOP_STAGES = new Set(["architect", "engineer", "test", "reviewer", "wrap-up"] as const);
const GATE_VERDICTS = new Set(["approved", "blocked", "changes-requested"]);
const TEST_VERDICTS = new Set(["pass", "fail"]);
const REVIEW_VERDICTS = new Set(["approve", "request-changes"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLoopRole(value: unknown): value is LoopRole {
  return typeof value === "string" && LOOP_ROLES.has(value as LoopRole);
}

function isLoopStage(value: unknown): value is LoopStage {
  return typeof value === "string" && LOOP_STAGES.has(value as LoopStage);
}

function parseEventBase(value: Record<string, unknown>): LoopTraceEventBase | undefined {
  if (!isNonEmptyString(value.taskId)) return undefined;
  const base: LoopTraceEventBase = { taskId: value.taskId };
  if (value.timestamp !== undefined) {
    if (typeof value.timestamp !== "string") return undefined;
    base.timestamp = value.timestamp;
  }
  if (value.evidence !== undefined) {
    if (!isStringArray(value.evidence)) return undefined;
    base.evidence = value.evidence;
  }
  return base;
}

/** Runtime validation for loop trace events before persistence or scoring. */
export function parseLoopTraceEvent(value: unknown): LoopTraceEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const base = parseEventBase(record);
  if (!base) return undefined;

  switch (record.type) {
    case "plan_created":
      if (!isLoopRole(record.role) || !isLoopStage(record.stage)) return undefined;
      if (record.role !== "architect" && record.role !== "engineer") return undefined;
      if (record.stage !== "architect" && record.stage !== "engineer") return undefined;
      if (!isNonEmptyString(record.summary)) return undefined;
      return {
        ...base,
        type: "plan_created",
        role: record.role,
        stage: record.stage,
        summary: record.summary,
      };
    case "handoff":
      if (!isLoopRole(record.fromRole) || !isLoopRole(record.toRole)) return undefined;
      if (record.fromStage !== undefined && !isLoopStage(record.fromStage)) return undefined;
      if (record.toStage !== undefined && !isLoopStage(record.toStage)) return undefined;
      if (record.reason !== undefined && typeof record.reason !== "string") return undefined;
      return {
        ...base,
        type: "handoff",
        fromRole: record.fromRole,
        toRole: record.toRole,
        fromStage: record.fromStage,
        toStage: record.toStage,
        reason: record.reason,
      };
    case "tool_attempt":
      if (!isLoopRole(record.role)) return undefined;
      if (record.stage !== undefined && !isLoopStage(record.stage)) return undefined;
      if (!isNonEmptyString(record.tool)) return undefined;
      if (typeof record.mutating !== "boolean") return undefined;
      if (record.command !== undefined && typeof record.command !== "string") return undefined;
      return {
        ...base,
        type: "tool_attempt",
        role: record.role,
        stage: record.stage,
        tool: record.tool,
        mutating: record.mutating,
        command: record.command,
      };
    case "test_run":
      if (record.role !== "engineer" && record.role !== "tester") return undefined;
      if (record.stage !== "engineer" && record.stage !== "test") return undefined;
      if (!isNonEmptyString(record.command)) return undefined;
      if (!TEST_VERDICTS.has(String(record.verdict))) return undefined;
      if (record.failures !== undefined && !isStringArray(record.failures)) return undefined;
      return {
        ...base,
        type: "test_run",
        role: record.role,
        stage: record.stage,
        command: record.command,
        verdict: record.verdict as "pass" | "fail",
        failures: record.failures,
      };
    case "approval_gate":
      if (record.role !== undefined && !isLoopRole(record.role)) return undefined;
      if (record.stage !== undefined && !isLoopStage(record.stage)) return undefined;
      if (record.checkpoint !== undefined && typeof record.checkpoint !== "string")
        return undefined;
      if (!GATE_VERDICTS.has(String(record.verdict))) return undefined;
      if (record.reason !== undefined && typeof record.reason !== "string") return undefined;
      return {
        ...base,
        type: "approval_gate",
        role: record.role,
        stage: record.stage,
        checkpoint: record.checkpoint,
        verdict: record.verdict as GateVerdict,
        reason: record.reason,
      };
    case "review_verdict":
      if (record.role !== "reviewer" || record.stage !== "reviewer") return undefined;
      if (!REVIEW_VERDICTS.has(String(record.verdict))) return undefined;
      if (record.findings !== undefined && !isStringArray(record.findings)) return undefined;
      return {
        ...base,
        type: "review_verdict",
        role: "reviewer",
        stage: "reviewer",
        verdict: record.verdict as "approve" | "request-changes",
        findings: record.findings,
      };
    case "replan":
      if (!isLoopRole(record.role)) return undefined;
      if (record.stage !== undefined && !isLoopStage(record.stage)) return undefined;
      if (!isNonEmptyString(record.reason)) return undefined;
      return {
        ...base,
        type: "replan",
        role: record.role,
        stage: record.stage,
        reason: record.reason,
      };
    case "done":
      if (!isLoopRole(record.role)) return undefined;
      if (record.stage !== undefined && !isLoopStage(record.stage)) return undefined;
      if (record.outcome !== "success") return undefined;
      return { ...base, type: "done", role: record.role, stage: record.stage, outcome: "success" };
    case "stuck":
      if (!isLoopRole(record.role)) return undefined;
      if (record.stage !== undefined && !isLoopStage(record.stage)) return undefined;
      if (!isNonEmptyString(record.reason)) return undefined;
      return {
        ...base,
        type: "stuck",
        role: record.role,
        stage: record.stage,
        reason: record.reason,
      };
    default:
      return undefined;
  }
}
