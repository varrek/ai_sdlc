import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ExternalRepoEntry, repoId } from "../../src/eval/catalog.js";
import {
  assertContainedPath,
  cacheEntryHash,
  type GitRunner,
  materializeRepo,
} from "../../src/eval/repo-cache.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("repo cache", () => {
  it("uses an injectable git runner and reuses matching cache entries", () => {
    const cacheDir = tmp("aisdlc-cache-");
    const calls: string[][] = [];
    const git: GitRunner = {
      run(args) {
        calls.push(args);
        if (args[0] === "clone") mkdirSync(args.at(-1)!, { recursive: true });
      },
    };

    const first = materializeRepo(options(cacheDir, git));
    const second = materializeRepo(options(cacheDir, git));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.reused).toBe(true);
    expect(calls.filter((args) => args[0] === "clone")).toHaveLength(1);
  });

  it("fails closed when skip-clone is used on a cache miss", () => {
    const cacheDir = tmp("aisdlc-cache-miss-");

    const result = materializeRepo({ ...options(cacheDir, { run() {} }), skipClone: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failureClass).toBe("workflow-error");
  });

  it("rejects paths outside the allowed root", () => {
    expect(() => assertContainedPath("/tmp/allowed", "/tmp/other")).toThrow(/must stay under/);
  });

  it("rejects outbound symlinks in cloned repos", () => {
    const cacheDir = tmp("aisdlc-cache-symlink-");
    const target = join(tmp("aisdlc-symlink-target-"), "secret.txt");
    writeFileSync(target, "secret", "utf8");
    const git: GitRunner = {
      run(args) {
        if (args[0] !== "clone") return;
        const root = args.at(-1)!;
        mkdirSync(root, { recursive: true });
        symlinkSync(target, join(root, "escape"));
      },
    };

    const result = materializeRepo(options(cacheDir, git));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("outbound symlink");
    expect(existsSync(cacheDir)).toBe(true);
  });

  it("returns a structured failure for dangling symlinks in cloned repos", () => {
    const cacheDir = tmp("aisdlc-cache-dangling-symlink-");
    const git: GitRunner = {
      run(args) {
        if (args[0] !== "clone") return;
        const root = args.at(-1)!;
        mkdirSync(root, { recursive: true });
        symlinkSync(join(root, "missing-target"), join(root, "dangling"));
      },
    };

    const result = materializeRepo(options(cacheDir, git));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureClass).toBe("workflow-error");
      expect(result.message).toContain("symlink scan failed");
    }
  });

  it("allows callers to lower the symlink scan limit for scale classification tests", () => {
    const cacheDir = tmp("aisdlc-cache-limit-");
    const git: GitRunner = {
      run(args) {
        if (args[0] !== "clone") return;
        const root = args.at(-1)!;
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "one.txt"), "one", "utf8");
        writeFileSync(join(root, "src", "two.txt"), "two", "utf8");
      },
    };

    const result = materializeRepo({ ...options(cacheDir, git), symlinkScanLimit: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureClass).toBe("scale-timeout");
      expect(result.message).toContain("symlink scan entry limit");
    }
  });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function options(cacheDir: string, git: GitRunner) {
  const entry: ExternalRepoEntry = {
    owner: "owner",
    repo: "repo",
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    primaryLanguage: "TypeScript",
    toolTags: [],
    sizeBand: "medium",
    catalogRevision: "test",
    id: "owner/repo@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  expect(entry.id).toBe(repoId(entry));
  return {
    cacheDir,
    entry,
    catalogEntryHash: cacheEntryHash(entry),
    baseFingerprint: "base",
    git,
  };
}
