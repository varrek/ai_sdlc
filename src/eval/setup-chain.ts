import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import YAML from "yaml";
import { runCompileCli } from "../cli/compile.js";
import { type CustomizeResult, runCustomize } from "../cli/customize.js";
import { runSmokeCli, type SmokeCliResult } from "../cli/smoke.js";
import { buildStatus, type StatusReport } from "../cli/status.js";
import type { ProjectContext } from "../core/project-context.js";
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
  const overlayRaw = YAML.parse(readFileSync(overlayPath, "utf8")) as {
    interviewAnswers?: Record<string, string>;
    gapClosureProvenance?: Record<string, string>;
    roleAddenda?: Record<string, string>;
  };
  return {
    smoke,
    status,
    projectContext: readProjectContext(overlayDir),
    standardsIndex: readFileSync(join(overlayDir, "standards-index.yaml"), "utf8"),
    architect: readFileSync(join(root, ".cursor", "agents", "architect.md"), "utf8"),
    engineer: readFileSync(join(root, ".cursor", "agents", "engineer.md"), "utf8"),
    tester: readFileSync(join(root, ".cursor", "agents", "tester.md"), "utf8"),
    reviewer: readFileSync(join(root, ".cursor", "agents", "reviewer.md"), "utf8"),
    debugger: readFileSync(join(root, ".cursor", "agents", "debugger.md"), "utf8"),
    constitution: readFileSync(join(root, "AGENTS.md"), "utf8"),
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
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as ProjectContext)
    : EMPTY_PROJECT_CONTEXT;
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
