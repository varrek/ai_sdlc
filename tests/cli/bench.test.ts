import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBench } from "../../src/cli/bench.js";
import { repoId } from "../../src/eval/catalog.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("bench command", () => {
  it("prints selected repos in dry-run mode without cloning", () => {
    const root = tmpVerifyRoot();
    const catalogPath = writeCatalog(root);

    const result = runBench({
      seed: 42,
      count: 1,
      catalogPath,
      cacheDir: join(root, "repos"),
      reportDir: join(root, "reports"),
      baseDir: "sdlc-base",
      mode: "deterministic",
      dryRun: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("aisdlc bench dry-run");
    expect(result.output).toContain("owner/repo1@1111111111111111111111111111111111111111");
  });

  it("exits non-zero only for explicit fail-on classes", () => {
    const root = tmpVerifyRoot();
    const catalogPath = writeCatalog(root);

    const result = runBench({
      seed: 42,
      count: 1,
      catalogPath,
      cacheDir: join(root, "repos"),
      reportDir: join(root, "reports"),
      baseDir: "sdlc-base",
      mode: "deterministic",
      skipClone: true,
      failOnClasses: ["workflow-error"],
    });

    expect(result.exitCode).toBe(1);
    expect(result.report?.summary.failureClasses["workflow-error"]).toBe(1);
    expect(result.reportPath).toContain("eval-report.json");
  });

  it("continues and writes a report when per-repo setup throws", () => {
    const root = tmpVerifyRoot();
    const catalogPath = writeCatalog(root, 2);
    const git = fakeGitRunner();

    const result = runBench({
      seed: 42,
      count: 2,
      catalogPath,
      cacheDir: join(root, "repos"),
      reportDir: join(root, "reports"),
      baseDir: "sdlc-base",
      mode: "deterministic",
      git,
      setupRunner() {
        throw new Error("customize exploded token=secret");
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.report?.results).toHaveLength(2);
    expect(result.report?.summary.failureClasses["miner-bug"]).toBe(2);
    expect(result.report?.summary.slowestMaterialization?.ms).toBeGreaterThanOrEqual(0);
    expect(result.report?.results[0]!.failureMessage).toContain("token=<redacted>");
  });

  it("resumes from checkpoints without re-running completed repos", () => {
    const root = tmpVerifyRoot();
    const catalogPath = writeCatalog(root);
    const git = fakeGitRunner();

    runBench({
      seed: 42,
      count: 1,
      catalogPath,
      cacheDir: join(root, "repos"),
      reportDir: join(root, "reports"),
      baseDir: "sdlc-base",
      mode: "deterministic",
      git,
      setupRunner() {
        throw new Error("first run failed");
      },
    });

    let setupCalls = 0;
    const resumed = runBench({
      seed: 42,
      count: 1,
      catalogPath,
      cacheDir: join(root, "repos"),
      reportDir: join(root, "reports"),
      baseDir: "sdlc-base",
      mode: "deterministic",
      git,
      setupRunner() {
        setupCalls++;
        throw new Error("should not be called");
      },
    });

    expect(setupCalls).toBe(0);
    expect(resumed.report?.results).toHaveLength(1);
    expect(resumed.report?.summary.failureClasses["miner-bug"]).toBe(1);
  });

  it("reruns corrupt checkpoints instead of crashing the report", () => {
    const root = tmpVerifyRoot();
    const catalogPath = writeCatalog(root);
    const git = fakeGitRunner();

    const first = runBench({
      seed: 42,
      count: 1,
      catalogPath,
      cacheDir: join(root, "repos"),
      reportDir: join(root, "reports"),
      baseDir: "sdlc-base",
      mode: "deterministic",
      git,
      setupRunner() {
        throw new Error("first run failed");
      },
    });
    writeFileSync(first.report!.results[0]!.checkpointPath!, "{not-json", "utf8");

    let setupCalls = 0;
    const rerun = runBench({
      seed: 42,
      count: 1,
      catalogPath,
      cacheDir: join(root, "repos"),
      reportDir: join(root, "reports"),
      baseDir: "sdlc-base",
      mode: "deterministic",
      git,
      setupRunner() {
        setupCalls++;
        throw new Error("rerun failed");
      },
    });

    expect(setupCalls).toBe(1);
    expect(rerun.report?.summary.failureClasses["miner-bug"]).toBe(1);
  });
});

function tmpVerifyRoot(): string {
  mkdirSync(".verify", { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), ".verify", "bench-test-"));
  tmpDirs.push(dir);
  return dir;
}

function writeCatalog(root: string, count = 1): string {
  const entry = {
    owner: "owner",
    repo: "repo",
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    primaryLanguage: "TypeScript",
    toolTags: ["vitest"],
    sizeBand: "medium",
    catalogRevision: "test",
  };
  const repos = Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1);
    const repo = {
      ...entry,
      repo: `${entry.repo}${suffix}`,
      commit: `${suffix.repeat(40)}`.slice(0, 40),
    };
    return { ...repo, id: repoId(repo) };
  });
  const catalogPath = join(root, "catalog.json");
  writeFileSync(
    catalogPath,
    `${JSON.stringify({ catalogRevision: "test", repos }, null, 2)}\n`,
    "utf8",
  );
  return catalogPath;
}

function fakeGitRunner() {
  return {
    run(args: string[]) {
      if (args[0] === "clone") mkdirSync(args.at(-1)!, { recursive: true });
    },
  };
}
