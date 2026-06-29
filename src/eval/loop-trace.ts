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
