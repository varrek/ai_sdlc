import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadOverlay } from "../core/loader.js";
import {
  buildMaintenanceHandoffs,
  MAINTENANCE_REPORT_BASENAME,
  type MaintenanceReport,
  renderMaintenanceText,
  serializeMaintenanceReport,
} from "../core/maintenance.js";
import { resolveDefaultBaseDir } from "../core/package-root.js";
import type { HostId, OperatingMode } from "../schema/index.js";
import { DEFAULT_CACHE_DIR, DEFAULT_CATALOG, DEFAULT_REPORT_DIR, runBench } from "./bench.js";
import { runCompileCli } from "./compile.js";
import { runCustomize } from "./customize.js";
import { runGardenCli } from "./garden.js";
import { runSmokeCli } from "./smoke.js";
import { buildStatus } from "./status.js";

export interface MaintainCliOptions {
  repoRoot: string;
  baseDir?: string;
  packDirs?: string[];
  hosts?: HostId[];
  operatingMode?: OperatingMode;
  force?: boolean;
  withBench?: boolean;
  benchSeed?: number;
  benchCount?: number;
}

export interface MaintainCliResult {
  report: MaintenanceReport;
  output: string;
  exitCode: number;
  writtenPaths: string[];
}

export function runMaintainCli(options: MaintainCliOptions): MaintainCliResult {
  const repoRoot = options.repoRoot;
  const sdlcDir = join(repoRoot, ".sdlc");
  const overlayDir = join(sdlcDir, "overlay");
  const overlayPath = join(overlayDir, ".customize.yaml");
  const baseDir = options.baseDir ?? resolveDefaultBaseDir();
  const packDirs = options.packDirs ?? [];

  const customize = runCustomize({
    repoRoot,
    overlayDir,
    sdlcDir,
    force: options.force,
    operatingMode: options.operatingMode,
  });

  const compile = runCompileCli({
    baseDir,
    packDirs,
    overlayPath,
    outDir: repoRoot,
    sdlcDir,
    hosts: options.hosts,
    force: options.force,
  });

  const smoke = runSmokeCli({
    baseDir,
    packDirs,
    overlayPath,
    configDir: repoRoot,
    sdlcDir,
    repoRoot,
    force: options.force,
  });

  const garden = runGardenCli({ repoRoot, configDir: repoRoot });

  const bench = options.withBench
    ? runBench({
        seed: options.benchSeed ?? 42,
        count: options.benchCount ?? 3,
        catalogPath: DEFAULT_CATALOG,
        cacheDir: DEFAULT_CACHE_DIR,
        reportDir: DEFAULT_REPORT_DIR,
        baseDir,
        mode: options.operatingMode ?? "deterministic",
        skipClone: false,
        dryRun: false,
        force: options.force,
      })
    : undefined;

  const status = buildStatus({
    repoRoot,
    overlayDir,
    sdlcDir,
    baseDir,
    packDirs,
    outDir: repoRoot,
    hosts: options.hosts,
  });

  const overlay = loadOverlay(overlayPath);
  if (!overlay) {
    throw new Error("overlay missing after customize — expected .sdlc/overlay/.customize.yaml");
  }
  const handoffs = buildMaintenanceHandoffs({
    status: {
      architectureConfidence: status.architectureConfidence,
      architectureReasons: status.architectureReasons,
      roleStates: status.roleStates,
    },
    setupReady: smoke.setupReady,
    smokePassed: smoke.result.passed,
    gardenReport: garden.report,
    overlay,
    upgradeConflictsPresent: existsSync(join(sdlcDir, "upgrade-conflicts.yml")),
    benchExitCode: bench?.exitCode,
    benchReportPath: bench?.reportPath,
    packDirs,
    gaps: customize.gaps,
    drift: customize.drift,
    deferredIntegrations: customize.deferredIntegrations,
  });

  const report: MaintenanceReport = {
    setupReady: smoke.setupReady && handoffs.length === 0,
    phases: {
      customizeFresh: customize.freshnessSkipped,
      compileFresh: compile.freshnessSkipped,
      smokePassed: smoke.result.passed,
      gardenFindings: garden.report.summary.total,
    },
    handoffs,
  };

  mkdirSync(sdlcDir, { recursive: true });
  const jsonPath = join(sdlcDir, MAINTENANCE_REPORT_BASENAME);
  const markdownPath = join(sdlcDir, "maintenance-report.md");
  writeFileSync(jsonPath, serializeMaintenanceReport(report), "utf8");
  writeFileSync(markdownPath, renderMaintenanceMarkdown(report), "utf8");

  const lines = [
    "Maintenance workflow: customize → compile → smoke → garden.",
    renderMaintenanceText(report),
    `Report: ${jsonPath}`,
  ];
  if (bench) {
    lines.splice(1, 0, bench.output.split("\n")[0] ?? "Bench complete.");
  }

  return {
    report,
    output: lines.filter(Boolean).join("\n"),
    exitCode: report.setupReady ? 0 : 1,
    writtenPaths: [jsonPath, markdownPath, ...garden.writtenPaths],
  };
}

function renderMaintenanceMarkdown(report: MaintenanceReport): string {
  const lines = ["# Maintenance report", "", renderMaintenanceText(report), "", "## Handoffs", ""];
  if (report.handoffs.length === 0) {
    lines.push("None.");
  } else {
    for (const handoff of report.handoffs) {
      lines.push(`- **${handoff.skill}**: ${handoff.reason}`);
      if (handoff.reportPath) lines.push(`  - Read: \`${handoff.reportPath}\``);
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
