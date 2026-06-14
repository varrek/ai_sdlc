import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCustomize } from "../../src/cli/customize.js";
import { explainStandard } from "../../src/cli/explain.js";
import { buildStatus } from "../../src/cli/status.js";
import { buildStandardsIndex, evidenceCoverage } from "../../src/customize/emitters.js";
import { mineRepo } from "../../src/customize/repo-miner.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** A throwaway git repo with the given commit subjects (empty commits). */
function gitRepoWithCommits(subjects: string[]): string {
  const root = tmp("aisdlc-git-");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  git("commit", "--allow-empty", "-q", "-m", "root");
  for (const s of subjects) git("commit", "--allow-empty", "-q", "-m", s);
  // A source file so language/architecture mining has something to chew on.
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "index.ts"), "export const x = 1;\n");
  return root;
}

describe("U1 architecture mining", () => {
  it("maps modules under a root-level source layout and cites them as evidence", () => {
    const p = mineRepo(repo("python-rags"));
    expect(p.architecture).toBeDefined();
    expect(p.architecture!.modules).toContain("src");

    const arch = buildStandardsIndex(p).standards.find((s) =>
      s.statement.startsWith("Project architecture:"),
    );
    expect(arch).toBeDefined();
    expect(arch!.sources.length).toBeGreaterThan(0);
  });

  it("excludes known non-source dirs (tests/) from the module map", () => {
    const p = mineRepo(repo("python-rags"));
    expect(p.architecture!.modules).not.toContain("tests");
  });

  it("makes no architecture claim for a genuinely flat repo", () => {
    const p = mineRepo(repo("thin-poc"));
    expect(p.architecture).toBeUndefined();
  });
});

describe("U2 convention mining", () => {
  it("asserts Conventional Commits on a clear majority", () => {
    const root = gitRepoWithCommits([
      "feat: a",
      "fix: b",
      "docs: c",
      "chore: d",
      "refactor(core): e",
    ]);
    const p = mineRepo(root);
    expect(p.conventions?.commits).toBe("conventional");
    expect(p.evidence["convention:commits"]?.length).toBeGreaterThan(0);
  });

  it("does not assert a commit convention when the majority is non-conventional", () => {
    const root = gitRepoWithCommits([
      "feat: a",
      "wip stuff",
      "more stuff",
      "asdf",
      "another change",
    ]);
    expect(mineRepo(root).conventions?.commits).toBeUndefined();
  });

  it("does not borrow the enclosing repo's git history for a non-git subdir", () => {
    // thin-poc lives inside this (conventional-commit) repo but is not itself a
    // git root — mining must make no commit-convention claim.
    expect(mineRepo(repo("thin-poc")).conventions?.commits).toBeUndefined();
  });

  it("detects a separate tests/ layout", () => {
    expect(mineRepo(repo("python-rags")).conventions?.testLayout).toBe("separate");
  });

  it("detects a co-located test layout", () => {
    const root = tmp("aisdlc-colo-");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "thing.ts"), "export const t = 1;\n");
    writeFileSync(join(root, "src", "thing.test.ts"), "test('t', () => {});\n");
    expect(mineRepo(root).conventions?.testLayout).toBe("co-located");
  });
});

describe("U6 evidence coverage", () => {
  it("reports full coverage when every standard cites a source", () => {
    const cov = evidenceCoverage(buildStandardsIndex(mineRepo(repo("python-rags"))));
    expect(cov.total).toBeGreaterThan(0);
    expect(cov.covered).toBe(cov.total);
    expect(cov.uncited).toEqual([]);
  });
});

describe("U4 status (read-only)", () => {
  it("reports not-initialized before customize runs", () => {
    const overlayDir = join(tmp("aisdlc-status-"), "overlay");
    const report = buildStatus({ repoRoot: repo("python-rags"), overlayDir });
    expect(report.initialized).toBe(false);
  });

  it("reports initialized, standards, and coverage after customize", () => {
    const work = tmp("aisdlc-status2-");
    cpSync(repo("python-rags"), work, { recursive: true });
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });
    expect(report.initialized).toBe(true);
    expect(report.standards.length).toBeGreaterThan(0);
    expect(report.coverage.total).toBe(report.standards.length);
    expect(report.blockingGaps).toBeGreaterThanOrEqual(0);
  });
});

describe("U5 explain (read-only)", () => {
  it("prints the standard and its sources for an in-range number", () => {
    const work = tmp("aisdlc-explain-");
    cpSync(repo("python-rags"), work, { recursive: true });
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const res = explainStandard({ repoRoot: work, overlayDir, n: 1 });
    expect(res.ok).toBe(true);
    expect(res.message).toContain("Standard #1:");
    expect(res.message).toContain("Sources:");
  });

  it("fails cleanly for an out-of-range number", () => {
    const work = tmp("aisdlc-explain2-");
    cpSync(repo("python-rags"), work, { recursive: true });
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const res = explainStandard({ repoRoot: work, overlayDir, n: 9999 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("No standard #9999");
  });

  it("fails cleanly when the repo is not yet set up", () => {
    const overlayDir = join(tmp("aisdlc-explain3-"), "overlay");
    const res = explainStandard({ repoRoot: repo("python-rags"), overlayDir, n: 1 });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("customize");
  });
});
