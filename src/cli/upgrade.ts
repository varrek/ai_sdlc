import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadBase, loadOverlay } from "../core/loader.js";
import {
  detectConflicts,
  type OverlayConflict,
  type ProjectLock,
  serializeConflictReport,
  serializeProjectLock,
} from "../core/overlay.js";

export interface UpgradeOptions {
  /** Base tree at the currently pinned version. */
  oldBaseDir: string;
  /** Base tree at the version being upgraded to. */
  newBaseDir: string;
  /** Version string to pin on success (git ref / npm version). */
  newBaseVersion: string;
  /** Path to the project overlay (never written by upgrade). */
  overlayPath?: string;
  /** Defaults to `<sdlcDir>/project.lock`. */
  sdlcDir?: string;
}

export interface UpgradeResult {
  conflicts: OverlayConflict[];
  /** True only when the upgrade applied (no conflicts) and the lock advanced. */
  upgraded: boolean;
  lock?: ProjectLock;
  conflictReportPath?: string;
}

/**
 * Re-pin the base and replay the compile contract. On any overlay collision the
 * upgrade BLOCKS: it writes a conflict report for human resolution, leaves the
 * overlay byte-identical, and does not advance `project.lock`. With no
 * conflicts it advances the lock to the new version.
 */
export function runUpgrade(options: UpgradeOptions): UpgradeResult {
  const sdlcDir = options.sdlcDir ?? ".sdlc";
  const lockPath = join(sdlcDir, "project.lock");
  const conflictReportPath = join(sdlcDir, "upgrade-conflicts.yml");

  const oldBase = loadBase(options.oldBaseDir);
  const newBase = loadBase(options.newBaseDir);
  const overlay = loadOverlay(options.overlayPath);

  const conflicts = detectConflicts(oldBase, newBase, overlay);

  if (conflicts.length > 0) {
    writeFile(conflictReportPath, serializeConflictReport(conflicts));
    return { conflicts, upgraded: false, conflictReportPath };
  }

  // Clean a stale conflict report from a prior blocked upgrade.
  if (existsSync(conflictReportPath)) rmSync(conflictReportPath);

  const lock: ProjectLock = { version: 1, baseVersion: options.newBaseVersion };
  writeFile(lockPath, serializeProjectLock(lock));
  return { conflicts: [], upgraded: true, lock };
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}
