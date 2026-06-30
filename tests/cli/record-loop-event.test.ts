import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseRecordLoopEventInput,
  RecordLoopEventError,
  recordLoopEventFromJson,
} from "../../src/cli/record-loop-event.js";
import { readLoopEvents } from "../../src/core/memory.js";

describe("record-loop-event", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("rejects events missing required fields", () => {
    expect(() =>
      parseRecordLoopEventInput(JSON.stringify({ type: "done", outcome: "success" })),
    ).toThrow(RecordLoopEventError);
  });

  it("persists a valid approval gate event", () => {
    const sdlcDir = mkdtempSync(join(tmpdir(), "aisdlc-record-event-"));
    dirs.push(sdlcDir);
    const payload = JSON.stringify({
      type: "approval_gate",
      taskId: "task-1",
      verdict: "approved",
      role: "engineer",
      stage: "engineer",
    });
    const result = recordLoopEventFromJson(payload, sdlcDir);
    expect(result.path).toBeDefined();
    expect(readLoopEvents(sdlcDir)).toHaveLength(1);
  });

  it("dedupes repeated approval events for the same checkpoint", () => {
    const sdlcDir = mkdtempSync(join(tmpdir(), "aisdlc-record-event-"));
    dirs.push(sdlcDir);
    const payload = JSON.stringify({
      type: "approval_gate",
      taskId: "task-1",
      verdict: "approved",
      role: "engineer",
      checkpoint: "before-review",
      evidence: ["workspace"],
    });
    expect(recordLoopEventFromJson(payload, sdlcDir).skippedDuplicate).toBeUndefined();
    expect(recordLoopEventFromJson(payload, sdlcDir).skippedDuplicate).toBe(true);
    expect(readLoopEvents(sdlcDir)).toHaveLength(1);
  });
});
