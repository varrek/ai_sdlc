import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HostId } from "../schema/index.js";
import type { AdapterRegistry } from "./adapter-registry.js";
import { serializeGapReport } from "./gap-report.js";
import { HOST_SETUP_GUIDE_PATH, renderHostSetupGuide } from "./host-setup-guidance.js";
import type { EmittedFile, Gap, NeutralModel } from "./types.js";

const GAP_REPORT_PATH = "portability.gap.yml";
const EMITTED_MANIFEST_PATH = ".sdlc/emitted.json";

export interface CompileOptions {
  outDir: string;
  /** Defaults to the hosts named in the model's manifest. */
  hosts?: HostId[];
  /** Optional additive extension pack directories, recorded for freshness checks. */
  packDirs?: string[];
}

export interface CompileResult {
  files: EmittedFile[];
  gaps: Gap[];
  /** Paths (relative to outDir) removed because they were orphaned since the last compile. */
  pruned: string[];
}

/**
 * Compile the neutral model to host-native config under `outDir`.
 *
 * Pure adapters return files+gaps; the engine sorts, writes, prunes orphaned
 * files from the previous compile, and records what it wrote. Two compiles of
 * an unchanged model produce byte-identical output (idempotent).
 */
export function compile(
  model: NeutralModel,
  registry: AdapterRegistry,
  options: CompileOptions,
): CompileResult {
  const hosts = options.hosts ?? model.manifest.hosts;

  const files: EmittedFile[] = [];
  const gaps: Gap[] = [];

  for (const host of hosts) {
    const adapter = registry.get(host);
    if (!adapter) {
      gaps.push({
        host,
        capability: "adapter",
        reason: `No adapter registered for host '${host}'.`,
      });
      continue;
    }
    const result = adapter.emit(model);
    files.push(...result.files);
    gaps.push(...result.gaps);
  }

  files.push({ path: HOST_SETUP_GUIDE_PATH, contents: renderHostSetupGuide(hosts, files, gaps) });
  files.push({ path: GAP_REPORT_PATH, contents: serializeGapReport(gaps) });

  const sortedFiles = sortFiles(dedupeFiles(files));
  const pruned = writeOutput(options.outDir, sortedFiles, options.hosts, options.packDirs);

  return { files: sortedFiles, gaps, pruned };
}

/** Detect two adapters writing different contents to the same path. */
function dedupeFiles(files: EmittedFile[]): EmittedFile[] {
  const byPath = new Map<string, EmittedFile>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (existing && existing.contents !== file.contents) {
      throw new Error(
        `Conflicting emit for '${file.path}': two adapters produced different contents.`,
      );
    }
    byPath.set(file.path, file);
  }
  return [...byPath.values()];
}

function sortFiles(files: EmittedFile[]): EmittedFile[] {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function writeOutput(
  outDir: string,
  files: EmittedFile[],
  hosts?: HostId[],
  packDirs?: string[],
): string[] {
  const previous = readEmittedManifest(outDir);
  const current = new Set(files.map((f) => f.path));

  for (const file of files) {
    const abs = join(outDir, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, normalizeTrailingNewline(file.contents), "utf8");
  }

  const pruned: string[] = [];
  for (const oldPath of previous) {
    if (oldPath === EMITTED_MANIFEST_PATH || current.has(oldPath)) continue;
    const abs = join(outDir, oldPath);
    if (existsSync(abs)) {
      rmSync(abs);
      pruned.push(oldPath);
    }
  }
  pruned.sort();

  writeEmittedManifest(outDir, [...current].sort(), hosts, packDirs);
  return pruned;
}

function normalizeTrailingNewline(contents: string): string {
  return contents.endsWith("\n") ? contents : `${contents}\n`;
}

function readEmittedManifest(outDir: string): string[] {
  const abs = join(outDir, EMITTED_MANIFEST_PATH);
  if (!existsSync(abs)) return [];
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf8")) as { files?: unknown };
    if (Array.isArray(parsed.files))
      return parsed.files.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
  return [];
}

function writeEmittedManifest(
  outDir: string,
  paths: string[],
  hosts?: HostId[],
  packDirs?: string[],
): void {
  const abs = join(outDir, EMITTED_MANIFEST_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  const manifest = {
    version: 1,
    files: paths,
    ...(hosts ? { hosts: [...hosts].sort() } : {}),
    ...(packDirs ? { packDirs } : {}),
  };
  writeFileSync(abs, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export { EMITTED_MANIFEST_PATH, GAP_REPORT_PATH };
