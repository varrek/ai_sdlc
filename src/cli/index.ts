#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRegistry } from "../adapters/registry.js";
import { renderCapabilityMatrix } from "../core/capability-matrix.js";
import { appendLoopEvent, readLoopEvents } from "../core/memory.js";
import { resolveDefaultBaseDir } from "../core/package-root.js";
import { buildStandardsIndex, evidenceCoverage } from "../customize/emitters.js";
import type { LoopTraceEvent } from "../eval/loop-trace.js";
import {
  HostId,
  OperatingMode,
  type OperatingMode as OperatingModeValue,
} from "../schema/index.js";
import { parseArgs } from "./args.js";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_CATALOG,
  DEFAULT_REPORT_DIR,
  parseFailOnClasses,
  runBench,
} from "./bench.js";
import { runCompileCli } from "./compile.js";
import { loadAnswersFile, runCustomize } from "./customize.js";
import { EXPLAIN_CLAIM_KEYS, explainClaim, explainStandard, isExplainClaimKey } from "./explain.js";
import { parseGardenDocsFailOn, parseGardenDocsFormat, runGardenDocs } from "./garden-docs.js";
import { runSetupCli } from "./setup.js";
import { runSmokeCli } from "./smoke.js";
import { buildStatus, formatStatus } from "./status.js";
import { runUpgrade } from "./upgrade.js";

const HELP = `aisdlc — internal AI SDLC framework compiler

Usage:
  aisdlc compile --base <dir> --out <dir> [--packs <dir,dir>] [--overlay <file>] [--hosts cursor,claude-code,copilot,codex,kiro]
  aisdlc setup --repo <dir> [--hosts cursor,claude-code,copilot,codex,kiro]

Commands:
  setup       Run customize -> compile -> smoke for a target repo (alias: init).
  compile     Compile the host-neutral base (+ overlay) to host-native config.
  gen-matrix  Regenerate docs/capability-matrix.md from adapter capabilities.
  customize   Adapt the base to the current repository (Plugin Mode by default; use --mode deterministic to opt out).
  upgrade     Re-pin the base and replay compile, flagging overlay conflicts (U5).
  smoke       Run the smoke validation gate (U7).
  status      Report setup freshness, blocking gaps, and evidence coverage.
  bench       Run a reproducible external-repo setup evaluation.
  explain     Show a mined standard (by number) or stable claim key and its evidence.
  garden-docs Report stale or noisy agent-facing documentation.
  record-event Record a loop trace event to .sdlc/loop_history/events.jsonl (for hooks/skills).

Bench flags:
  --seed <n> --count <n> --catalog <file> --cache-dir <dir> --report-dir <dir>
  --base <dir> --mode deterministic|plugin --dry-run --skip-clone --force
  --repo-timeout-ms <n> --fail-on-class <class,class>

Garden-docs flags:
  --repo <dir> --config <dir> --overlay <file> --overlay-dir <dir>
  --format text|json --write-report --fail-on warning|error
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function isLoopTraceEvent(value: unknown): value is LoopTraceEvent {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  switch (type) {
    case "plan_created":
    case "handoff":
    case "tool_attempt":
    case "test_run":
    case "approval_gate":
    case "review_verdict":
    case "replan":
    case "done":
    case "stuck":
      return true;
    default:
      return false;
  }
}

function approvalEventKey(event: LoopTraceEvent): string | undefined {
  if (event.type !== "approval_gate" || event.verdict !== "approved") return undefined;
  if (event.taskId === "unknown") return undefined;
  const evidence = [...(event.evidence ?? [])].sort().join("\0");
  const checkpoint = event.checkpoint ?? event.stage;
  if (!checkpoint) return undefined;
  return [event.taskId, event.role ?? "", checkpoint, evidence].join("\0");
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

function resolveBaseOption(value: string | undefined): string {
  if (value) return value;
  try {
    return resolveDefaultBaseDir();
  } catch (error) {
    fail((error as Error).message);
  }
}

function cmdCompile(rest: string[]): void {
  const { options, flags } = parseArgs(rest);
  const baseDir = resolveBaseOption(options.get("base"));
  const outDir = options.get("out");
  if (!outDir) fail("compile: --out <dir> is required");

  const hostsRaw = options.get("hosts");
  const hosts = hostsRaw ? hostsRaw.split(",").map((h) => HostId.parse(h.trim())) : undefined;

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
  let operatingMode: OperatingModeValue | undefined;
  try {
    const rawMode = options.get("mode");
    operatingMode = rawMode ? OperatingMode.parse(rawMode) : undefined;
  } catch (error) {
    fail(`customize: invalid --mode (${(error as Error).message})`);
  }
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
    operatingMode,
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
      process.stdout.write(
        `Established ${result.standardsCount} standard(s) from repo evidence.\n`,
      );
    }
  } else if (result.drift.changed) {
    const driftDetail =
      result.drift.added.length === 0 && result.drift.removed.length === 0
        ? "standards evidence metadata changed since last run"
        : `+${result.drift.added.length} / -${result.drift.removed.length} standards since last run`;
    process.stdout.write(`Drift: ${driftDetail}.\n`);
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
  const { result, setupReady, emittedArtifactsPresent, blockingGapCount, deferredIntegrations } =
    runSmokeCli({
      baseDir: resolveBaseOption(options.get("base")),
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
    process.stdout.write(
      `Not setup-ready — ${notReadyReason(result.passed, blockingGapCount, emittedArtifactsPresent)}:\n`,
    );
    for (const c of result.checks.filter((c) => !c.ok)) {
      process.stdout.write(`  - base gate ${c.name}: ${c.reason ?? "failed"}\n`);
    }
    if (!emittedArtifactsPresent) {
      process.stdout.write("  - emitted compile artifacts are missing; re-run `aisdlc compile`\n");
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

function notReadyReason(
  basePassed: boolean,
  blockingGapCount: number,
  emittedArtifactsPresent = true,
): string {
  if (!emittedArtifactsPresent) return "emitted config artifacts are missing";
  if (!basePassed && blockingGapCount > 0) return "base gates failed and interview gaps remain";
  if (!basePassed) return "base gates failed";
  return "the base gates passed but interview gaps remain";
}

function cmdStatus(rest: string[]): void {
  const { options } = parseArgs(rest);
  const hostsRaw = options.get("hosts");
  const hosts = hostsRaw ? hostsRaw.split(",").map((h) => HostId.parse(h.trim())) : undefined;
  const report = buildStatus({
    repoRoot: options.get("repo") ?? process.cwd(),
    overlayDir: options.get("overlay-dir"),
    sdlcDir: options.get("sdlc-dir"),
    baseDir: resolveBaseOption(options.get("base")),
    packDirs: parseList(options.get("packs")),
    outDir: options.get("out"),
    hosts,
  });
  process.stdout.write(`${formatStatus(report)}\n`);
  // Not-yet-set-up is a non-zero exit so scripts can gate on it.
  process.exit(report.initialized ? 0 : 1);
}

function cmdExplain(rest: string[]): void {
  const { options } = parseArgs(rest);
  const positional = rest.find((a) => !a.startsWith("-"));
  if (positional === undefined) {
    fail(
      "explain: a standard number or claim key is required, e.g. `aisdlc explain 1` or `aisdlc explain test-command`",
    );
  }

  const repoRoot = options.get("repo") ?? process.cwd();
  const overlayDir = options.get("overlay-dir");
  const sdlcDir = options.get("sdlc-dir");

  if (isExplainClaimKey(positional)) {
    const result = explainClaim({ repoRoot, overlayDir, sdlcDir, key: positional });
    process.stdout.write(`${result.message}\n`);
    process.exit(result.ok ? 0 : 1);
    return;
  }

  const n = Number(positional);
  if (!Number.isInteger(n)) {
    fail(
      `explain: '${positional}' is not a standard number or supported claim key (${EXPLAIN_CLAIM_KEYS.join(", ")}). Run \`aisdlc status\` to list standards.`,
    );
  }

  const result = explainStandard({ repoRoot, overlayDir, sdlcDir, n });
  process.stdout.write(`${result.message}\n`);
  process.exit(result.ok ? 0 : 1);
}

function cmdBench(rest: string[]): void {
  const { options, flags } = parseArgs(rest);
  let mode: OperatingModeValue;
  try {
    mode = OperatingMode.parse(options.get("mode") ?? "deterministic");
  } catch (error) {
    fail(`bench: invalid --mode (${(error as Error).message})`);
  }
  let failOnClasses;
  try {
    failOnClasses = parseFailOnClasses(options.get("fail-on-class"));
  } catch (error) {
    fail(`bench: ${(error as Error).message}`);
  }
  const seed = Number(options.get("seed") ?? "42");
  const count = Number(options.get("count") ?? "10");
  const repoTimeoutMs = options.get("repo-timeout-ms")
    ? Number(options.get("repo-timeout-ms"))
    : undefined;
  if (!Number.isInteger(seed)) fail("bench: --seed must be an integer");
  if (!Number.isInteger(count) || count < 1) fail("bench: --count must be a positive integer");
  if (repoTimeoutMs !== undefined && (!Number.isFinite(repoTimeoutMs) || repoTimeoutMs < 1)) {
    fail("bench: --repo-timeout-ms must be a positive number");
  }

  const result = runBench({
    seed,
    count,
    catalogPath: options.get("catalog") ?? DEFAULT_CATALOG,
    cacheDir: options.get("cache-dir") ?? DEFAULT_CACHE_DIR,
    reportDir: options.get("report-dir") ?? DEFAULT_REPORT_DIR,
    baseDir: resolveBaseOption(options.get("base")),
    mode,
    skipClone: flags.has("skip-clone"),
    dryRun: flags.has("dry-run"),
    force: flags.has("force"),
    repoTimeoutMs,
    failOnClasses,
  });
  process.stdout.write(`${result.output}\n`);
  process.exit(result.exitCode);
}

function cmdSetup(rest: string[]): void {
  const { options, flags } = parseArgs(rest);
  let operatingMode: OperatingModeValue | undefined;
  try {
    const rawMode = options.get("mode");
    operatingMode = rawMode ? OperatingMode.parse(rawMode) : undefined;
  } catch (error) {
    fail(`setup: invalid --mode (${(error as Error).message})`);
  }

  const hostsRaw = options.get("hosts");
  const hosts = hostsRaw ? hostsRaw.split(",").map((h) => HostId.parse(h.trim())) : undefined;
  const result = runSetupCli({
    repoRoot: options.get("repo") ?? process.cwd(),
    baseDir: resolveBaseOption(options.get("base")),
    packDirs: parseList(options.get("packs")),
    hosts,
    operatingMode,
    force: flags.has("force"),
  });
  process.stdout.write(`${result.output}\n`);
  process.exit(result.exitCode);
}

function cmdGardenDocs(rest: string[]): void {
  const { options, flags } = parseArgs(rest);
  let format;
  let failOn;
  try {
    format = parseGardenDocsFormat(options.get("format"));
    failOn = parseGardenDocsFailOn(options.get("fail-on"));
  } catch (error) {
    fail(`garden-docs: ${(error as Error).message}`);
  }
  const result = runGardenDocs({
    repoRoot: options.get("repo") ?? process.cwd(),
    configDir: options.get("config"),
    overlayPath: options.get("overlay"),
    overlayDir: options.get("overlay-dir"),
    format,
    failOn,
    writeReport: flags.has("write-report"),
  });
  process.stdout.write(`${result.output}\n`);
  if (result.writtenPaths.length > 0) {
    process.stdout.write(`Wrote: ${result.writtenPaths.join(", ")}\n`);
  }
  process.exit(result.exitCode);
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

function cmdRecordEvent(rest: string[]): void {
  const { options } = parseArgs(rest);
  const eventJson = options.get("event");
  const sdlcDir = options.get("sdlc-dir") ?? join(process.cwd(), ".sdlc");

  if (!eventJson) {
    fail("record-event: --event <json> is required");
  }

  let event: LoopTraceEvent;
  try {
    const parsed = JSON.parse(eventJson!);
    if (!isLoopTraceEvent(parsed)) {
      fail("record-event: event must include a valid loop trace type");
    }
    event = parsed;
  } catch (err) {
    fail(`record-event: invalid JSON in --event: ${err}`);
  }

  const approvalKey = approvalEventKey(event);
  if (approvalKey) {
    const alreadyRecorded = readLoopEvents(sdlcDir).some(
      (recorded) => approvalEventKey(recorded) === approvalKey,
    );
    if (alreadyRecorded) {
      process.stdout.write(`Skipped duplicate ${event.type} event in ${sdlcDir}\n`);
      return;
    }
  }

  const path = appendLoopEvent(sdlcDir, event);
  process.stdout.write(`Recorded ${event.type} event to ${path}\n`);
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "setup":
    case "init":
      cmdSetup(rest);
      return;
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
    case "bench":
      cmdBench(rest);
      return;
    case "explain":
      cmdExplain(rest);
      return;
    case "record-event":
      cmdRecordEvent(rest);
      return;
    case "garden-docs":
      cmdGardenDocs(rest);
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
