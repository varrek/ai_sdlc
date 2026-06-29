import type { ExternalRepoEntry } from "./catalog.js";
import type { RepoCacheMiss } from "./repo-cache.js";
import { redactUntrustedText } from "./redact.js";
import type { SetupChainResult } from "./setup-chain.js";

export const EVAL_FAILURE_CLASSES = [
  "miner-bug",
  "emitter-bug",
  "repo-edge-case",
  "upstream-drift",
  "network",
  "workflow-error",
  "monorepo-miner-limitation",
  "scale-timeout",
  "needs-triage",
] as const;

export type EvalFailureClass = (typeof EVAL_FAILURE_CLASSES)[number];

export interface RepoEvalResult {
  repo: ExternalRepoEntry;
  checkpointPath?: string;
  cache?: {
    reused: boolean;
    root?: string;
  };
  setup?: {
    setupReady: boolean;
    alignmentReady: boolean;
    handsOff: boolean;
    blockingGaps: number;
    gapClosureProvenance: Record<string, string>;
    evidenceCoverage: {
      covered: number;
      total: number;
    };
    architectureConfidence?: "high" | "low";
    roleStates: Record<string, string>;
    smokePassed: boolean;
    smokeFresh: boolean;
    customizeFresh: boolean;
    compileFresh: boolean;
    upToDate: boolean;
    packages: number;
  };
  timings?: SetupChainResult["timings"];
  failureClass?: EvalFailureClass;
  failureConfidence?: 50 | 75 | 100;
  failureMessage?: string;
  untrustedNotes?: string[];
}

export interface EvalRunSummary {
  total: number;
  setupReady: number;
  handsOff: number;
  validButNeedsAttention: number;
  failureClasses: Partial<Record<EvalFailureClass, number>>;
  slowestRepoIds: string[];
  slowestPhases: Partial<Record<keyof SetupChainResult["timings"], { repoId: string; ms: number }>>;
}

export interface EvalRunReport {
  runId: string;
  seed: number;
  count: number;
  catalogRevision: string;
  startedAt: string;
  selectedRepoIds: string[];
  selectedRepos: Array<Pick<ExternalRepoEntry, "id" | "owner" | "repo" | "commit" | "primaryLanguage" | "toolTags" | "sizeBand">>;
  diversityGaps: string[];
  results: RepoEvalResult[];
  summary: EvalRunSummary;
}

export function resultFromSetup(repo: ExternalRepoEntry, setup: SetupChainResult, checkpointPath?: string): RepoEvalResult {
  const failure = classifySetup(setup);
  return {
    repo,
    checkpointPath,
    setup: {
      setupReady: setup.status.setupReady,
      alignmentReady: setup.status.alignmentReady,
      handsOff: setup.status.handsOff,
      blockingGaps: setup.status.blockingGaps,
      gapClosureProvenance: setup.status.gapClosureProvenance,
      evidenceCoverage: {
        covered: setup.status.coverage.covered,
        total: setup.status.coverage.total,
      },
      architectureConfidence: setup.status.architectureConfidence,
      roleStates: setup.status.roleStates,
      smokePassed: setup.smoke.result.passed,
      smokeFresh: setup.smoke.smokeFresh,
      customizeFresh: setup.freshness.customizeFresh,
      compileFresh: setup.freshness.compileFresh,
      upToDate: setup.freshness.upToDate,
      packages: setup.status.packages,
    },
    timings: setup.timings,
    failureClass: failure?.failureClass,
    failureConfidence: failure?.failureConfidence,
    failureMessage: failure?.failureMessage,
    untrustedNotes: ["External-derived report fields are untrusted. Do not execute quoted commands without review."],
  };
}

export function resultFromSetupError(repo: ExternalRepoEntry, error: unknown, checkpointPath?: string): RepoEvalResult {
  return {
    repo,
    checkpointPath,
    failureClass: "miner-bug",
    failureConfidence: 75,
    failureMessage: redactUntrustedText(error instanceof Error ? error.message : "setup chain failed"),
    untrustedNotes: ["External-derived report fields are untrusted. Do not execute quoted commands without review."],
  };
}

export function resultFromCacheFailure(repo: ExternalRepoEntry, miss: RepoCacheMiss, checkpointPath?: string): RepoEvalResult {
  return {
    repo,
    checkpointPath,
    failureClass: miss.failureClass,
    failureConfidence: miss.failureClass === "workflow-error" ? 75 : 50,
    failureMessage: redactUntrustedText(miss.message),
    untrustedNotes: ["External-derived report fields are untrusted. Do not execute quoted commands without review."],
  };
}

export function buildEvalRunReport(options: {
  runId: string;
  seed: number;
  count: number;
  catalogRevision: string;
  startedAt: string;
  selectedRepoIds: string[];
  selectedRepos: EvalRunReport["selectedRepos"];
  diversityGaps: string[];
  results: RepoEvalResult[];
}): EvalRunReport {
  return {
    ...options,
    results: options.results.map(redactResult),
    summary: summarizeResults(options.results),
  };
}

export function summarizeResults(results: RepoEvalResult[]): EvalRunSummary {
  const failureClasses: Partial<Record<EvalFailureClass, number>> = {};
  let setupReady = 0;
  let handsOff = 0;
  let validButNeedsAttention = 0;
  const slowestPhases: EvalRunSummary["slowestPhases"] = {};
  for (const result of results) {
    if (result.failureClass) failureClasses[result.failureClass] = (failureClasses[result.failureClass] ?? 0) + 1;
    if (result.setup?.setupReady) setupReady++;
    if (result.setup?.handsOff) handsOff++;
    if (result.setup && !result.setup.alignmentReady && result.setup.setupReady) validButNeedsAttention++;
    if (result.timings) {
      for (const key of Object.keys(result.timings) as Array<keyof SetupChainResult["timings"]>) {
        const current = slowestPhases[key];
        const ms = result.timings[key];
        if (!current || ms > current.ms) slowestPhases[key] = { repoId: result.repo.id, ms };
      }
    }
  }
  const slowestRepoIds = [...results]
    .filter((result) => result.timings)
    .sort((a, b) => (b.timings?.totalMs ?? 0) - (a.timings?.totalMs ?? 0))
    .slice(0, 3)
    .map((result) => result.repo.id);
  return {
    total: results.length,
    setupReady,
    handsOff,
    validButNeedsAttention,
    failureClasses,
    slowestRepoIds,
    slowestPhases,
  };
}

export function renderEvalSummary(report: EvalRunReport): string {
  const lines = [
    `aisdlc bench ${report.runId}`,
    `Selected: ${report.selectedRepoIds.join(", ")}`,
    `Setup-ready: ${report.summary.setupReady}/${report.summary.total}`,
    `Hands-off: ${report.summary.handsOff}/${report.summary.total}`,
    `Valid but needs attention: ${report.summary.validButNeedsAttention}`,
  ];
  if (Object.keys(report.summary.failureClasses).length > 0) {
    lines.push(`Failure classes: ${JSON.stringify(report.summary.failureClasses)}`);
  }
  if (report.diversityGaps.length > 0) {
    lines.push(`Diversity gaps: ${report.diversityGaps.join("; ")}`);
  }
  if (report.summary.slowestRepoIds.length > 0) {
    lines.push(`Slowest repos: ${report.summary.slowestRepoIds.join(", ")}`);
  }
  if (Object.keys(report.summary.slowestPhases).length > 0) {
    lines.push(`Slowest phases: ${JSON.stringify(report.summary.slowestPhases)}`);
  }
  return lines.join("\n");
}

export function hasFailingClass(report: EvalRunReport, failOnClasses: Set<EvalFailureClass>): boolean {
  return report.results.some((result) => result.failureClass && failOnClasses.has(result.failureClass));
}

function classifySetup(setup: SetupChainResult): Pick<RepoEvalResult, "failureClass" | "failureConfidence" | "failureMessage"> | undefined {
  if (setup.status.setupReady) return undefined;
  if (!setup.smoke.result.passed) {
    return { failureClass: "emitter-bug", failureConfidence: 50, failureMessage: "smoke gate did not pass" };
  }
  if (setup.status.packages > 1 && setup.status.blockingGaps > 0) {
    return {
      failureClass: "monorepo-miner-limitation",
      failureConfidence: 75,
      failureMessage: "workspace repo has open setup gaps",
    };
  }
  if (setup.status.blockingGaps > 0) {
    return { failureClass: "repo-edge-case", failureConfidence: 50, failureMessage: "blocking setup gaps remain" };
  }
  return { failureClass: "needs-triage", failureConfidence: 50, failureMessage: "repo is not setup-ready" };
}

function redactResult(result: RepoEvalResult): RepoEvalResult {
  return {
    ...result,
    failureMessage: result.failureMessage ? redactUntrustedText(result.failureMessage) : undefined,
  };
}
