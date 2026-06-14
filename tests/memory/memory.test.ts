import { appendFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendGateOutcome,
  readGateHistory,
  readStandardsDeltas,
  recordStandardsDelta,
} from "../../src/core/memory.js";
import { stagesForTrack } from "../../src/customize/emitters.js";

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
    expect(stagesForTrack("full")).toEqual(["architect", "engineer", "reviewer", "wrap-up"]);
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
    appendFileSync(join(dir, "gate_history", "outcomes.jsonl"), '{"taskId":"T-2","verdict":\n', "utf8");
    appendGateOutcome(dir, { taskId: "T-3", verdict: "blocked", scope: "b", reason: "no" });

    const history = readGateHistory(dir);
    expect(history.map((h) => h.taskId)).toEqual(["T-1", "T-3"]);
  });
});
