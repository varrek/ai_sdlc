import { join } from "node:path";
import { appendLoopEvent, readLoopEvents } from "../core/memory.js";
import { parseLoopTraceEvent, type LoopTraceEvent } from "../eval/loop-trace.js";

export function approvalEventKey(event: LoopTraceEvent): string | undefined {
  if (event.type !== "approval_gate" || event.verdict !== "approved") return undefined;
  if (event.taskId === "unknown") return undefined;
  const evidence = [...(event.evidence ?? [])].sort().join("\0");
  const checkpoint = event.checkpoint ?? event.stage;
  if (!checkpoint) return undefined;
  return [event.taskId, event.role ?? "", checkpoint, evidence].join("\0");
}

export interface RecordLoopEventResult {
  path?: string;
  skippedDuplicate?: boolean;
  event?: LoopTraceEvent;
}

export function parseRecordLoopEventInput(eventJson: string): LoopTraceEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventJson);
  } catch (error) {
    throw new RecordLoopEventError(
      `invalid JSON in --event: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const event = parseLoopTraceEvent(parsed);
  if (!event) {
    throw new RecordLoopEventError("event must include a valid loop trace payload");
  }
  return event;
}

export function recordLoopEventFromJson(
  eventJson: string,
  sdlcDir = join(process.cwd(), ".sdlc"),
): RecordLoopEventResult {
  const event = parseRecordLoopEventInput(eventJson);
  const approvalKey = approvalEventKey(event);
  if (approvalKey) {
    const alreadyRecorded = readLoopEvents(sdlcDir).some(
      (recorded) => approvalEventKey(recorded) === approvalKey,
    );
    if (alreadyRecorded) {
      return { skippedDuplicate: true, event };
    }
  }
  const path = appendLoopEvent(sdlcDir, event);
  return { path, event };
}

export class RecordLoopEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordLoopEventError";
  }
}
