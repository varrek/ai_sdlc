import { buildRegistry } from "../adapters/registry.js";
import { compile } from "../core/engine.js";
import { loadBase, loadOverlay } from "../core/loader.js";
import { mergeOverlay } from "../core/merge.js";
import { runSmoke, smokeExitCode, type SmokeResult } from "../smoke/harness.js";

export interface SmokeCliOptions {
  baseDir: string;
  overlayPath?: string;
  /** Directory to compile into and validate. */
  configDir: string;
  /** When true, (re)compile before validating. */
  compileFirst?: boolean;
}

export interface SmokeCliResult {
  result: SmokeResult;
  exitCode: number;
}

/** Compile (optionally) then run the smoke gate against the generated config. */
export function runSmokeCli(options: SmokeCliOptions): SmokeCliResult {
  const model = mergeOverlay(loadBase(options.baseDir), loadOverlay(options.overlayPath));
  if (options.compileFirst) {
    compile(model, buildRegistry(), { outDir: options.configDir });
  }
  const result = runSmoke({ model, configDir: options.configDir });
  return { result, exitCode: smokeExitCode(result) };
}
