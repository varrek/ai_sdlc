import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readAcceptedLearnings,
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
});
