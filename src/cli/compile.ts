import { buildRegistry } from "../adapters/registry.js";
import { compile, type CompileResult } from "../core/engine.js";
import { loadBase, loadOverlay } from "../core/loader.js";
import { mergeOverlay } from "../core/merge.js";
import type { HostId } from "../schema/index.js";

export interface CompileCliOptions {
  baseDir: string;
  overlayPath?: string;
  outDir: string;
  hosts?: HostId[];
}

/** Load base + overlay, merge, and compile to host-native config under outDir. */
export function runCompile(options: CompileCliOptions): CompileResult {
  const base = loadBase(options.baseDir);
  const overlay = loadOverlay(options.overlayPath);
  const model = mergeOverlay(base, overlay);
  const registry = buildRegistry();
  return compile(model, registry, { outDir: options.outDir, hosts: options.hosts });
}
