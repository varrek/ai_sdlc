import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { EMITTED_MANIFEST_PATH } from "../core/engine.js";
import { PROJECT_CONTEXT_FILE } from "../core/loader.js";
import { readProjectLock } from "../core/overlay.js";
import { fingerprint } from "../customize/setup-state.js";

/**
 * Stable hash of the base the config was compiled against. Prefer the pinned
 * `project.lock` baseVersion (cheap, exact) and fall back to a content hash of
 * the base directory on first run before any lock exists, so the `compiled`
 * fingerprint is stable even without a lock and a base upgrade always
 * invalidates downstream phases.
 */
export function baseFingerprint(baseDir: string, sdlcDir: string, packDirs: string[] = []): string {
  const lock = readProjectLock(join(sdlcDir, "project.lock"));
  const packParts = hashPackDirs(packDirs);
  if (lock) return fingerprint(["lock", lock.baseVersion, ...packParts]);
  return fingerprint(["dir", ...hashDir(baseDir), ...packParts]);
}

/**
 * Content of the overlay file folded with the sibling `project-context.json`, or
 * `""` when neither exists. Including the project context means a change to
 * per-package instructions, the codebase map, or exclusions invalidates the
 * `compiled` phase even when `.customize.yaml` itself is unchanged.
 */
export function overlayFingerprint(overlayPath: string | undefined): string {
  if (!overlayPath || !existsSync(overlayPath)) return fingerprint(["overlay", ""]);
  const overlay = readFileSync(overlayPath, "utf8");
  const ctxPath = join(dirname(overlayPath), PROJECT_CONTEXT_FILE);
  const ctx = existsSync(ctxPath) ? readFileSync(ctxPath, "utf8") : "";
  return fingerprint(["overlay", overlay, "project-context", ctx]);
}

/** `compiled` phase fingerprint: overlay content folded with the base hash. */
export function compiledFingerprint(overlayFp: string, baseFp: string): string {
  return fingerprint(["compiled", overlayFp, baseFp]);
}

/**
 * `smoke-passed` phase fingerprint: a hash of the emitted config files (read via
 * the engine's emitted manifest) folded with the base hash, so either a config
 * change (overlay → recompile) or a base upgrade invalidates a prior pass.
 */
export function emittedFingerprint(outDir: string, baseFp: string): string {
  const manifest = readEmittedFiles(outDir);
  const parts: string[] = ["smoke", baseFp];
  for (const rel of manifest) {
    parts.push(rel);
    const abs = join(outDir, rel);
    parts.push(existsSync(abs) ? readFileSync(abs, "utf8") : "<missing>");
  }
  return fingerprint(parts);
}

function readEmittedFiles(outDir: string): string[] {
  const abs = join(outDir, EMITTED_MANIFEST_PATH);
  if (!existsSync(abs)) return [];
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf8")) as { files?: unknown };
    if (Array.isArray(parsed.files)) {
      return parsed.files.filter((p): p is string => typeof p === "string").sort();
    }
  } catch {
    return [];
  }
  return [];
}

/** Sorted [relpath, content, ...] pairs for every file under `dir`. */
function hashDir(dir: string): string[] {
  const files: string[] = [];
  walk(dir, dir, files);
  return files;
}

function hashPackDirs(packDirs: string[]): string[] {
  const parts: string[] = [];
  for (const packDir of packDirs) {
    parts.push("pack", packDir, ...hashDir(packDir));
  }
  return parts;
}

function walk(root: string, current: string, out: string[]): void {
  const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const abs = join(current, entry.name);
    if (entry.isDirectory()) {
      walk(root, abs, out);
    } else if (entry.isFile()) {
      out.push(relative(root, abs), readFileSync(abs, "utf8"));
    }
  }
}
