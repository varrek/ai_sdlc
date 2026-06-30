import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoInventoryFingerprint } from "./miner-walk.js";
import { type MineOptions, mineRepo, type RepoProfile } from "./repo-miner.js";

const SNAPSHOT_FILE = ".mined-snapshot.json";

interface MinedSnapshot {
  inventoryFingerprint: string;
  profile: Omit<RepoProfile, "root">;
}

/** Load a cached profile when the repo inventory fingerprint still matches. */
export function loadMinedProfile(root: string, overlayDir: string): RepoProfile | undefined {
  const path = join(overlayDir, SNAPSHOT_FILE);
  if (!existsSync(path)) return undefined;
  try {
    const snap = JSON.parse(readFileSync(path, "utf8")) as MinedSnapshot;
    if (snap.inventoryFingerprint !== repoInventoryFingerprint(root)) return undefined;
    return { ...snap.profile, root };
  } catch {
    return undefined;
  }
}

/** Persist the mined profile for read-only status/inspect paths. */
export function saveMinedProfile(root: string, overlayDir: string, profile: RepoProfile): void {
  const { root: _root, ...rest } = profile;
  const snap: MinedSnapshot = {
    inventoryFingerprint: repoInventoryFingerprint(root),
    profile: rest,
  };
  const path = join(overlayDir, SNAPSHOT_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snap), "utf8");
}

export interface AcquireMinedProfileOptions {
  repoRoot: string;
  overlayDir: string;
  force?: boolean;
  refresh?: boolean;
  mineOptions?: MineOptions;
}

/** Mine the repo or reuse a persisted snapshot when allowed. */
export function acquireMinedProfile(options: AcquireMinedProfileOptions): RepoProfile {
  if (!options.force && !options.refresh) {
    const cached = loadMinedProfile(options.repoRoot, options.overlayDir);
    if (cached) return cached;
  }
  return mineRepo(options.repoRoot, options.mineOptions);
}
