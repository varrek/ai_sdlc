import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type LoopBehaviorEvalResult,
  readLoopBehaviorEvalState,
  summarizeBehaviorEval,
  writeLoopBehaviorEvalState,
} from "../../src/eval/loop-behavior-eval-state.js";
import type { LoopScore } from "../../src/eval/loop-score.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-eval-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("loop behavior eval state", () => {
  it("returns undefined for missing eval state", () => {
    const dir = makeTempDir();
    const state = readLoopBehaviorEvalState(dir);
    expect(state).toBeUndefined();
  });

  it("writes and reads eval state", () => {
    const dir = makeTempDir();
    const mockScore: LoopScore = {
      passed: true,
      metrics: {
        expectedStages: 4,
        observedStages: 4,
        missingStages: [],
        replanCount: 0,
        approvalGateCount: 2,
        terminalStatus: "done",
      },
      violations: [],
    };
    const results: LoopBehaviorEvalResult[] = [
      {
        scenarioId: "test-scenario",
        passed: true,
        score: mockScore,
        evaluatedAt: "2026-06-29T12:00:00Z",
      },
    ];
    writeLoopBehaviorEvalState(dir, results);
    const state = readLoopBehaviorEvalState(dir);
    expect(state).toBeDefined();
    expect(state?.results).toHaveLength(1);
    expect(state?.results[0]?.scenarioId).toBe("test-scenario");
    expect(state?.results[0]?.passed).toBe(true);
  });

  it("validates result structure before accepting", () => {
    const dir = makeTempDir();
    const invalidResults = [{ scenarioId: "test", passed: true }];
    expect(() =>
      writeLoopBehaviorEvalState(dir, invalidResults as LoopBehaviorEvalResult[]),
    ).toThrow(/persisted result schema/);
    expect(existsSync(join(dir, "loop-behavior-eval.yaml"))).toBe(false);
    const state = readLoopBehaviorEvalState(dir);
    expect(state).toBeUndefined();
  });

  it("rejects scores with malformed metrics before writing", () => {
    const dir = makeTempDir();
    const invalidResults = [
      {
        scenarioId: "test",
        passed: true,
        score: { passed: true, metrics: {}, violations: [] },
        evaluatedAt: "2026-06-29T12:00:00Z",
      },
    ];

    expect(() =>
      writeLoopBehaviorEvalState(dir, invalidResults as LoopBehaviorEvalResult[]),
    ).toThrow(/persisted result schema/);
    expect(existsSync(join(dir, "loop-behavior-eval.yaml"))).toBe(false);
  });

  it("warns before treating invalid persisted state as not run", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "loop-behavior-eval.yaml"), "version: 1\nresults: nope\n", "utf8");
    const writes: string[] = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      expect(readLoopBehaviorEvalState(dir)).toBeUndefined();
    } finally {
      process.stderr.write = originalWrite;
    }
    expect(writes.join("")).toContain("is invalid");
  });

  it("summarizes not-run when state is undefined", () => {
    const summary = summarizeBehaviorEval(undefined);
    expect(summary).toEqual({
      state: "not-run",
      passed: 0,
      total: 0,
    });
  });

  it("summarizes passed when all scenarios pass", () => {
    const state = {
      version: 1 as const,
      results: [
        {
          scenarioId: "s1",
          passed: true,
          score: { passed: true } as LoopScore,
          evaluatedAt: "2026-06-29T12:00:00Z",
        },
        {
          scenarioId: "s2",
          passed: true,
          score: { passed: true } as LoopScore,
          evaluatedAt: "2026-06-29T12:00:00Z",
        },
      ],
      updatedAt: "2026-06-29T12:00:00Z",
    };
    const summary = summarizeBehaviorEval(state);
    expect(summary).toEqual({
      state: "passed",
      passed: 2,
      total: 2,
    });
  });

  it("summarizes failed when all scenarios fail", () => {
    const state = {
      version: 1 as const,
      results: [
        {
          scenarioId: "s1",
          passed: false,
          score: { passed: false } as LoopScore,
          evaluatedAt: "2026-06-29T12:00:00Z",
        },
        {
          scenarioId: "s2",
          passed: false,
          score: { passed: false } as LoopScore,
          evaluatedAt: "2026-06-29T12:00:00Z",
        },
      ],
      updatedAt: "2026-06-29T12:00:00Z",
    };
    const summary = summarizeBehaviorEval(state);
    expect(summary).toEqual({
      state: "failed",
      passed: 0,
      total: 2,
    });
  });

  it("summarizes partial when some scenarios pass", () => {
    const state = {
      version: 1 as const,
      results: [
        {
          scenarioId: "s1",
          passed: true,
          score: { passed: true } as LoopScore,
          evaluatedAt: "2026-06-29T12:00:00Z",
        },
        {
          scenarioId: "s2",
          passed: false,
          score: { passed: false } as LoopScore,
          evaluatedAt: "2026-06-29T12:00:00Z",
        },
      ],
      updatedAt: "2026-06-29T12:00:00Z",
    };
    const summary = summarizeBehaviorEval(state);
    expect(summary).toEqual({
      state: "partial",
      passed: 1,
      total: 2,
    });
  });
});
