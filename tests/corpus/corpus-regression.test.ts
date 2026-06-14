import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCompileCli } from "../../src/cli/compile.js";
import { runCustomize } from "../../src/cli/customize.js";
import { runSmokeCli } from "../../src/cli/smoke.js";
import { buildStatus } from "../../src/cli/status.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "..", "fixtures", "sample-repos");
const baseDir = resolve(here, "..", "..", "sdlc-base");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function copyFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `aisdlc-corpus-${name}-`));
  tmpDirs.push(root);
  cpSync(join(fixtures, name), root, { recursive: true });
  return root;
}

function runSetup(root: string) {
  const sdlcDir = join(root, ".sdlc");
  const overlayDir = join(sdlcDir, "overlay");
  const overlayPath = join(overlayDir, ".customize.yaml");
  runCustomize({ repoRoot: root, overlayDir, sdlcDir });
  runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
  const smoke = runSmokeCli({ baseDir, overlayPath, configDir: root, sdlcDir, repoRoot: root });
  const status = buildStatus({ repoRoot: root, overlayDir, sdlcDir, baseDir, outDir: root });
  const projectContext = JSON.parse(readFileSync(join(overlayDir, "project-context.json"), "utf8")) as {
    map: { path: string }[];
  };
  const standardsIndex = readFileSync(join(overlayDir, "standards-index.yaml"), "utf8");
  const architect = readFileSync(join(root, ".cursor", "agents", "architect.md"), "utf8");
  const constitution = readFileSync(join(root, "AGENTS.md"), "utf8");
  return { smoke, status, projectContext, standardsIndex, architect, constitution };
}

describe("semantic corpus regression", () => {
  it("keeps FastAPI tutorial docs out of confident architecture surfaces", () => {
    const root = copyFixture("fastapi-like");
    const { smoke, status, projectContext, architect, constitution } = runSetup(root);

    expect(smoke.setupReady).toBe(true);
    expect(status.setupReady).toBe(true);
    expect(status.alignmentReady).toBe(true);
    expect(status.architectureConfidence).toBe("high");
    expect(projectContext.map.map((entry) => entry.path).join("\n")).not.toContain("docs_src");
    expect(architect).toContain("## Deterministic project grounding");
    expect(architect).toContain("fastapi");
    expect(architect).not.toContain("docs_src");
    expect(constitution).not.toContain("docs_src");
  });

  it("keeps Vite playground packages out of primary map context", () => {
    const root = copyFixture("vite-like");
    const { smoke, status, projectContext, architect, constitution } = runSetup(root);

    expect(smoke.setupReady).toBe(true);
    expect(status.setupReady).toBe(true);
    expect(status.alignmentReady).toBe(true);
    expect(status.architectureConfidence).toBe("high");
    expect(projectContext.map.map((entry) => entry.path)).toEqual(["packages/vite"]);
    expect(architect).toContain("packages/vite");
    expect(constitution).not.toContain("playground");
  });

  it("treats ambiguous architecture as alignment risk instead of a confident map", () => {
    const root = copyFixture("ambiguous-architecture");
    const { status, projectContext, standardsIndex, architect } = runSetup(root);

    expect(status.architectureConfidence).toBe("low");
    expect(status.validButNeedsAttention).toBe(true);
    expect(status.alignmentReady).toBe(false);
    expect(projectContext.map).toEqual([]);
    expect(standardsIndex).toContain("confidence is low");
    expect(standardsIndex).not.toContain("Project architecture: modules");
    expect(architect).not.toContain("## Deterministic project grounding");
  });
});
