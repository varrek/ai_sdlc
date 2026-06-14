import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  buildOverlay,
  buildProjectContext,
  buildStandardsIndex,
  diffStandardsIndex,
  rootInstructionAdvisory,
  serializeOverlay,
  serializeStandardsIndex,
  suggestTrack,
  type StandardsDrift,
  type StandardsIndex,
} from "../customize/emitters.js";
import { computeGaps, DEFERRED_INTEGRATIONS, type GapQuestion } from "../customize/gap-interview.js";
import { mineRepo, type RepoProfile } from "../customize/repo-miner.js";
import { fingerprint, isPhaseFresh, readSetupState, writeSetupPhases } from "../customize/setup-state.js";
import { loadOverlay, PROJECT_CONTEXT_FILE } from "../core/loader.js";
import { renderCodebaseMap, serializeProjectContext } from "../core/project-context.js";
import type { CeremonyTrack, Overlay } from "../schema/index.js";

export interface CustomizeOptions {
  repoRoot: string;
  /** Defaults to `<repoRoot>/.sdlc/overlay`. */
  overlayDir?: string;
  /** Where the phase cache lives. Defaults to the parent of `overlayDir` (the `.sdlc` root). */
  sdlcDir?: string;
  /** Prior interview answers (free-form key -> value). */
  answers?: Record<string, string>;
  /** Bypass the freshness short-circuit and rewrite + re-record regardless. */
  force?: boolean;
}

export interface CustomizeResult {
  profile: RepoProfile;
  suggestedTrack: CeremonyTrack;
  gaps: GapQuestion[];
  drift: StandardsDrift;
  /**
   * True when no *blocking* gaps remain. This is the customize-side proxy, NOT
   * chain "setup-ready" — the full gate (blocking gaps closed AND smoke passes)
   * is owned by `aisdlc smoke` via `evaluateReadiness`.
   */
  ready: boolean;
  /** Integration contracts left unbound (deferred to just-in-time binding). */
  deferredIntegrations: string[];
  /** True when inputs were unchanged and the overlay write was skipped. */
  freshnessSkipped: boolean;
  /** True when no prior standards index existed — this is the initial setup, not a re-run. */
  firstRun: boolean;
  /** Number of standards in the freshly built index (for the first-run summary). */
  standardsCount: number;
  /** Workspace packages detected (0 for a single-package repo). */
  packageCount: number;
  /** Lean-root advisory when the root instruction surface has grown large; else absent. */
  rootAdvisory?: string;
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
  const sdlcDir = options.sdlcDir ?? dirname(overlayDir);
  const overlayPath = join(overlayDir, OVERLAY_FILE);
  const standardsPath = join(overlayDir, STANDARDS_FILE);
  const projectContextPath = join(overlayDir, PROJECT_CONTEXT_FILE);

  const priorOverlay = existsSync(overlayPath) ? loadOverlay(overlayPath) : undefined;
  const answers = mergeAnswers(priorOverlay, options.answers ?? {});

  // Always mine (it is cheap and load-bearing for freshness); freshness only
  // skips the overlay/standards *writes*, never the scan itself.
  const profile = mineRepo(options.repoRoot);
  // Persist the mined runnable test command so the "tests must pass" gate has a
  // command to run, and so it closes the test-command gap deterministically.
  if (profile.testCommand && !answers["test-command"]) {
    answers["test-command"] = profile.testCommand;
  }
  const gaps = computeGaps(profile, answers);

  const firstRun = !existsSync(standardsPath);
  const standardsIndex = buildStandardsIndex(profile);
  const drift = diffStandardsIndex(standardsIndex, readPriorStandards(standardsPath));

  const overlay = buildOverlay(profile, answers, priorOverlay);
  const overlaySerialized = serializeOverlay(overlay);
  const projectContext = buildProjectContext(profile, standardsIndex);

  // Freshness: compare the mined inputs and the *would-be* overlay (which folds
  // in prior edits + any --answers-file) against recorded fingerprints. A
  // changed answers file or a hand-edited overlay both shift the overlay
  // fingerprint, so resume re-runs from the overlay phase forward.
  const minedFp = fingerprint([stableProfileJson(profile)]);
  const overlayFp = fingerprint([overlaySerialized]);
  const state = readSetupState(sdlcDir);
  const fresh =
    !options.force &&
    isPhaseFresh(state, "mined", minedFp) &&
    isPhaseFresh(state, "overlay-written", overlayFp, existsSync(overlayPath));

  if (!fresh) {
    write(overlayPath, overlaySerialized);
    write(standardsPath, serializeStandardsIndex(standardsIndex));
    write(projectContextPath, serializeProjectContext(projectContext));
    writeSetupPhases(sdlcDir, { mined: minedFp, "overlay-written": overlayFp });
  }

  const deferredIntegrations = DEFERRED_INTEGRATIONS.filter((id) => !(id in overlay.integrations));

  // Approximate the root instruction surface (overlay standards + appended map)
  // to decide whether to advise moving package detail out of the root.
  const rootSurface = [...overlay.standards, renderCodebaseMap(projectContext.map)].join("\n");

  return {
    profile,
    suggestedTrack: suggestTrack(profile),
    gaps,
    drift,
    ready: gaps.length === 0,
    deferredIntegrations,
    freshnessSkipped: fresh,
    firstRun,
    standardsCount: standardsIndex.standards.length,
    packageCount: profile.packages?.length ?? 0,
    rootAdvisory: rootInstructionAdvisory(rootSurface),
    writtenPaths: [overlayPath, standardsPath, projectContextPath],
  };
}

export interface RepoInspection {
  profile: RepoProfile;
  standardsIndex: StandardsIndex;
  gaps: GapQuestion[];
  /** True when no blocking gaps remain. */
  ready: boolean;
  /** True when both mined + overlay phases are fresh — a re-run would be a no-op. */
  upToDate: boolean;
  /** True once setup has run (the overlay exists). */
  initialized: boolean;
}

/**
 * Read-only analysis of the current repo against any prior overlay: the mined
 * profile, standards, remaining blocking gaps, and whether a re-run would be a
 * no-op. Shares mining/answer-merge/fingerprint logic with `runCustomize` but
 * never writes `.sdlc`, so commands like `aisdlc status` can call it safely.
 */
export function inspectRepo(options: {
  repoRoot: string;
  overlayDir?: string;
  sdlcDir?: string;
}): RepoInspection {
  const overlayDir = options.overlayDir ?? join(options.repoRoot, ".sdlc", "overlay");
  const sdlcDir = options.sdlcDir ?? dirname(overlayDir);
  const overlayPath = join(overlayDir, OVERLAY_FILE);

  const priorOverlay = existsSync(overlayPath) ? loadOverlay(overlayPath) : undefined;
  const answers = mergeAnswers(priorOverlay, {});
  const profile = mineRepo(options.repoRoot);
  if (profile.testCommand && !answers["test-command"]) answers["test-command"] = profile.testCommand;
  const gaps = computeGaps(profile, answers);
  const standardsIndex = buildStandardsIndex(profile);

  const overlay = buildOverlay(profile, answers, priorOverlay);
  const minedFp = fingerprint([stableProfileJson(profile)]);
  const overlayFp = fingerprint([serializeOverlay(overlay)]);
  const state = readSetupState(sdlcDir);
  const upToDate =
    isPhaseFresh(state, "mined", minedFp) &&
    isPhaseFresh(state, "overlay-written", overlayFp, existsSync(overlayPath));

  return {
    profile,
    standardsIndex,
    gaps,
    ready: gaps.length === 0,
    upToDate,
    initialized: existsSync(overlayPath),
  };
}

/** A stable, path-independent projection of the profile used as the `mined` fingerprint input. */
function stableProfileJson(profile: RepoProfile): string {
  const { root: _root, ...rest } = profile;
  return JSON.stringify(rest);
}

/**
 * Load interview answers from a YAML or JSON file (a flat string→string map).
 * Throws on a missing file or a non-string value so the CLI fails loudly rather
 * than silently writing a malformed overlay.
 */
export function loadAnswersFile(path: string): Record<string, string> {
  const text = readFileSync(path, "utf8");
  const parsed = path.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`answers file ${path} must be a key/value map`);
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(`answers file ${path}: value for '${key}' must be a string`);
    }
    out[key] = value;
  }
  return out;
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
