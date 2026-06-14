import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildRegistry } from "../adapters/registry.js";
import { compile, type CompileResult } from "../core/engine.js";
import { loadBase, loadOverlay, loadProjectContext, projectContextPathFor } from "../core/loader.js";
import { mergeOverlay } from "../core/merge.js";
import { isPhaseFresh, readSetupState, writeSetupPhases } from "../customize/setup-state.js";
import type { HostId } from "../schema/index.js";
import { baseFingerprint, compiledFingerprint, overlayFingerprint } from "./phase-fingerprints.js";

export interface CompileCliOptions {
  baseDir: string;
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
  const overlayFp = overlayFingerprint(options.overlayPath);
  const baseFp = baseFingerprint(options.baseDir, sdlcDir);
  const compiledFp = compiledFingerprint(overlayFp, baseFp);

  const manifestPresent = manifestExists(options.outDir);
  const state = readSetupState(sdlcDir);
  if (!options.force && isPhaseFresh(state, "compiled", compiledFp, manifestPresent)) {
    return { freshnessSkipped: true };
  }

  const result = runCompile(options);
  writeSetupPhases(sdlcDir, { compiled: compiledFp });
  return { result, freshnessSkipped: false };
}

/** Pure compile (no phase recording), reused by the smoke `--compile` path and tests. */
export function runCompile(options: CompileCliOptions): CompileResult {
  const base = loadBase(options.baseDir);
  const overlay = loadOverlay(options.overlayPath);
  const projectContext = loadProjectContext(projectContextPathFor(options.overlayPath));
  const model = mergeOverlay(base, overlay, projectContext);
  const registry = buildRegistry();
  return compile(model, registry, { outDir: options.outDir, hosts: options.hosts });
}

function manifestExists(outDir: string): boolean {
  // The emitted manifest lives at `<outDir>/.sdlc/emitted.json`; its presence is
  // the artifact-existence guard for the `compiled` phase.
  return existsSync(join(outDir, ".sdlc", "emitted.json"));
}
