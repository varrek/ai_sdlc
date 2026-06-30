import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRegistry } from "../adapters/registry.js";
import { readAcceptedLearnings } from "../core/accepted-learnings.js";
import { type CompileResult, compile, EMITTED_MANIFEST_PATH } from "../core/engine.js";
import { HOST_SETUP_GUIDE_PATH } from "../core/host-setup-guidance.js";
import {
  loadBase,
  loadOverlay,
  loadProjectContext,
  projectContextPathFor,
} from "../core/loader.js";
import { mergeOverlay } from "../core/merge.js";
import { isPhaseFresh, readSetupState, writeSetupPhases } from "../customize/setup-state.js";
import type { HostId } from "../schema/index.js";
import { baseFingerprint, compiledFingerprint, overlayFingerprint } from "./phase-fingerprints.js";

export interface CompileCliOptions {
  baseDir: string;
  /** Optional additive extension pack directories, applied in the given order. */
  packDirs?: string[];
  overlayPath?: string;
  outDir: string;
  hosts?: HostId[];
  /** Phase-cache root. Defaults to `<outDir>/.sdlc`. */
  sdlcDir?: string;
  /** Recompile + re-record even when the inputs are unchanged. */
  force?: boolean;
}

export interface CompileCliResult {
  /** Present only when a compile actually ran (absent on a fresh skip). */
  result?: CompileResult;
  /** True when inputs were unchanged and compilation was skipped. */
  freshnessSkipped: boolean;
}

/**
 * Load base + overlay, merge, and compile to host-native config under outDir,
 * recording the `compiled` phase fingerprint (overlay content + base hash). When
 * the inputs are unchanged and the emitted manifest still exists, the compile is
 * skipped so a re-run of the setup chain is a no-op.
 */
export function runCompileCli(options: CompileCliOptions): CompileCliResult {
  const sdlcDir = options.sdlcDir ?? join(options.outDir, ".sdlc");
  const overlayFp = overlayFingerprint(options.overlayPath, sdlcDir);
  const baseFp = baseFingerprint(options.baseDir, sdlcDir, options.packDirs);
  const compiledFp = compiledFingerprint(overlayFp, baseFp, options.hosts);

  const artifactsPresent = compiledArtifactsPresent(options.outDir);
  const state = readSetupState(sdlcDir);
  if (!options.force && isPhaseFresh(state, "compiled", compiledFp, artifactsPresent)) {
    return { freshnessSkipped: true };
  }

  const result = runCompile(options);
  writeSetupPhases(sdlcDir, { compiled: compiledFp });
  return { result, freshnessSkipped: false };
}

/** Pure compile (no phase recording), reused by the smoke `--compile` path and tests. */
export function runCompile(options: CompileCliOptions): CompileResult {
  const base = loadBase(options.baseDir, options.packDirs);
  const overlay = loadOverlay(options.overlayPath);
  const projectContext = loadProjectContext(projectContextPathFor(options.overlayPath));
  const sdlcDir = options.sdlcDir ?? join(options.outDir, ".sdlc");
  const acceptedLearnings = readAcceptedLearnings(sdlcDir);
  const model = mergeOverlay(base, overlay, projectContext, acceptedLearnings);
  const registry = buildRegistry();
  return compile(model, registry, { outDir: options.outDir, hosts: options.hosts });
}

export function compiledArtifactsPresent(outDir: string): boolean {
  // The emitted manifest lives at `<outDir>/.sdlc/emitted.json`; its presence is
  // the primary artifact-existence guard for the `compiled` phase. Every path in
  // the manifest must still exist; otherwise generated runtime hooks can drift
  // while the phase cache claims compile is fresh.
  const manifestPath = join(outDir, EMITTED_MANIFEST_PATH);
  if (!existsSync(manifestPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return false;
    const files = parsed.files.filter((path): path is string => typeof path === "string");
    return (
      files.includes(HOST_SETUP_GUIDE_PATH) && files.every((path) => existsSync(join(outDir, path)))
    );
  } catch {
    return false;
  }
}
