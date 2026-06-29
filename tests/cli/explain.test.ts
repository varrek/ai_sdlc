import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCustomize } from "../../src/cli/customize.js";
import { explainClaim, explainStandard } from "../../src/cli/explain.js";

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

function setupRepo(name: string): { repoRoot: string; overlayDir: string } {
  const work = tmp(`aisdlc-explain-${name}-`);
  cpSync(repo(name), work, { recursive: true });
  const overlayDir = join(work, ".sdlc", "overlay");
  runCustomize({ repoRoot: work, overlayDir });
  return { repoRoot: work, overlayDir };
}

describe("explain claim keys", () => {
  it("explains test-command with positive evidence for a ready repo", () => {
    const { repoRoot, overlayDir } = setupRepo("python-rags");

    const res = explainClaim({ repoRoot, overlayDir, key: "test-command" });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("Claim: test-command");
    expect(res.message).toMatch(/Value: `pytest`/);
    expect(res.message).toContain("Positive evidence:");
    expect(res.message).toContain("pyproject.toml");
  });

  it("explains architecture with demoted roots as negative evidence", () => {
    const { repoRoot, overlayDir } = setupRepo("fastapi-like");

    const res = explainClaim({ repoRoot, overlayDir, key: "architecture" });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("Claim: architecture");
    expect(res.message).toContain("Confidence: high");
    expect(res.message).toContain("docs_src");
    expect(res.message).toContain("Negative evidence:");
    expect(res.message).toContain("demoted");
  });

  it("explains low-confidence architecture with uncertainty signals", () => {
    const { repoRoot, overlayDir } = setupRepo("ambiguous-architecture");

    const res = explainClaim({ repoRoot, overlayDir, key: "architecture" });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("Confidence: low");
    expect(res.message).toContain("Negative evidence:");
  });

  it("reports an open test-command gap with negative evidence", () => {
    const work = tmp("aisdlc-explain-gap-");
    cpSync(repo("thin-poc"), work, { recursive: true });
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const res = explainClaim({ repoRoot: work, overlayDir, key: "test-command" });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("gap open");
    expect(res.message).toContain("Negative evidence:");
    expect(res.message).toContain("No CI-mined or manifest-derived test command was resolved.");
  });

  it("fails cleanly when the repo is not yet set up", () => {
    const overlayDir = join(tmp("aisdlc-explain-uninit-"), "overlay");

    const res = explainClaim({ repoRoot: repo("python-rags"), overlayDir, key: "test-command" });

    expect(res.ok).toBe(false);
    expect(res.message).toContain("customize");
  });

  it("preserves numeric explain behavior", () => {
    const { repoRoot, overlayDir } = setupRepo("python-rags");

    const res = explainStandard({ repoRoot, overlayDir, n: 1 });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("Standard #1:");
    expect(res.message).toContain("Sources:");
  });

  it("reports no architecture map for a genuinely flat repo", () => {
    const { repoRoot, overlayDir } = setupRepo("thin-poc");

    const res = explainClaim({ repoRoot, overlayDir, key: "architecture" });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("no architecture map");
  });
});
