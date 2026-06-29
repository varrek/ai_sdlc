import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { upsertGateOutcomeLearning } from "./accepted-learnings.js";
import type { LoopTraceEvent } from "../eval/loop-trace.js";

/**
 * Minimal compounding memory (v1). We capture two things and defer the rest
 * (promotion-back into skills, similar-failure recall are out of scope):
 *  - Approved? gate outcomes, appended to an immutable history log.
 *  - Gated deltas to the standards index — recorded ONLY after approval.
 *  - Loop trace events for quality scoring and behavior evaluation.
 */

export type GateVerdict = "approved" | "blocked" | "changes-requested";

export interface GateOutcome {
  taskId: string;
  verdict: GateVerdict;
  /** What the change covered (files/area). */
  scope: string;
  reason: string;
  /** Optional ISO timestamp; caller-supplied to keep this deterministic. */
  timestamp?: string;
}

const GATE_HISTORY = join("gate_history", "outcomes.jsonl");
const STANDARDS_DELTAS = "standards-deltas.jsonl";
const LOOP_EVENTS = join("loop_history", "events.jsonl");

/** Append a gate outcome to the history log (`.sdlc/gate_history/outcomes.jsonl`). */
export function appendGateOutcome(sdlcDir: string, outcome: GateOutcome): string {
  const path = join(sdlcDir, GATE_HISTORY);
  appendLine(path, JSON.stringify(outcome));
  upsertGateOutcomeLearning(sdlcDir, outcome);
  return path;
}

export function readGateHistory(sdlcDir: string): GateOutcome[] {
  return readJsonl<GateOutcome>(join(sdlcDir, GATE_HISTORY));
}

export interface StandardsDelta {
  statement: string;
  sources: string[];
}

/**
 * Record a delta to the standards index — but ONLY behind the gated-approval
 * flag. An unapproved delta is rejected (returns false, writes nothing), so the
 * living index only ever grows through the gate.
 */
export function recordStandardsDelta(
  sdlcDir: string,
  delta: StandardsDelta,
  approved: boolean,
): boolean {
  if (!approved) return false;
  appendLine(join(sdlcDir, STANDARDS_DELTAS), JSON.stringify(delta));
  return true;
}

export function readStandardsDeltas(sdlcDir: string): StandardsDelta[] {
  return readJsonl<StandardsDelta>(join(sdlcDir, STANDARDS_DELTAS));
}

/** Append a loop trace event to the history log (`.sdlc/loop_history/events.jsonl`). */
export function appendLoopEvent(sdlcDir: string, event: LoopTraceEvent): string {
  const path = join(sdlcDir, LOOP_EVENTS);
  const eventWithTimestamp = event.timestamp
    ? event
    : { ...event, timestamp: new Date().toISOString() };
  appendLine(path, JSON.stringify(eventWithTimestamp));
  return path;
}

export function readLoopEvents(sdlcDir: string): LoopTraceEvent[] {
  return readJsonl<LoopTraceEvent>(join(sdlcDir, LOOP_EVENTS));
}

function appendLine(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, "utf8");
}

/**
 * Read a JSONL log, skipping blank and corrupt lines. An append-only log can be
 * left half-written by a crash; one bad line must not make the whole history
 * unreadable.
 */
function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Skip a corrupt/partial line rather than throwing on the whole log.
    }
  }
  return out;
}
