import { join } from "node:path";
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
    output: formatSetupResult(customize, compile, smoke, overlayPath),
    exitCode: smoke.setupReady ? 0 : 1,
  };
}

function formatSetupResult(
  customize: CustomizeResult,
  compile: CompileCliResult,
  smoke: SmokeCliResult,
  overlayPath: string,
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
    lines.push("Host activation guide: .sdlc/host-setup.md");
  } else {
    lines.push(
      `Not setup-ready: ${smoke.blockingGapCount} blocking interview gap(s); overlay: ${overlayPath}`,
    );
  }
  return lines.join("\n");
}
