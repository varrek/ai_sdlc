import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptedLearningFromGateOutcome,
  acceptedLearningFromTestCorrection,
  readAcceptedLearnings,
  upsertGateOutcomeLearning,
  upsertTestCorrectionLearning,
  upsertAcceptedLearning,
  writeAcceptedLearnings,
} from "../../src/core/accepted-learnings.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function sdlc(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-learn-"));
  tmpDirs.push(dir);
  return dir;
}

describe("accepted learnings ledger", () => {
  it("upserts by key and sorts on read", () => {
    const dir = sdlc();
    upsertAcceptedLearning(dir, {
      key: "test-command",
      kind: "test-command",
      claim: "Accepted test command: `npm test`",
      sources: ["package.json"],
      provenance: "miner",
    });
    upsertAcceptedLearning(dir, {
      key: "architecture:docs",
      kind: "architecture-demotion",
      claim: "Do not treat `docs` as primary source — demoted during mining.",
      sources: ["reason"],
      provenance: "miner",
    });

    expect(readAcceptedLearnings(dir).map((entry) => entry.key)).toEqual([
      "architecture:docs",
      "test-command",
    ]);
  });

  it("replaces an existing key on upsert", () => {
    const dir = sdlc();
    upsertAcceptedLearning(dir, {
      key: "test-command",
      kind: "test-command",
      claim: "Accepted test command: `npm test`",
      sources: [],
      provenance: "miner",
    });
    upsertAcceptedLearning(dir, {
      key: "test-command",
      kind: "test-command",
      claim: "Accepted test command: `pnpm test`",
      sources: ["package.json"],
      provenance: "interview",
    });

    const entries = readAcceptedLearnings(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.claim).toContain("pnpm test");
    expect(entries[0]?.provenance).toBe("interview");
  });

  it("tolerates corrupt lines when reading", () => {
    const dir = sdlc();
    writeAcceptedLearnings(dir, [
      {
        key: "test-command",
        kind: "test-command",
        claim: "Accepted test command: `npm test`",
        sources: [],
        provenance: "miner",
      },
    ]);
    appendFileSync(
      join(dir, "memory", "accepted-learnings.jsonl"),
      '{"key":"broken",\n',
      "utf8",
    );
    writeAcceptedLearnings(dir, [
      ...readAcceptedLearnings(dir),
      {
        key: "architecture:docs",
        kind: "architecture-demotion",
        claim: "Do not treat `docs` as primary source — demoted during mining.",
        sources: [],
        provenance: "miner",
      },
    ]);

    expect(readAcceptedLearnings(dir).map((entry) => entry.key)).toEqual([
      "architecture:docs",
      "test-command",
    ]);
  });

  it("promotes gate outcomes into keyed loop learnings", () => {
    const dir = sdlc();
    const outcome = {
      taskId: "task-123",
      verdict: "changes-requested" as const,
      scope: "src/eval/loop-score.ts",
      reason: "Reviewer requested stricter gate ordering.",
    };

    const entry = acceptedLearningFromGateOutcome(outcome);
    upsertGateOutcomeLearning(dir, outcome);
    upsertGateOutcomeLearning(dir, outcome);

    expect(entry.kind).toBe("review-finding");
    expect(entry.claim).toContain("requested changes");
    expect(entry.provenance).toBe("gate");
    expect(readAcceptedLearnings(dir)).toEqual([entry]);
  });

  it("maps approved and blocked gate outcomes to distinct learning kinds", () => {
    const approved = acceptedLearningFromGateOutcome({
      taskId: "task-123",
      verdict: "approved",
      scope: "src/eval/loop-score.ts",
      reason: "Reviewer accepted the bounded gate checks.",
    });
    const blocked = acceptedLearningFromGateOutcome({
      taskId: "task-123",
      verdict: "blocked",
      scope: "src/eval/loop-score.ts",
      reason: "CI residual was not resolved.",
    });

    expect(approved.kind).toBe("gate-approval");
    expect(approved.claim).toContain("approved");
    expect(blocked.kind).toBe("bench-residual");
    expect(blocked.claim).toContain("blocked");
  });

  it("promotes test corrections into keyed loop learnings", () => {
    const dir = sdlc();
    const correction = {
      taskId: "task-123",
      scope: "tests/eval/loop-score.test.ts",
      reason: "Add missing stuck terminal coverage.",
      sources: ["tests/eval/loop-score.test.ts"],
    };

    const entry = acceptedLearningFromTestCorrection(correction);
    upsertTestCorrectionLearning(dir, correction);

    expect(entry.kind).toBe("test-correction");
    expect(readAcceptedLearnings(dir)).toEqual([entry]);
  });
});
