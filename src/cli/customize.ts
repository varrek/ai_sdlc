import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  buildOverlay,
  buildStandardsIndex,
  diffStandardsIndex,
  serializeOverlay,
  serializeStandardsIndex,
  suggestTrack,
  type StandardsDrift,
  type StandardsIndex,
} from "../customize/emitters.js";
import { computeGaps, type GapQuestion } from "../customize/gap-interview.js";
import { mineRepo, type RepoProfile } from "../customize/repo-miner.js";
import type { CeremonyTrack } from "../schema/index.js";

export interface CustomizeOptions {
  repoRoot: string;
  /** Defaults to `<repoRoot>/.sdlc/overlay`. */
  overlayDir?: string;
  /** Prior interview answers (free-form key -> value). */
  answers?: Record<string, string>;
}

export interface CustomizeResult {
  profile: RepoProfile;
  suggestedTrack: CeremonyTrack;
  gaps: GapQuestion[];
  drift: StandardsDrift;
  /** True when no interview gaps remain. */
  ready: boolean;
  writtenPaths: string[];
}

const OVERLAY_FILE = ".customize.yaml";
const STANDARDS_FILE = "standards-index.yaml";

/**
 * Mine the repo, compute remaining interview gaps, and emit an evidence-backed,
 * schema-valid overlay + standards index. Re-runs are drift-aware: the prior
 * standards index is diffed and the delta reported rather than silently
 * overwritten.
 */
export function runCustomize(options: CustomizeOptions): CustomizeResult {
  const answers = options.answers ?? {};
  const overlayDir = options.overlayDir ?? join(options.repoRoot, ".sdlc", "overlay");

  const profile = mineRepo(options.repoRoot);
  const gaps = computeGaps(profile, answers);

  const standardsIndex = buildStandardsIndex(profile);
  const prior = readPriorStandards(join(overlayDir, STANDARDS_FILE));
  const drift = diffStandardsIndex(standardsIndex, prior);

  const overlay = buildOverlay(profile, answers);

  const overlayPath = join(overlayDir, OVERLAY_FILE);
  const standardsPath = join(overlayDir, STANDARDS_FILE);
  write(overlayPath, serializeOverlay(overlay));
  write(standardsPath, serializeStandardsIndex(standardsIndex));

  return {
    profile,
    suggestedTrack: suggestTrack(profile),
    gaps,
    drift,
    ready: gaps.length === 0,
    writtenPaths: [overlayPath, standardsPath],
  };
}

function readPriorStandards(path: string): StandardsIndex | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = parseYaml(readFileSync(path, "utf8")) as StandardsIndex;
    if (parsed && Array.isArray(parsed.standards)) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}
