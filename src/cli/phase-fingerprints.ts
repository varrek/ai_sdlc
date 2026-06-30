import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { acceptedLearningsPath } from "../core/accepted-learnings.js";
import { EMITTED_MANIFEST_PATH } from "../core/engine.js";
import { PROJECT_CONTEXT_FILE } from "../core/loader.js";
import { readProjectLock } from "../core/overlay.js";
import { fingerprint } from "../customize/setup-state.js";
import type { HostId } from "../schema/index.js";

/**
 * Bump when compiler/adapters emit materially different files for the same base
 * and overlay. This prevents package upgrades from reusing stale generated
 * host config just because project inputs did not change.
 */
export const COMPILE_EMITTER_VERSION = "native-host-setup-v2";

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
 * Content of the overlay file folded with the sibling `project-context.json` and
 * accepted learnings ledger. Including these derived inputs means changes to
 * role-grounding context invalidate `compiled` even when `.customize.yaml` itself
 * is unchanged.
 */
export function overlayFingerprint(overlayPath: string | undefined, sdlcDir?: string): string {
  const overlay = overlayPath && existsSync(overlayPath) ? readFileSync(overlayPath, "utf8") : "";
  const overlayDir = overlayPath ? dirname(overlayPath) : undefined;
  const ctxPath = overlayDir ? join(overlayDir, PROJECT_CONTEXT_FILE) : undefined;
  const ctx = ctxPath && existsSync(ctxPath) ? readFileSync(ctxPath, "utf8") : "";
  const learningsPath = sdlcDir ? acceptedLearningsPath(sdlcDir) : "";
  const learnings =
    learningsPath && existsSync(learningsPath) ? readFileSync(learningsPath, "utf8") : "";
  return fingerprint(["overlay", overlay, "project-context", ctx, "accepted-learnings", learnings]);
}

/** `compiled` phase fingerprint: project inputs plus emitter semantics. */
export function compiledFingerprint(overlayFp: string, baseFp: string, hosts?: HostId[]): string {
  return fingerprint([
    "compiled",
    COMPILE_EMITTER_VERSION,
    overlayFp,
    baseFp,
    hostSelectionFingerprint(hosts),
  ]);
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

function hostSelectionFingerprint(hosts: HostId[] | undefined): string {
  return hosts ? `hosts:${[...hosts].sort().join(",")}` : "hosts:default";
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
