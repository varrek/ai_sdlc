import { existsSync } from "node:fs";
import { join } from "node:path";
import { HOST_SETUP_GUIDE_PATH } from "../core/host-setup-guidance.js";
import type { HostId, OperatingMode } from "../schema/index.js";
import { type CompileCliResult, runCompileCli } from "./compile.js";
import { type CustomizeResult, runCustomize } from "./customize.js";
import { runSmokeCli, type SmokeCliResult } from "./smoke.js";

export interface SetupCliOptions {
  repoRoot: string;
  baseDir: string;
  packDirs?: string[];
  hosts?: HostId[];
  operatingMode?: OperatingMode;
  force?: boolean;
}

export interface SetupCliResult {
  customize: CustomizeResult;
  compile: CompileCliResult;
  smoke: SmokeCliResult;
  overlayPath: string;
  output: string;
  exitCode: number;
}

export function runSetupCli(options: SetupCliOptions): SetupCliResult {
  const sdlcDir = join(options.repoRoot, ".sdlc");
  const overlayDir = join(sdlcDir, "overlay");
  const overlayPath = join(overlayDir, ".customize.yaml");

  const customize = runCustomize({
    repoRoot: options.repoRoot,
    overlayDir,
    sdlcDir,
    force: options.force,
    operatingMode: options.operatingMode,
  });

  const compile = runCompileCli({
    baseDir: options.baseDir,
    packDirs: options.packDirs,
    overlayPath,
    outDir: options.repoRoot,
    sdlcDir,
    hosts: options.hosts,
    force: options.force,
  });

  const smoke = runSmokeCli({
    baseDir: options.baseDir,
    packDirs: options.packDirs,
    overlayPath,
    configDir: options.repoRoot,
    sdlcDir,
    repoRoot: options.repoRoot,
    force: options.force,
  });

  return {
    customize,
    compile,
    smoke,
    overlayPath,
    output: formatSetupResult(customize, compile, smoke, overlayPath, options.repoRoot),
    exitCode: smoke.setupReady ? 0 : 1,
  };
}

export function formatSetupResult(
  customize: CustomizeResult,
  compile: CompileCliResult,
  smoke: SmokeCliResult,
  overlayPath: string,
  repoRoot: string,
): string {
  const lines: string[] = [];
  lines.push(
    customize.freshnessSkipped
      ? "customize fresh — skipped."
      : `Mined ${customize.profile.fileCount} files; wrote ${customize.writtenPaths.length} setup artifact(s).`,
  );
  if (!customize.freshnessSkipped && customize.standardsCount > 0) {
    const coverage = customize.evidenceCoverage;
    lines.push(`Evidence coverage: ${coverage.covered}/${coverage.total} standards cite a source.`);
  }
  lines.push(
    compile.freshnessSkipped
      ? "compiled config fresh — skipped."
      : `Compiled ${compile.result?.files.length ?? 0} host-native file(s).`,
  );
  lines.push(`Base gates: ${smoke.result.passed ? "PASS" : "FAIL"} (log: ${smoke.result.logPath})`);
  if (smoke.setupReady) {
    const deferred = smoke.deferredIntegrations.length
      ? ` (integrations deferred: ${smoke.deferredIntegrations.join(", ")})`
      : "";
    lines.push(`Setup-ready${deferred}.`);
    if (existsSync(join(repoRoot, HOST_SETUP_GUIDE_PATH))) {
      lines.push("Host activation guide: .sdlc/host-setup.md");
    } else {
      lines.push("Host activation guide missing; re-run `aisdlc compile --force`.");
    }
  } else {
    lines.push(
      `Not setup-ready — ${notReadyReason(smoke.result.passed, smoke.blockingGapCount, smoke.emittedArtifactsPresent)}.`,
    );
    for (const check of smoke.result.checks.filter((check) => !check.ok)) {
      lines.push(`Base gate ${check.name}: ${check.reason ?? "failed"}.`);
    }
    if (!smoke.emittedArtifactsPresent) {
      lines.push("Emitted compile artifacts are missing; re-run `aisdlc compile`.");
    }
    if (smoke.blockingGapCount > 0) {
      lines.push(`${smoke.blockingGapCount} blocking interview gap(s); overlay: ${overlayPath}`);
    }
  }
  return lines.join("\n");
}

function notReadyReason(
  basePassed: boolean,
  blockingGapCount: number,
  emittedArtifactsPresent: boolean,
): string {
  if (!emittedArtifactsPresent) return "emitted config artifacts are missing";
  if (!basePassed && blockingGapCount > 0) return "base gates failed and interview gaps remain";
  if (!basePassed) return "base gates failed";
  return "interview gaps remain";
}
