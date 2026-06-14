#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "./args.js";
import { runCompileCli } from "./compile.js";
import { buildRegistry } from "../adapters/registry.js";
import { renderCapabilityMatrix } from "../core/capability-matrix.js";
import { loadAnswersFile, runCustomize } from "./customize.js";
import { explainStandard } from "./explain.js";
import { buildStatus, formatStatus } from "./status.js";
import { runSmokeCli } from "./smoke.js";
import { runUpgrade } from "./upgrade.js";
import { buildStandardsIndex, evidenceCoverage } from "../customize/emitters.js";
import { HostId } from "../schema/index.js";

const HELP = `aisdlc — internal AI SDLC framework compiler

Usage:
  aisdlc compile --base <dir> --out <dir> [--packs <dir,dir>] [--overlay <file>] [--hosts cursor,claude-code,copilot]

Commands:
  compile     Compile the host-neutral base (+ overlay) to host-native config.
  gen-matrix  Regenerate docs/capability-matrix.md from adapter capabilities.
  customize   Adapt the base to the current repository (U6).
  upgrade     Re-pin the base and replay compile, flagging overlay conflicts (U5).
  smoke       Run the smoke validation gate (U7).
  status      Report setup freshness, blocking gaps, and evidence coverage.
  explain     Show a mined standard (by number) and the evidence behind it.
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Where `customize` writes the project overlay. */
const DEFAULT_OVERLAY = join(".sdlc", "overlay", ".customize.yaml");

/**
 * Resolve the overlay an SDLC command should use: an explicit `--overlay` wins;
 * otherwise fall back to the customize output if it exists. Without this, a
 * normal "customize then compile" flow silently drops project standards,
 * integration bindings, and the chosen track.
 */
function resolveOverlay(explicit: string | undefined): string | undefined {
  if (explicit) return explicit;
  if (existsSync(DEFAULT_OVERLAY)) {
    process.stdout.write(`Using project overlay ${DEFAULT_OVERLAY}.\n`);
    return DEFAULT_OVERLAY;
  }
  return undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

function cmdCompile(rest: string[]): void {
  const { options, flags } = parseArgs(rest);
  const baseDir = options.get("base") ?? "sdlc-base";
  const outDir = options.get("out");
  if (!outDir) fail("compile: --out <dir> is required");

  const hostsRaw = options.get("hosts");
  const hosts = hostsRaw
    ? hostsRaw.split(",").map((h) => HostId.parse(h.trim()))
    : undefined;

  const { result, freshnessSkipped } = runCompileCli({
    baseDir,
    packDirs: parseList(options.get("packs")),
    outDir: outDir!,
    overlayPath: resolveOverlay(options.get("overlay")),
    hosts,
    force: flags.has("force"),
  });

  if (freshnessSkipped || !result) {
    process.stdout.write("compiled config fresh — skipped (overlay + base unchanged).\n");
    return;
  }

  process.stdout.write(
    `Compiled ${result.files.length} file(s) to ${outDir}` +
      (result.pruned.length ? `, ${result.pruned.length} orphan(s) pruned` : "") +
      "\n",
  );
  if (result.gaps.length) {
    process.stdout.write(
      `${result.gaps.length} portability gap(s) recorded — see ${join(outDir!, "portability.gap.yml")}.\n`,
    );
  }
}

function cmdGenMatrix(rest: string[]): void {
  const { options } = parseArgs(rest);
  const out = options.get("out") ?? "docs/capability-matrix.md";
  const contents = renderCapabilityMatrix(buildRegistry().all());
  writeFileSync(out, contents, "utf8");
  process.stdout.write(`Wrote ${out}\n`);
}

function cmdCustomize(rest: string[]): void {
  const { options, flags } = parseArgs(rest);
  const repoRoot = options.get("repo") ?? process.cwd();
  const answersFile = options.get("answers-file");
  let answers: Record<string, string> | undefined;
  try {
    answers = answersFile ? loadAnswersFile(answersFile) : undefined;
  } catch (error) {
    fail(`customize: ${(error as Error).message}`);
  }

  const result = runCustomize({
    repoRoot,
    overlayDir: options.get("overlay-dir"),
    answers,
    force: flags.has("force"),
  });

  if (result.freshnessSkipped) {
    process.stdout.write("customize fresh — skipped (mined + overlay unchanged).\n");
  } else {
    process.stdout.write(
      `Mined ${result.profile.fileCount} files. Languages: ${result.profile.languages.join(", ") || "none"}.\n` +
        `Suggested track: ${result.suggestedTrack}.\n` +
        `Wrote: ${result.writtenPaths.join(", ")}.\n`,
    );
  }
  if (!result.freshnessSkipped && result.firstRun) {
    if (result.standardsCount > 0) {
      process.stdout.write(`Established ${result.standardsCount} standard(s) from repo evidence.\n`);
    }
  } else if (result.drift.changed) {
    process.stdout.write(
      `Drift: +${result.drift.added.length} / -${result.drift.removed.length} standards since last run.\n`,
    );
  }
  if (result.packageCount > 1) {
    process.stdout.write(
      `Detected ${result.packageCount} workspace packages — emitted per-package instruction files and scoped standards.\n`,
    );
  }
  if (result.rootAdvisory) {
    process.stdout.write(`Advisory: ${result.rootAdvisory}\n`);
  }
  if (result.deferredIntegrations.length) {
    process.stdout.write(
      `Integrations deferred (bind just-in-time when a task needs them): ${result.deferredIntegrations.join(", ")}.\n`,
    );
  }
  const coverage = evidenceCoverage(buildStandardsIndex(result.profile));
  if (coverage.total > 0) {
    process.stdout.write(
      `Evidence coverage: ${coverage.covered}/${coverage.total} standards cite a source.\n`,
    );
    if (coverage.uncited.length > 0) {
      process.stdout.write(
        `Warning: ${coverage.uncited.length} standard(s) cite no source — evidence-coverage gap.\n`,
      );
    }
  }
  if (!result.ready) {
    process.stdout.write("\nInterview needed (mining could not resolve):\n");
    for (const gap of result.gaps) process.stdout.write(`  - [${gap.id}] ${gap.question}\n`);
    process.stdout.write("\nAnswer these in .sdlc/overlay/.customize.yaml, then re-run.\n");
  }
}

function cmdSmoke(rest: string[]): void {
  const { options, flags } = parseArgs(rest);
  const { result, setupReady, blockingGapCount, deferredIntegrations } = runSmokeCli({
    baseDir: options.get("base") ?? "sdlc-base",
    packDirs: parseList(options.get("packs")),
    overlayPath: resolveOverlay(options.get("overlay")),
    configDir: options.get("config") ?? options.get("out") ?? ".",
    compileFirst: flags.has("compile"),
    repoRoot: options.get("repo"),
  });
  process.stdout.write(`Base gates: ${result.passed ? "PASS" : "FAIL"} (log: ${result.logPath})\n`);

  if (setupReady) {
    const deferred = deferredIntegrations.length
      ? ` (integrations deferred: ${deferredIntegrations.join(", ")})`
      : "";
    process.stdout.write(`Setup-ready${deferred}.\n`);
  } else {
    // Setup-ready needs BOTH the base gates and zero blocking interview gaps, so
    // a passing base run can still be "not ready". Lead with the actual blocker.
    process.stdout.write(`Not setup-ready — ${notReadyReason(result.passed, blockingGapCount)}:\n`);
    for (const c of result.checks.filter((c) => !c.ok)) {
      process.stdout.write(`  - base gate ${c.name}: ${c.reason ?? "failed"}\n`);
    }
    if (blockingGapCount > 0) {
      process.stdout.write(`  - ${blockingGapCount} blocking interview gap(s) still open\n`);
    }
    process.stdout.write(
      "\nResume by re-running `/customize` (or the stale subcommand directly) — " +
        "freshness skips the phases that are still good.\n",
    );
  }
  process.exit(setupReady ? 0 : 1);
}

function notReadyReason(basePassed: boolean, blockingGapCount: number): string {
  if (!basePassed && blockingGapCount > 0) return "base gates failed and interview gaps remain";
  if (!basePassed) return "base gates failed";
  return "the base gates passed but interview gaps remain";
}

function cmdStatus(rest: string[]): void {
  const { options } = parseArgs(rest);
  const report = buildStatus({
    repoRoot: options.get("repo") ?? process.cwd(),
    overlayDir: options.get("overlay-dir"),
    sdlcDir: options.get("sdlc-dir"),
  });
  process.stdout.write(`${formatStatus(report)}\n`);
  // Not-yet-set-up is a non-zero exit so scripts can gate on it.
  process.exit(report.initialized ? 0 : 1);
}

function cmdExplain(rest: string[]): void {
  const { options } = parseArgs(rest);
  const positional = rest.find((a) => !a.startsWith("-"));
  if (positional === undefined) fail("explain: a standard number is required, e.g. `aisdlc explain 1`");
  const n = Number(positional);
  if (!Number.isInteger(n)) fail(`explain: '${positional}' is not a standard number. Run \`aisdlc status\` to list them.`);

  const result = explainStandard({
    repoRoot: options.get("repo") ?? process.cwd(),
    overlayDir: options.get("overlay-dir"),
    sdlcDir: options.get("sdlc-dir"),
    n,
  });
  process.stdout.write(`${result.message}\n`);
  process.exit(result.ok ? 0 : 1);
}

function cmdUpgrade(rest: string[]): void {
  const { options } = parseArgs(rest);
  const oldBaseDir = options.get("old-base");
  const newBaseDir = options.get("new-base");
  const newBaseVersion = options.get("version");
  if (!oldBaseDir || !newBaseDir || !newBaseVersion) {
    fail("upgrade: --old-base <dir> --new-base <dir> --version <ref> are required");
  }

  const result = runUpgrade({
    oldBaseDir: oldBaseDir!,
    newBaseDir: newBaseDir!,
    newBaseVersion: newBaseVersion!,
    overlayPath: options.get("overlay"),
    sdlcDir: options.get("sdlc-dir"),
  });

  if (!result.upgraded) {
    fail(
      `upgrade blocked: ${result.conflicts.length} overlay conflict(s). ` +
        `See ${result.conflictReportPath}. Nothing was changed.`,
    );
  }
  process.stdout.write(`Upgraded base to ${result.lock!.baseVersion}.\n`);
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "compile":
      cmdCompile(rest);
      return;
    case "gen-matrix":
      cmdGenMatrix(rest);
      return;
    case "upgrade":
      cmdUpgrade(rest);
      return;
    case "customize":
      cmdCustomize(rest);
      return;
    case "smoke":
      cmdSmoke(rest);
      return;
    case "status":
      cmdStatus(rest);
      return;
    case "explain":
      cmdExplain(rest);
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return;
    default:
      fail(`Unknown command '${command}'.\n\n${HELP}`);
  }
}

main();
