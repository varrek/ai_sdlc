import { join } from "node:path";
import { readAcceptedLearnings } from "../core/accepted-learnings.js";
import {
  loadBase,
  loadOverlay,
  loadProjectContext,
  projectContextPathFor,
} from "../core/loader.js";
import { mergeOverlay } from "../core/merge.js";
import { computeGaps, DEFERRED_INTEGRATIONS } from "../customize/gap-interview.js";
import { mineRepo } from "../customize/repo-miner.js";
import { isPhaseFresh, readSetupState, writeSetupPhases } from "../customize/setup-state.js";
import { evaluateReadiness, runSmoke, type SmokeResult, smokeExitCode } from "../smoke/harness.js";
import { compiledArtifactsPresent, runCompileCli } from "./compile.js";
import { baseFingerprint, emittedFingerprint } from "./phase-fingerprints.js";

export interface SmokeCliOptions {
  baseDir: string;
  /** Optional additive extension pack directories, applied in the given order. */
  packDirs?: string[];
  overlayPath?: string;
  /** Directory to compile into and validate. */
  configDir: string;
  /** When true, (re)compile (with phase recording) before validating. */
  compileFirst?: boolean;
  /**
   * Repo to mine for the blocking-gap count that feeds the chain readiness gate.
   * Defaults to `cwd`.
   */
  repoRoot?: string;
  /** Phase-cache root. Defaults to `<configDir>/.sdlc`. */
  sdlcDir?: string;
  /** Re-record the `smoke-passed` phase even when the emitted config is unchanged. */
  force?: boolean;
}

export interface SmokeCliResult {
  result: SmokeResult;
  exitCode: number;
  /** Chain "setup-ready": no blocking gaps AND smoke passed. */
  setupReady: boolean;
  /** True when the previously emitted compile artifacts are still present. */
  emittedArtifactsPresent: boolean;
  /** Blocking interview gaps still open (deferred integrations excluded by construction). */
  blockingGapCount: number;
  /** Integration contracts left unbound (deferred to just-in-time binding). */
  deferredIntegrations: string[];
  /** True when the recorded `smoke-passed` fingerprint already matched this run's emitted config. */
  smokeFresh: boolean;
}

/**
 * Compile (optionally) then run the smoke gate against the generated config, and
 * compute the single chain readiness gate (`evaluateReadiness`). Mining the repo
 * for the blocking-gap count keeps "setup-ready" honest: a repo with no runnable
 * test command is not ready even if the base gates pass. Integrations are no
 * longer blocking gaps, so they never hold back readiness — they are reported
 * separately as deferred. On a pass the `smoke-passed` phase is recorded,
 * fingerprinted on the emitted config + base hash so a config or base change
 * invalidates it.
 */
export function runSmokeCli(options: SmokeCliOptions): SmokeCliResult {
  const sdlcDir = options.sdlcDir ?? join(options.configDir, ".sdlc");
  const overlay = loadOverlay(options.overlayPath);

  if (options.compileFirst) {
    runCompileCli({
      baseDir: options.baseDir,
      packDirs: options.packDirs,
      overlayPath: options.overlayPath,
      outDir: options.configDir,
      sdlcDir,
      force: options.force,
    });
  }

  const projectContext = loadProjectContext(projectContextPathFor(options.overlayPath));
  const acceptedLearnings = readAcceptedLearnings(sdlcDir);
  const model = mergeOverlay(
    loadBase(options.baseDir, options.packDirs),
    overlay,
    projectContext,
    acceptedLearnings,
  );
  const result = runSmoke({ model, configDir: options.configDir });

  const profile = mineRepo(options.repoRoot ?? process.cwd());
  const blockingGapCount = computeGaps(profile, overlay.interviewAnswers).length;
  const emittedArtifactsPresent = compiledArtifactsPresent(options.configDir);
  const setupReady = evaluateReadiness(blockingGapCount, result) && emittedArtifactsPresent;
  const deferredIntegrations = DEFERRED_INTEGRATIONS.filter((id) => !(id in overlay.integrations));

  const baseFp = baseFingerprint(options.baseDir, sdlcDir, options.packDirs);
  const smokeFp = emittedFingerprint(options.configDir, baseFp);
  const smokeFresh = isPhaseFresh(readSetupState(sdlcDir), "smoke-passed", smokeFp);
  if (result.passed && (!smokeFresh || options.force)) {
    writeSetupPhases(sdlcDir, { "smoke-passed": smokeFp });
  }

  return {
    result,
    exitCode: smokeExitCode(result),
    setupReady,
    emittedArtifactsPresent,
    blockingGapCount,
    deferredIntegrations,
    smokeFresh,
  };
}
