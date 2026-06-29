import { appendFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAcceptedLearnings } from "../../src/core/accepted-learnings.js";
import {
  appendGateOutcome,
  appendLoopEvent,
  readGateHistory,
  readLoopEvents,
  readStandardsDeltas,
  recordStandardsDelta,
} from "../../src/core/memory.js";
import { stagesForTrack } from "../../src/customize/emitters.js";
import type { ApprovalGateEvent, HandoffEvent, TestRunEvent } from "../../src/eval/loop-trace.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function sdlc(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-mem-"));
  tmpDirs.push(dir);
  return dir;
}

describe("ceremony tracks", () => {
  it("Quick skips Architect and wrap-up", () => {
    const stages = stagesForTrack("quick");
    expect(stages).toEqual(["engineer", "reviewer"]);
    expect(stages).not.toContain("architect");
    expect(stages).not.toContain("wrap-up");
  });

  it("Full runs all stages including wrap-up", () => {
    expect(stagesForTrack("full")).toEqual([
      "architect",
      "engineer",
      "test",
      "reviewer",
      "wrap-up",
    ]);
  });

  it("Standard plans + reviews but skips wrap-up", () => {
    const stages = stagesForTrack("standard");
    expect(stages).toContain("architect");
    expect(stages).not.toContain("wrap-up");
  });
});

describe("compounding memory", () => {
  it("appends a gate outcome with verdict + scope + reason", () => {
    const dir = sdlc();
    appendGateOutcome(dir, {
      taskId: "T-1",
      verdict: "approved",
      scope: "src/auth.ts",
      reason: "review passed; tests green",
    });
    const history = readGateHistory(dir);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      taskId: "T-1",
      verdict: "approved",
      scope: "src/auth.ts",
      reason: "review passed; tests green",
    });
    expect(readAcceptedLearnings(dir)).toEqual([
      expect.objectContaining({
        key: "gate:T-1:approved:src-auth-ts",
        kind: "gate-approval",
        provenance: "gate",
      }),
    ]);
  });

  it("records a standards delta only behind the gated approval flag", () => {
    const dir = sdlc();
    const delta = { statement: "Use structured logging.", sources: ["src/log.ts"] };

    expect(recordStandardsDelta(dir, delta, false)).toBe(false);
    expect(readStandardsDeltas(dir)).toHaveLength(0);

    expect(recordStandardsDelta(dir, delta, true)).toBe(true);
    expect(readStandardsDeltas(dir)).toEqual([delta]);
  });

  it("tolerates a corrupt/partial line instead of failing the whole log", () => {
    const dir = sdlc();
    appendGateOutcome(dir, { taskId: "T-1", verdict: "approved", scope: "a", reason: "ok" });
    // A corrupt (non-JSON) line landed in the middle of the log.
    appendFileSync(
      join(dir, "gate_history", "outcomes.jsonl"),
      '{"taskId":"T-2","verdict":\n',
      "utf8",
    );
    appendGateOutcome(dir, { taskId: "T-3", verdict: "blocked", scope: "b", reason: "no" });

    const history = readGateHistory(dir);
    expect(history.map((h) => h.taskId)).toEqual(["T-1", "T-3"]);
  });
});

describe("loop trace events", () => {
  it("appends and reads approval gate events", () => {
    const dir = sdlc();
    const event: ApprovalGateEvent = {
      type: "approval_gate",
      taskId: "T-1",
      verdict: "approved",
      role: "engineer",
      stage: "engineer",
      reason: "Human approved via gate hook",
    };
    appendLoopEvent(dir, event);
    const events = readLoopEvents(dir);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "approval_gate",
      taskId: "T-1",
      verdict: "approved",
      role: "engineer",
    });
    expect(events[0].timestamp).toBeDefined();
  });

  it("appends handoff events", () => {
    const dir = sdlc();
    const event: HandoffEvent = {
      type: "handoff",
      taskId: "T-2",
      fromRole: "architect",
      toRole: "engineer",
      fromStage: "architect",
      toStage: "engineer",
      reason: "Plan approved",
    };
    appendLoopEvent(dir, event);
    const events = readLoopEvents(dir);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("handoff");
  });

  it("appends test run events", () => {
    const dir = sdlc();
    const event: TestRunEvent = {
      type: "test_run",
      taskId: "T-3",
      role: "tester",
      stage: "test",
      command: "npm test",
      verdict: "pass",
    };
    appendLoopEvent(dir, event);
    const events = readLoopEvents(dir);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "test_run",
      command: "npm test",
      verdict: "pass",
    });
  });

  it("preserves explicit timestamps", () => {
    const dir = sdlc();
    const timestamp = "2026-06-29T12:00:00.000Z";
    const event: ApprovalGateEvent = {
      type: "approval_gate",
      taskId: "T-4",
      verdict: "approved",
      timestamp,
    };
    appendLoopEvent(dir, event);
    const events = readLoopEvents(dir);
    expect(events[0].timestamp).toBe(timestamp);
  });

  it("returns empty array when no events exist", () => {
    const dir = sdlc();
    const events = readLoopEvents(dir);
    expect(events).toEqual([]);
  });
});
