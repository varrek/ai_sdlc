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
import { loadOverlay } from "../core/loader.js";
import type { CeremonyTrack, Overlay } from "../schema/index.js";

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
 * schema-valid overlay + standards index. Re-runs are drift-aware and
 * non-destructive: the prior standards index is diffed (delta reported, not
 * silently overwritten) and the prior overlay's user-owned edges — interview
 * answers, integration bindings, role-model overrides, and the chosen track —
 * are preserved and used to close gaps. This is what makes the documented
 * "edit `.customize.yaml`, then re-run" workflow actually converge.
 */
export function runCustomize(options: CustomizeOptions): CustomizeResult {
  const overlayDir = options.overlayDir ?? join(options.repoRoot, ".sdlc", "overlay");
  const overlayPath = join(overlayDir, OVERLAY_FILE);
  const standardsPath = join(overlayDir, STANDARDS_FILE);

  const priorOverlay = existsSync(overlayPath) ? loadOverlay(overlayPath) : undefined;
  const answers = mergeAnswers(priorOverlay, options.answers ?? {});

  const profile = mineRepo(options.repoRoot);
  const gaps = computeGaps(profile, answers);

  const standardsIndex = buildStandardsIndex(profile);
  const drift = diffStandardsIndex(standardsIndex, readPriorStandards(standardsPath));

  const overlay = buildOverlay(profile, answers, priorOverlay);

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

/**
 * Seed the interview answer set from a prior overlay so re-runs converge:
 * explicit (newly supplied) answers win, then prior interview answers, then any
 * existing integration binding (a hand-added `integrations.<id>` closes the
 * `<id>-server` gap even if the matching interview answer was never recorded).
 */
function mergeAnswers(
  prior: Overlay | undefined,
  explicit: Record<string, string>,
): Record<string, string> {
  const answers: Record<string, string> = { ...(prior?.interviewAnswers ?? {}) };
  for (const [id, binding] of Object.entries(prior?.integrations ?? {})) {
    const key = `${id}-server`;
    if (!(key in answers)) answers[key] = binding.serverId;
  }
  return { ...answers, ...explicit };
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
