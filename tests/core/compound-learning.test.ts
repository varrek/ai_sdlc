import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAcceptedLearnings } from "../../src/core/accepted-learnings.js";
import {
  acceptPendingLearning,
  listPendingLearnings,
  proposeCompoundLearning,
  rejectPendingLearning,
} from "../../src/core/compound-learning.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function sdlcDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "compound-learning-"));
  tmpDirs.push(dir);
  return dir;
}

describe("compound-learning", () => {
  it("proposes pending learning with evidence", () => {
    const dir = sdlcDir();
    const entry = proposeCompoundLearning(dir, "Use npm test", ["package.json"], {
      surface: "global",
    });
    expect(entry.surface).toBe("global");
    expect(listPendingLearnings(dir)).toHaveLength(1);
  });

  it("rejects proposals without evidence", () => {
    const dir = sdlcDir();
    expect(() => proposeCompoundLearning(dir, "no evidence", [])).toThrow(/evidence/i);
  });

  it("accept promotes to accepted learnings ledger", () => {
    const dir = sdlcDir();
    const entry = proposeCompoundLearning(dir, "Tester runs vitest", ["package.json"], {
      surface: "role",
      role: "tester",
    });
    const accepted = acceptPendingLearning(dir, entry.key);
    expect(accepted?.kind).toBe("compound-correction");
    expect(readAcceptedLearnings(dir)).toHaveLength(1);
    expect(listPendingLearnings(dir)).toHaveLength(0);
  });

  it("reject removes pending entry", () => {
    const dir = sdlcDir();
    const entry = proposeCompoundLearning(dir, "Domain note", ["src/auth.ts"], {
      surface: "domain",
      domainPath: ".sdlc/domain-docs/auth.md",
    });
    expect(rejectPendingLearning(dir, entry.key)).toBe(true);
    expect(listPendingLearnings(dir)).toHaveLength(0);
  });
});
