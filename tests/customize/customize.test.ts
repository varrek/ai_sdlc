import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { runCustomize } from "../../src/cli/customize.js";
import { buildStandardsIndex, suggestTrack } from "../../src/customize/emitters.js";
import { computeGaps } from "../../src/customize/gap-interview.js";
import { mineRepo } from "../../src/customize/repo-miner.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function tmpOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-cust-"));
  tmpDirs.push(dir);
  return dir;
}

describe("repo miner", () => {
  it("detects framework, test runner, and linter on a Python repo with evidence", () => {
    const p = mineRepo(repo("python-rags"));
    expect(p.languages).toContain("python");
    expect(p.frameworks).toContain("fastapi");
    expect(p.testRunner).toBe("pytest");
    expect(p.linters).toContain("ruff");
    // standards cite real repo paths
    const index = buildStandardsIndex(p);
    const pytestStd = index.standards.find((s) => s.statement.includes("pytest"))!;
    expect(pytestStd.sources).toEqual(expect.arrayContaining(["pyproject.toml"]));
    expect(pytestStd.sources).toEqual(expect.arrayContaining(["Makefile"]));
  });

  it("ignores vendored/env dirs (venv/, __pycache__/)", () => {
    const p = mineRepo(repo("streamlit-venv"));
    expect(p.frameworks).toContain("streamlit");
    expect(p.fileCount).toBe(2); // app.py + requirements.txt only
    for (const paths of Object.values(p.evidence)) {
      for (const path of paths) {
        expect(path).not.toMatch(/venv|__pycache__/);
      }
    }
  });

  it("detects a non-Python stack (TS) — language-agnostic mining", () => {
    const p = mineRepo(repo("ts-app"));
    expect(p.languages).toContain("typescript");
    expect(p.testRunner).toBe("vitest");
    expect(p.linters).toContain("eslint");
  });

  it("suggests the Quick track for a thin POC and emits a minimal set", () => {
    const p = mineRepo(repo("thin-poc"));
    expect(suggestTrack(p)).toBe("quick");
    expect(buildStandardsIndex(p).standards).toHaveLength(0);
  });
});

describe("gap interview", () => {
  it("asks only for unanswered gaps", () => {
    const p = mineRepo(repo("python-rags")); // has a test runner -> test-command answered
    const gaps = computeGaps(p, { "gitlab-server": "gitlab-mcp" });
    const ids = gaps.map((g) => g.id);
    expect(ids).not.toContain("test-command"); // answerable from mining -> no prompt
    expect(ids).not.toContain("gitlab-server"); // answered explicitly
    expect(ids).toEqual(["jira-server"]); // exactly the one remaining gap
  });
});

describe("runCustomize", () => {
  it("emits a schema-valid overlay and reports interview gaps", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(result.ready).toBe(false); // gitlab/jira servers unanswered
    const raw = parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8"));
    expect(() => Overlay.parse(raw)).not.toThrow();
    expect(Overlay.parse(raw).defaultTrack).toBe("standard");
  });

  it("reports a drift delta on re-run instead of a silent rewrite", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const second = runCustomize({ repoRoot: repo("thin-poc"), overlayDir });
    expect(second.drift.changed).toBe(true);
    expect(second.drift.removed.length).toBeGreaterThan(0); // rags standards dropped
  });
});
