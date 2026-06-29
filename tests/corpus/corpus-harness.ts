import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { runCompileCli } from "../../src/cli/compile.js";
import { runCustomize } from "../../src/cli/customize.js";
import { runSmokeCli } from "../../src/cli/smoke.js";
import { buildStatus, type StatusReport } from "../../src/cli/status.js";
import type { ProjectContext } from "../../src/core/project-context.js";
import type { SmokeCliResult } from "../../src/cli/smoke.js";

const here = dirname(fileURLToPath(import.meta.url));

export const fixturesDir = resolve(here, "..", "fixtures", "sample-repos");
export const baseDir = resolve(here, "..", "..", "sdlc-base");

export interface OverlaySnapshot {
  interviewAnswers: Record<string, string>;
  gapClosureProvenance: Record<string, string>;
}

export interface SetupArtifacts {
  smoke: SmokeCliResult;
  status: StatusReport;
  projectContext: ProjectContext;
  standardsIndex: string;
  architect: string;
  constitution: string;
  overlay: OverlaySnapshot;
}

const tmpDirs: string[] = [];

/** Register a temp dir for cleanup via `cleanupCorpusTempDirs`. */
export function copyFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `aisdlc-corpus-${name}-`));
  tmpDirs.push(root);
  cpSync(join(fixturesDir, name), root, { recursive: true });
  return root;
}

export function cleanupCorpusTempDirs(): void {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
}

export function runSetup(root: string): SetupArtifacts {
  const sdlcDir = join(root, ".sdlc");
  const overlayDir = join(sdlcDir, "overlay");
  const overlayPath = join(overlayDir, ".customize.yaml");
  runCustomize({ repoRoot: root, overlayDir, sdlcDir });
  runCompileCli({ baseDir, overlayPath, outDir: root, sdlcDir });
  const smoke = runSmokeCli({ baseDir, overlayPath, configDir: root, sdlcDir, repoRoot: root });
  const status = buildStatus({ repoRoot: root, overlayDir, sdlcDir, baseDir, outDir: root });
  const projectContext = JSON.parse(
    readFileSync(join(overlayDir, "project-context.json"), "utf8"),
  ) as ProjectContext;
  const standardsIndex = readFileSync(join(overlayDir, "standards-index.yaml"), "utf8");
  const architect = readFileSync(join(root, ".cursor", "agents", "architect.md"), "utf8");
  const constitution = readFileSync(join(root, "AGENTS.md"), "utf8");
  const overlayRaw = YAML.parse(readFileSync(overlayPath, "utf8")) as {
    interviewAnswers?: Record<string, string>;
    gapClosureProvenance?: Record<string, string>;
  };
  const overlay: OverlaySnapshot = {
    interviewAnswers: overlayRaw.interviewAnswers ?? {},
    gapClosureProvenance: overlayRaw.gapClosureProvenance ?? {},
  };
  return { smoke, status, projectContext, standardsIndex, architect, constitution, overlay };
}
