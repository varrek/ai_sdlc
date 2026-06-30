import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { runCompileCli } from "../../src/cli/compile.js";
import { runCustomize } from "../../src/cli/customize.js";
import { runSmokeCli } from "../../src/cli/smoke.js";
import { PHASE_ORDER } from "../../src/customize/setup-state.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = resolve(here, "..", "..", "sdlc-base");
const repo = (name: string) => resolve(here, "..", "fixtures", "sample-repos", name);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

/**
 * A fresh project skeleton where every setup command shares one `.sdlc` phase
 * cache: overlay under `<root>/.sdlc/overlay`, compiled config + emitted manifest
 * under `<root>`, and `setup-state.yaml` at `<root>/.sdlc`.
 */
function project() {
  const root = mkdtempSync(join(tmpdir(), "aisdlc-chain-"));
  tmpDirs.push(root);
  const sdlcDir = join(root, ".sdlc");
  const overlayDir = join(sdlcDir, "overlay");
  const overlayPath = join(overlayDir, ".customize.yaml");
  return { root, sdlcDir, overlayDir, overlayPath };
}

function readPhases(sdlcDir: string): Record<string, { fingerprint: string }> {
  return parseYaml(readFileSync(join(sdlcDir, "setup-state.yaml"), "utf8")).phases;
}

describe("setup chain idempotency", () => {
  it("records all four phases and re-running the chain is a full no-op", () => {
    const { root, sdlcDir, overlayDir, overlayPath } = project();

    const c1 = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(c1.freshnessSkipped).toBe(false);
    const comp1 = runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
    expect(comp1.freshnessSkipped).toBe(false);
    const s1 = runSmokeCli({
      baseDir,
      overlayPath,
      configDir: root,
      sdlcDir,
      repoRoot: repo("python-rags"),
    });
    expect(s1.result.passed).toBe(true);
    expect(s1.setupReady).toBe(true);

    const phases = readPhases(sdlcDir);
    for (const phase of PHASE_ORDER) expect(phases[phase]?.fingerprint).toBeTruthy();

    // Second pass: every command short-circuits.
    expect(runCustomize({ repoRoot: repo("python-rags"), overlayDir }).freshnessSkipped).toBe(true);
    expect(runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir }).freshnessSkipped).toBe(
      true,
    );
    expect(
      runSmokeCli({ baseDir, overlayPath, configDir: root, sdlcDir, repoRoot: repo("python-rags") })
        .smokeFresh,
    ).toBe(true);
  });

  it("recompiles when the overlay changes and the prior emitted config is invalidated", () => {
    const { root, sdlcDir, overlayDir, overlayPath } = project();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
    runSmokeCli({ baseDir, overlayPath, configDir: root, sdlcDir, repoRoot: repo("python-rags") });

    // Bind an integration via the overlay → overlay fingerprint shifts.
    runCustomize({
      repoRoot: repo("python-rags"),
      overlayDir,
      answers: { "gitlab-server": "gitlab-mcp" },
    });
    const recompiled = runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
    expect(recompiled.freshnessSkipped).toBe(false);
    const s = runSmokeCli({
      baseDir,
      overlayPath,
      configDir: root,
      sdlcDir,
      repoRoot: repo("python-rags"),
    });
    expect(s.smokeFresh).toBe(false); // emitted config changed → prior smoke pass invalidated
  });

  it("first-run compile is stable with no project.lock and does not throw", () => {
    const { root, sdlcDir, overlayDir, overlayPath } = project();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(existsSync(join(sdlcDir, "project.lock"))).toBe(false);
    const first = runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
    expect(first.freshnessSkipped).toBe(false);
    expect(runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir }).freshnessSkipped).toBe(
      true,
    );
  });

  it("recompiles when the accepted hierarchy review artifact changes", () => {
    const { root, sdlcDir, overlayDir, overlayPath } = project();
    runCustomize({ repoRoot: repo("monorepo"), overlayDir });
    runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
    expect(existsSync(join(root, "packages/api/AGENTS.md"))).toBe(true);

    const hierarchyPath = join(overlayDir, "instruction-hierarchy.json");
    const hierarchy = JSON.parse(readFileSync(hierarchyPath, "utf8")) as {
      scopes: { accepted: boolean }[];
    };
    hierarchy.scopes.forEach((scope) => {
      scope.accepted = false;
    });
    writeFileSync(hierarchyPath, `${JSON.stringify(hierarchy, null, 2)}\n`, "utf8");

    const recompiled = runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });

    expect(recompiled.freshnessSkipped).toBe(false);
    expect(existsSync(join(root, "packages/api/AGENTS.md"))).toBe(false);
  });

  it("a base upgrade (project.lock change) makes smoke-passed stale even if the overlay is unchanged", () => {
    const { root, sdlcDir, overlayDir, overlayPath } = project();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
    runSmokeCli({ baseDir, overlayPath, configDir: root, sdlcDir, repoRoot: repo("python-rags") });

    // Pin a base version: the base hash now derives from the lock, shifting the
    // smoke-passed fingerprint even though the emitted config bytes are unchanged.
    writeFileSync(join(sdlcDir, "project.lock"), "version: 1\nbaseVersion: v2.0.0\n", "utf8");
    const s = runSmokeCli({
      baseDir,
      overlayPath,
      configDir: root,
      sdlcDir,
      repoRoot: repo("python-rags"),
    });
    expect(s.smokeFresh).toBe(false);
  });
});
