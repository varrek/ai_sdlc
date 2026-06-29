import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type OverlaySnapshot,
  runGenericSetupChain,
  runSetupChain,
  type SetupArtifacts,
} from "../../src/eval/setup-chain.js";

const here = dirname(fileURLToPath(import.meta.url));

export const fixturesDir = resolve(here, "..", "fixtures", "sample-repos");
export const baseDir = resolve(here, "..", "..", "sdlc-base");

export type { OverlaySnapshot, SetupArtifacts };

const tmpDirs: string[] = [];

export function copyFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `aisdlc-corpus-${name}-`));
  tmpDirs.push(root);
  cpSync(join(fixturesDir, name), root, { recursive: true });
  return root;
}

export function cleanupCorpusTempDirs(): void {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
}

/** Architect body excluding accepted learnings — demoted paths may appear only there. */
export function architectPrimaryGuidance(architectBody: string): string {
  const marker = "## Accepted project learnings";
  const idx = architectBody.indexOf(marker);
  return idx >= 0 ? architectBody.slice(0, idx) : architectBody;
}

export function runSetup(root: string): SetupArtifacts {
  return runSetupChain(root, { baseDir });
}

/**
 * Generic baseline: compile the base SDLC into a fixture copy without running
 * `/customize`, so guidance lacks mined map rows, standards, and grounding.
 */
export function runGenericSetup(root: string): SetupArtifacts {
  return runGenericSetupChain(root, { baseDir });
}
