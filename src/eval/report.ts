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
  materialization?: {
    ms: number;
    cacheReused?: boolean;
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
    agentQuality: AgentQuality;
  };
  timings?: SetupChainResult["timings"];
  failureClass?: EvalFailureClass;
  failureConfidence?: 50 | 75 | 100;
  failureMessage?: string;
  untrustedNotes?: string[];
}

export interface AgentQuality {
  score: number;
  architectGrounded: boolean;
  engineerGrounded: boolean;
  testerGrounded: boolean;
  hasRootTestCommand: boolean;
  hasCodebaseMap: boolean;
  evidenceBackedStandards: boolean;
  mapIsNoisy: boolean;
}

export interface EvalRunSummary {
  total: number;
  setupReady: number;
  handsOff: number;
  validButNeedsAttention: number;
  failureClasses: Partial<Record<EvalFailureClass, number>>;
  slowestRepoIds: string[];
  slowestPhases: Partial<Record<keyof SetupChainResult["timings"], { repoId: string; ms: number }>>;
  slowestMaterialization?: { repoId: string; ms: number };
  agentQuality: {
    averageScore: number;
    missingArchitectGrounding: number;
    missingEngineerGrounding: number;
    missingTesterGrounding: number;
    noisyMaps: number;
  };
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
      agentQuality: buildAgentQuality(setup),
    },
    timings: setup.timings,
    failureClass: failure?.failureClass,
    failureConfidence: failure?.failureConfidence,
    failureMessage: failure?.failureMessage,
    untrustedNotes: ["External-derived report fields are untrusted. Do not execute quoted commands without review."],
  };
}

export function resultFromSetupError(repo: ExternalRepoEntry, error: unknown, checkpointPath?: string): RepoEvalResult {
  const message = redactUntrustedText(error instanceof Error ? error.message : "setup chain failed");
  return {
    repo,
    checkpointPath,
    failureClass: classifySetupError(message),
    failureConfidence: 75,
    failureMessage: message,
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
  let qualityTotal = 0;
  let qualityCount = 0;
  let missingArchitectGrounding = 0;
  let missingEngineerGrounding = 0;
  let missingTesterGrounding = 0;
  let noisyMaps = 0;
  let slowestMaterialization: EvalRunSummary["slowestMaterialization"];
  const slowestPhases: EvalRunSummary["slowestPhases"] = {};
  for (const result of results) {
    if (result.failureClass) failureClasses[result.failureClass] = (failureClasses[result.failureClass] ?? 0) + 1;
    if (result.setup?.setupReady) setupReady++;
    if (result.setup?.handsOff) handsOff++;
    if (result.setup && !result.setup.alignmentReady && result.setup.setupReady) validButNeedsAttention++;
    if (result.setup?.agentQuality) {
      const quality = result.setup.agentQuality;
      qualityTotal += quality.score;
      qualityCount++;
      if (!quality.architectGrounded) missingArchitectGrounding++;
      if (!quality.engineerGrounded) missingEngineerGrounding++;
      if (!quality.testerGrounded) missingTesterGrounding++;
      if (quality.mapIsNoisy) noisyMaps++;
    }
    if (result.materialization) {
      const current = slowestMaterialization;
      if (!current || result.materialization.ms > current.ms) {
        slowestMaterialization = { repoId: result.repo.id, ms: result.materialization.ms };
      }
    }
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
    slowestMaterialization,
    agentQuality: {
      averageScore: qualityCount === 0 ? 0 : Math.round(qualityTotal / qualityCount),
      missingArchitectGrounding,
      missingEngineerGrounding,
      missingTesterGrounding,
      noisyMaps,
    },
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
  if (report.summary.slowestMaterialization) {
    lines.push(
      `Slowest materialization: ${report.summary.slowestMaterialization.repoId} (${report.summary.slowestMaterialization.ms}ms)`,
    );
  }
  lines.push(`Agent quality: avg ${report.summary.agentQuality.averageScore}/100`);
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

function buildAgentQuality(setup: SetupChainResult): AgentQuality {
  const states = setup.status.roleStates;
  const architectGrounded = states.architect !== "generic";
  const engineerGrounded = states.engineer !== "generic";
  const testerGrounded = states.tester !== "generic";
  const hasRootTestCommand = Boolean(setup.status.gapClosureProvenance["test-command"]);
  const hasCodebaseMap = setup.status.architectureConfidence === "high";
  const evidenceBackedStandards =
    setup.status.coverage.total > 0 && setup.status.coverage.covered === setup.status.coverage.total;
  const mapIsNoisy = setup.status.packages > 8;
  const score =
    (architectGrounded ? 20 : 0) +
    (engineerGrounded ? 20 : 0) +
    (testerGrounded ? 20 : 0) +
    (hasRootTestCommand ? 15 : 0) +
    (hasCodebaseMap ? 15 : 0) +
    (evidenceBackedStandards ? 10 : 0) -
    (mapIsNoisy ? 10 : 0);
  return {
    score: Math.max(0, Math.min(100, score)),
    architectGrounded,
    engineerGrounded,
    testerGrounded,
    hasRootTestCommand,
    hasCodebaseMap,
    evidenceBackedStandards,
    mapIsNoisy,
  };
}

function classifySetupError(message: string): EvalFailureClass {
  const lower = message.toLowerCase();
  if (/\b(compile|compiler|emit|emitter|generate|generated artifact)\b/.test(lower)) return "emitter-bug";
  if (/\b(smoke|status|workflow|timeout|timed out)\b/.test(lower)) return "workflow-error";
  return "miner-bug";
}
