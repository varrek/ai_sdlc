import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import YAML from "yaml";
import { runCompileCli } from "../cli/compile.js";
import { type CustomizeResult, runCustomize } from "../cli/customize.js";
import { runSmokeCli, type SmokeCliResult } from "../cli/smoke.js";
import { buildStatus, type StatusReport } from "../cli/status.js";
import type { ProjectContext } from "../core/project-context.js";
import { parseProjectContext } from "../core/project-context.js";
import type { HostId, OperatingMode } from "../schema/index.js";

export interface OverlaySnapshot {
  interviewAnswers: Record<string, string>;
  gapClosureProvenance: Record<string, string>;
  roleAddenda: Record<string, string>;
}

export interface SetupArtifacts {
  smoke: SmokeCliResult;
  status: StatusReport;
  projectContext: ProjectContext;
  standardsIndex: string;
  architect: string;
  engineer: string;
  tester: string;
  reviewer: string;
  debugger: string;
  constitution: string;
  overlay: OverlaySnapshot;
}

export interface SetupPhaseTimings {
  customizeMs: number;
  compileMs: number;
  smokeMs: number;
  statusMs: number;
  totalMs: number;
}

export interface SetupChainResult extends SetupArtifacts {
  customize: CustomizeResult;
  freshness: {
    customizeFresh: boolean;
    compileFresh: boolean;
    smokeFresh: boolean;
    upToDate: boolean;
  };
  timings: SetupPhaseTimings;
}

export interface SetupChainOptions {
  baseDir: string;
  operatingMode?: OperatingMode;
  hosts?: HostId[];
  force?: boolean;
  collectArtifacts?: boolean;
}

const EMPTY_PROJECT_CONTEXT: ProjectContext = { packages: [], map: [], exclusions: [] };

export class SetupChainArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupChainArtifactError";
  }
}

export function runSetupChain(root: string, options: SetupChainOptions): SetupChainResult {
  const totalStart = performance.now();
  const sdlcDir = join(root, ".sdlc");
  const overlayDir = join(sdlcDir, "overlay");
  const overlayPath = join(overlayDir, ".customize.yaml");

  const customize = timed(() =>
    runCustomize({
      repoRoot: root,
      overlayDir,
      sdlcDir,
      force: options.force,
      operatingMode: options.operatingMode,
    }),
  );
  const compile = timed(() =>
    runCompileCli({
      baseDir: options.baseDir,
      overlayPath,
      outDir: root,
      sdlcDir,
      hosts: options.hosts,
      force: options.force,
    }),
  );
  const smoke = timed(() =>
    runSmokeCli({
      baseDir: options.baseDir,
      overlayPath,
      configDir: root,
      sdlcDir,
      repoRoot: root,
      force: options.force,
    }),
  );
  const status = timed(() =>
    buildStatus({
      repoRoot: root,
      overlayDir,
      sdlcDir,
      baseDir: options.baseDir,
      outDir: root,
    }),
  );

  const artifacts =
    options.collectArtifacts === false
      ? emptySetupArtifacts(smoke.value, status.value)
      : readSetupArtifacts(root, overlayDir, overlayPath, smoke.value, status.value);
  return {
    ...artifacts,
    customize: customize.value,
    freshness: {
      customizeFresh: customize.value.freshnessSkipped,
      compileFresh: compile.value.freshnessSkipped,
      smokeFresh: smoke.value.smokeFresh,
      upToDate: status.value.upToDate,
    },
    timings: {
      customizeMs: customize.ms,
      compileMs: compile.ms,
      smokeMs: smoke.ms,
      statusMs: status.ms,
      totalMs: elapsed(totalStart),
    },
  };
}

export function runGenericSetupChain(
  root: string,
  options: Pick<SetupChainOptions, "baseDir" | "hosts">,
): SetupArtifacts {
  const sdlcDir = join(root, ".sdlc");
  runCompileCli({ baseDir: options.baseDir, outDir: root, sdlcDir, hosts: options.hosts });
  const smoke = runSmokeCli({ baseDir: options.baseDir, configDir: root, sdlcDir, repoRoot: root });
  const overlayDir = join(sdlcDir, "overlay");
  const status = buildStatus({
    repoRoot: root,
    overlayDir,
    sdlcDir,
    baseDir: options.baseDir,
    outDir: root,
  });
  return {
    smoke,
    status,
    projectContext: readProjectContext(overlayDir),
    standardsIndex: readOptionalUtf8(join(overlayDir, "standards-index.yaml")),
    architect: readFileSync(join(root, ".cursor", "agents", "architect.md"), "utf8"),
    engineer: readOptionalUtf8(join(root, ".cursor", "agents", "engineer.md")),
    tester: readOptionalUtf8(join(root, ".cursor", "agents", "tester.md")),
    reviewer: readOptionalUtf8(join(root, ".cursor", "agents", "reviewer.md")),
    debugger: readOptionalUtf8(join(root, ".cursor", "agents", "debugger.md")),
    constitution: readFileSync(join(root, "AGENTS.md"), "utf8"),
    overlay: { interviewAnswers: {}, gapClosureProvenance: {}, roleAddenda: {} },
  };
}

function readSetupArtifacts(
  root: string,
  overlayDir: string,
  overlayPath: string,
  smoke: SmokeCliResult,
  status: StatusReport,
): SetupArtifacts {
  let overlayRaw: {
    interviewAnswers?: Record<string, string>;
    gapClosureProvenance?: Record<string, string>;
    roleAddenda?: Record<string, string>;
  };
  try {
    overlayRaw = YAML.parse(readRequiredUtf8(overlayPath, overlayPath)) as typeof overlayRaw;
  } catch (error) {
    if (error instanceof SetupChainArtifactError) throw error;
    throw new SetupChainArtifactError(
      `overlay parse failed at ${overlayPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    smoke,
    status,
    projectContext: readProjectContext(overlayDir),
    standardsIndex: readRequiredUtf8(
      join(overlayDir, "standards-index.yaml"),
      "standards-index.yaml",
    ),
    architect: readRequiredUtf8(join(root, ".cursor", "agents", "architect.md"), "architect agent"),
    engineer: readRequiredUtf8(join(root, ".cursor", "agents", "engineer.md"), "engineer agent"),
    tester: readRequiredUtf8(join(root, ".cursor", "agents", "tester.md"), "tester agent"),
    reviewer: readRequiredUtf8(join(root, ".cursor", "agents", "reviewer.md"), "reviewer agent"),
    debugger: readRequiredUtf8(join(root, ".cursor", "agents", "debugger.md"), "debugger agent"),
    constitution: readRequiredUtf8(join(root, "AGENTS.md"), "AGENTS.md"),
    overlay: {
      interviewAnswers: overlayRaw.interviewAnswers ?? {},
      gapClosureProvenance: overlayRaw.gapClosureProvenance ?? {},
      roleAddenda: overlayRaw.roleAddenda ?? {},
    },
  };
}

function emptySetupArtifacts(smoke: SmokeCliResult, status: StatusReport): SetupArtifacts {
  return {
    smoke,
    status,
    projectContext: EMPTY_PROJECT_CONTEXT,
    standardsIndex: "",
    architect: "",
    engineer: "",
    tester: "",
    reviewer: "",
    debugger: "",
    constitution: "",
    overlay: { interviewAnswers: {}, gapClosureProvenance: {}, roleAddenda: {} },
  };
}

function readProjectContext(overlayDir: string): ProjectContext {
  const path = join(overlayDir, "project-context.json");
  if (!existsSync(path)) return EMPTY_PROJECT_CONTEXT;
  const parsed = parseProjectContext(readFileSync(path, "utf8"));
  return parsed ?? EMPTY_PROJECT_CONTEXT;
}

function readRequiredUtf8(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new SetupChainArtifactError(
      `missing or unreadable setup artifact '${label}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readOptionalUtf8(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const started = performance.now();
  return { value: fn(), ms: elapsed(started) };
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
