import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { EMITTED_MANIFEST_PATH } from "../core/engine.js";
import { readProjectLock } from "../core/overlay.js";
import { fingerprint } from "../customize/setup-state.js";

/**
 * Stable hash of the base the config was compiled against. Prefer the pinned
 * `project.lock` baseVersion (cheap, exact) and fall back to a content hash of
 * the base directory on first run before any lock exists, so the `compiled`
 * fingerprint is stable even without a lock and a base upgrade always
 * invalidates downstream phases.
 */
export function baseFingerprint(baseDir: string, sdlcDir: string): string {
  const lock = readProjectLock(join(sdlcDir, "project.lock"));
  if (lock) return fingerprint(["lock", lock.baseVersion]);
  return fingerprint(["dir", ...hashDir(baseDir)]);
}

/** Content of the overlay file, or `""` when none exists yet. */
export function overlayFingerprint(overlayPath: string | undefined): string {
  if (!overlayPath || !existsSync(overlayPath)) return fingerprint(["overlay", ""]);
  return fingerprint(["overlay", readFileSync(overlayPath, "utf8")]);
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
