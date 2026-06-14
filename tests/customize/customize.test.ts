import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { runCompileCli } from "../../src/cli/compile.js";
import { loadAnswersFile, runCustomize } from "../../src/cli/customize.js";
import { buildStandardsIndex, suggestTrack } from "../../src/customize/emitters.js";
import { computeGaps, DEFERRED_INTEGRATIONS } from "../../src/customize/gap-interview.js";
import { mineRepo } from "../../src/customize/repo-miner.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);
const baseDir = resolve(here, "..", "..", "sdlc-base");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function tmpOverlay(): string {
  // Return `<root>/overlay` so the setup-state cache (written to dirname) lands
  // in a unique per-test tmp root rather than a shared dir or a fixture.
  const root = mkdtempSync(join(tmpdir(), "aisdlc-cust-"));
  tmpDirs.push(root);
  return join(root, "overlay");
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

  it("does not mine its own emitted config (mining is stable across an in-repo compile)", () => {
    // Regression: real single-repo usage compiles SDLC config (.claude/, .cursor/,
    // AGENTS.md, …) into the repo root. A re-mine must ignore those generated
    // files, or language/track detection drifts and the mined fingerprint changes,
    // breaking freshness/idempotency.
    const work = mkdtempSync(join(tmpdir(), "aisdlc-pollute-"));
    tmpDirs.push(work);
    cpSync(repo("ts-app"), work, { recursive: true });

    const before = mineRepo(work);
    runCompileCli({ baseDir, overlayPath: undefined, outDir: work, sdlcDir: join(work, ".sdlc") });
    const after = mineRepo(work);

    expect(after.fileCount).toBe(before.fileCount);
    expect(after.languages).toEqual(before.languages);
    expect(suggestTrack(after)).toBe(suggestTrack(before));
  });
});

describe("test command mining", () => {
  it("records the Makefile recipe when no CI workflow defines tests", () => {
    const p = mineRepo(repo("python-rags"));
    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual(["Makefile"]);
  });

  it("records the package.json script when there is no CI or Makefile", () => {
    const p = mineRepo(repo("ts-app"));
    expect(p.testCommand).toBe("vitest run");
    expect(p.evidence["test-command"]).toEqual(["package.json"]);
  });

  it("prefers CI over package.json, skips non-test workflows, and normalizes && chains", () => {
    const p = mineRepo(repo("ci-repo"));
    // 01-lint.yml has no test step; 02-test.yml (lexicographically first with a
    // test step) wins over the package.json `vitest run` and 03-extra.yml.
    expect(p.testCommand).toBe("npm test");
    expect(p.evidence["test-command"]).toEqual([".github/workflows/02-test.yml"]);
  });

  it("falls back to an inferred runner default for a runner-only repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-runner-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "pyproject.toml"), "[tool.pytest.ini_options]\n", "utf8");
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "tests", "test_x.py"), "def test_x():\n    assert True\n", "utf8");
    const p = mineRepo(dir);
    expect(p.testRunner).toBe("pytest");
    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual(["pyproject.toml"]);
  });

  it("leaves testCommand undefined when there is no test signal", () => {
    const p = mineRepo(repo("thin-poc"));
    expect(p.testCommand).toBeUndefined();
  });
});

describe("gap interview", () => {
  it("closes the test-command gap from mining and defers integrations (no prompts)", () => {
    const p = mineRepo(repo("python-rags")); // mined test command closes the only blocking gap
    const gaps = computeGaps(p);
    expect(gaps).toEqual([]); // gitlab/jira are deferred, not blocking
    expect(DEFERRED_INTEGRATIONS).toEqual(["gitlab", "jira"]);
  });

  it("keeps the test-command gap open when no command can be mined", () => {
    const p = mineRepo(repo("thin-poc"));
    const gaps = computeGaps(p).map((g) => g.id);
    expect(gaps).toEqual(["test-command"]);
  });
});

describe("runCustomize", () => {
  it("reaches setup-ready with integrations deferred and a mined test command", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(result.ready).toBe(true); // no blocking gaps; gitlab/jira deferred
    expect(result.gaps).toEqual([]);
    expect(result.deferredIntegrations).toEqual(["gitlab", "jira"]);
    const raw = parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8"));
    expect(() => Overlay.parse(raw)).not.toThrow();
    const overlay = Overlay.parse(raw);
    expect(overlay.defaultTrack).toBe("standard");
    expect(overlay.interviewAnswers["test-command"]).toBe("pytest"); // persisted for the gate
  });

  it("keeps a repo NOT ready when no test command can be mined", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({ repoRoot: repo("thin-poc"), overlayDir });
    expect(result.ready).toBe(false);
    expect(result.gaps.map((g) => g.id)).toEqual(["test-command"]);
  });

  it("skips the overlay write on an unchanged re-run and records both phases", () => {
    const overlayDir = tmpOverlay();
    const first = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(first.freshnessSkipped).toBe(false);
    const overlayPath = join(overlayDir, ".customize.yaml");
    const firstWrite = readFileSync(overlayPath, "utf8");

    const state = parseYaml(readFileSync(join(overlayDir, "..", "setup-state.yaml"), "utf8"));
    expect(state.phases.mined?.fingerprint).toBeTruthy();
    expect(state.phases["overlay-written"]?.fingerprint).toBeTruthy();

    const second = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(second.freshnessSkipped).toBe(true);
    expect(readFileSync(overlayPath, "utf8")).toBe(firstWrite); // untouched
  });

  it("re-records overlay-written (mined stays fresh) when --answers-file adds a binding (AE4)", () => {
    const overlayDir = tmpOverlay();
    const statePath = join(overlayDir, "..", "setup-state.yaml");
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const minedBefore = parseYaml(readFileSync(statePath, "utf8")).phases.mined.fingerprint;

    const withAnswer = runCustomize({
      repoRoot: repo("python-rags"),
      overlayDir,
      answers: { "gitlab-server": "gitlab-mcp" },
    });
    expect(withAnswer.freshnessSkipped).toBe(false); // overlay changed -> not skipped
    const after = parseYaml(readFileSync(statePath, "utf8")).phases;
    expect(after.mined.fingerprint).toBe(minedBefore); // mining unchanged
    expect(after["overlay-written"].fingerprint).toBeTruthy();
    const overlay = Overlay.parse(parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8")));
    expect(overlay.integrations.gitlab?.serverId).toBe("gitlab-mcp");
  });

  it("rewrites when --force is set even if inputs are unchanged", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const forced = runCustomize({ repoRoot: repo("python-rags"), overlayDir, force: true });
    expect(forced.freshnessSkipped).toBe(false);
  });

  it("loadAnswersFile parses a YAML map and rejects non-string values", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-ans-"));
    tmpDirs.push(dir);
    const good = join(dir, "answers.yaml");
    writeFileSync(good, "gitlab-server: gitlab-mcp\njira-server: jira-mcp\n", "utf8");
    expect(loadAnswersFile(good)).toEqual({ "gitlab-server": "gitlab-mcp", "jira-server": "jira-mcp" });

    const bad = join(dir, "bad.yaml");
    writeFileSync(bad, "gitlab-server:\n  nested: true\n", "utf8");
    expect(() => loadAnswersFile(bad)).toThrow(/must be a string/);
    expect(() => loadAnswersFile(join(dir, "missing.yaml"))).toThrow();
  });

  it("reports a drift delta on re-run instead of a silent rewrite", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const second = runCustomize({ repoRoot: repo("thin-poc"), overlayDir });
    expect(second.drift.changed).toBe(true);
    expect(second.drift.removed.length).toBeGreaterThan(0); // rags standards dropped
  });

  it("binds integrations when interview answers supply them (and clears the deferred list)", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({
      repoRoot: repo("python-rags"),
      overlayDir,
      answers: { "gitlab-server": "gitlab-mcp", "jira-server": "jira-mcp" },
    });
    expect(result.ready).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.deferredIntegrations).toEqual([]); // both bound, nothing deferred
    const overlay = Overlay.parse(
      parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8")),
    );
    expect(overlay.integrations.gitlab?.serverId).toBe("gitlab-mcp");
    expect(overlay.integrations.jira?.serverId).toBe("jira-mcp");
  });

  it("preserves prior overlay edits (bindings + role model) on re-run", () => {
    const overlayDir = tmpOverlay();
    const first = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(first.ready).toBe(true); // setup-ready from the start; integrations deferred

    // User hand-edits the overlay: binds the servers and pins a role model.
    const path = join(overlayDir, ".customize.yaml");
    const edited = Overlay.parse(parseYaml(readFileSync(path, "utf8")));
    edited.interviewAnswers["gitlab-server"] = "gitlab-mcp";
    edited.integrations.jira = { serverId: "jira-mcp", allowedRoles: [] };
    edited.roleModels.engineer = "opus";
    writeFileSync(path, stringify(edited), "utf8");

    // Re-run with no new answers: prior edits must survive (prior-wins).
    const second = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(second.ready).toBe(true);
    expect(second.deferredIntegrations).toEqual([]); // both now bound
    const after = Overlay.parse(parseYaml(readFileSync(path, "utf8")));
    expect(after.integrations.gitlab?.serverId).toBe("gitlab-mcp");
    expect(after.integrations.jira?.serverId).toBe("jira-mcp");
    expect(after.roleModels.engineer).toBe("opus");
  });
});
