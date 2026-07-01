import { describe, expect, it } from "vitest";
import {
  isLoopTerminalEvent,
  type LoopTraceEvent,
  parseLoopTraceEvent,
} from "../../src/eval/loop-trace.js";

describe("loop trace events", () => {
  it("parses valid terminal events and rejects malformed payloads", () => {
    expect(
      parseLoopTraceEvent({
        type: "done",
        taskId: "task-1",
        role: "reviewer",
        outcome: "success",
      }),
    ).toMatchObject({ type: "done", taskId: "task-1" });
    expect(parseLoopTraceEvent({ type: "done", taskId: "task-1" })).toBeUndefined();
  });

  it("classifies done and stuck as terminal events", () => {
    const done: LoopTraceEvent = {
      type: "done",
      taskId: "task-1",
      role: "reviewer",
      stage: "reviewer",
      outcome: "success",
    };
    const stuck: LoopTraceEvent = {
      type: "stuck",
      taskId: "task-1",
      role: "engineer",
      stage: "engineer",
      reason: "Retry budget exhausted.",
    };
    const review: LoopTraceEvent = {
      type: "review_verdict",
      taskId: "task-1",
      role: "reviewer",
      stage: "reviewer",
      verdict: "approve",
    };

    expect(isLoopTerminalEvent(done)).toBe(true);
    expect(isLoopTerminalEvent(stuck)).toBe(true);
    expect(isLoopTerminalEvent(review)).toBe(false);
  });
});
