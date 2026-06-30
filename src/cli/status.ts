import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type AcceptedLearningEntry,
  filterAcceptedLearningsByKinds,
  LOOP_DERIVED_LEARNING_KINDS,
  readAcceptedLearnings,
  summarizeAcceptedLearnings,
} from "../core/accepted-learnings.js";
import { HOST_SETUP_GUIDE_PATH } from "../core/host-setup-guidance.js";
import {
  INSTRUCTION_HIERARCHY_FILE,
  loadInstructionHierarchy,
  loadProjectContext,
  PROJECT_CONTEXT_FILE,
} from "../core/loader.js";
import { stagesForTrack } from "../core/loop.js";
import { acceptedInstructionScopes } from "../core/project-context.js";
import {
  hasDeterministicEngineerGrounding,
  hasDeterministicTesterGrounding,
  SETUP_GROUNDING_LEARNINGS_BY_ROLE,
} from "../core/role-grounding.js";
import {
  buildProjectContext,
  type EvidenceCoverage,
  type EvidenceQuality,
  evidenceCoverage,
  evidenceQuality,
} from "../customize/emitters.js";
import { readSetupState, type SetupPhase } from "../customize/setup-state.js";
import {
  readLoopBehaviorEvalState,
  summarizeBehaviorEval,
} from "../eval/loop-behavior-eval-state.js";
import type { HostId, OperatingMode } from "../schema/index.js";
import { compiledArtifactsPresent } from "./compile.js";
import { inspectRepo } from "./customize.js";
import {
  baseFingerprint,
  compiledFingerprint,
  emittedFingerprint,
  emittedHostSelection,
  emittedPackDirs,
  overlayFingerprint,
} from "./phase-fingerprints.js";

export interface StatusReport {
  /** True once `aisdlc customize` has produced an overlay. */
  initialized: boolean;
  /** Declared project setup mode from `.customize.yaml`. */
  operatingMode: OperatingMode;
  /** True when a re-run would be a no-op (mined + overlay phases fresh). */
  upToDate: boolean;
  setupReady: boolean;
  hostSetupGuidePresent: boolean;
  alignmentReady: boolean;
  validButNeedsAttention: boolean;
  stalePhases: SetupPhase[];
  nextAction?: "customize" | "compile" | "smoke";
  handsOff: boolean;
  gapClosureProvenance: Record<string, string>;
  architectureConfidence?: "high" | "low";
  architectureReasons: string[];
  evidenceQuality: EvidenceQuality;
  roleStates: Record<string, "generic" | "deterministic" | "llm-authored" | "deterministic+llm">;
  /** Open blocking interview gaps (deferred integrations excluded by construction). */
  blockingGaps: number;
  coverage: EvidenceCoverage;
  /** Workspace packages detected (0 for a single-package repo). */
  packages: number;
  hierarchy: {
    acceptedScopes: number;
    packageScopes: number;
    moduleScopes: number;
  };
  /** Standard statements, in the order `aisdlc explain <n>` numbers them (1-based). */
  standards: string[];
  acceptedLearnings: {
    count: number;
    claims: string[];
  };
  loopQuality: {
    expectedStages: number;
    groundedRoles: number;
    totalRoles: number;
    groundedGroundableRoles: number;
    groundableRoles: number;
    roleGroundingComplete: boolean;
    approvalGateCoverage: "compiled" | "not-run";
    handoffCoverage: "compiled" | "not-run";
    behaviorEval: {
      state: "not-run" | "passed" | "failed" | "partial";
      passed: number;
      total: number;
    };
    loopLearnings: number;
  };
}

export interface StatusOptions {
  repoRoot: string;
  overlayDir?: string;
  sdlcDir?: string;
  baseDir?: string;
  packDirs?: string[];
  outDir?: string;
  hosts?: HostId[];
}

/** Read-only: derive the four strategy metrics for the current repo. Never writes. */
export function buildStatus(options: StatusOptions): StatusReport {
  const inspection = inspectRepo(options);
  const overlayDir = options.overlayDir ?? join(options.repoRoot, ".sdlc", "overlay");
  const sdlcDir = options.sdlcDir ?? dirname(overlayDir);
  const overlayPath = join(overlayDir, ".customize.yaml");
  const outDir = options.outDir ?? options.repoRoot;
  const statusHosts = options.hosts ?? emittedHostSelection(outDir);
  const statusPackDirs = options.packDirs ?? emittedPackDirs(outDir);
  const state = readSetupState(sdlcDir);
  const phaseStatus = setupPhaseStatus({
    state,
    upToDate: inspection.upToDate,
    overlayPath,
    sdlcDir,
    baseDir: options.baseDir,
    packDirs: statusPackDirs,
    outDir,
    hosts: statusHosts,
  });
  const hostSetupGuidePresent = existsSync(join(outDir, HOST_SETUP_GUIDE_PATH));
  const setupReady =
    inspection.gaps.length === 0 &&
    phaseStatus.known &&
    !phaseStatus.stalePhases.includes("smoke-passed");
  const quality = evidenceQuality(inspection.profile, inspection.standardsIndex);
  const archConfidence = inspection.profile.architecture?.confidence;
  const validButNeedsAttention = archConfidence === "low" || quality.lowValueSources.length > 0;
  const provenance = inspection.overlay.gapClosureProvenance;
  const provenanceValues = Object.values(provenance);
  const handsOff =
    setupReady &&
    provenanceValues.length > 0 &&
    provenanceValues.every((p) => p === "miner" || p === "ci");
  const minedProjectContext = buildProjectContext(inspection.profile, inspection.standardsIndex);
  const persistedProjectContext = loadProjectContext(join(overlayDir, PROJECT_CONTEXT_FILE));
  const persistedHierarchy = loadInstructionHierarchy(join(overlayDir, INSTRUCTION_HIERARCHY_FILE));
  const projectContext = persistedProjectContext
    ? {
        ...persistedProjectContext,
        instructionHierarchy: persistedHierarchy ?? persistedProjectContext.instructionHierarchy,
      }
    : minedProjectContext;
  const hierarchyScopes = acceptedInstructionScopes(projectContext);
  const groundingInput = { overlay: inspection.overlay, projectContext };
  const engineerDeterministic = hasDeterministicEngineerGrounding(groundingInput);
  const testerDeterministic = hasDeterministicTesterGrounding(groundingInput);
  const acceptedLearnings = readAcceptedLearnings(sdlcDir);
  const roleStates = {
    architect: roleState(
      archConfidence === "high" || hasRelevantLearning(acceptedLearnings, "architect"),
      Boolean(inspection.overlay.roleAddenda.architect),
    ),
    engineer: roleState(engineerDeterministic, Boolean(inspection.overlay.roleAddenda.engineer)),
    tester: roleState(
      testerDeterministic || hasRelevantLearning(acceptedLearnings, "tester"),
      Boolean(inspection.overlay.roleAddenda.tester),
    ),
    reviewer: roleState(
      hasRelevantLearning(acceptedLearnings, "reviewer"),
      Boolean(inspection.overlay.roleAddenda.reviewer),
    ),
    debugger: roleState(false, Boolean(inspection.overlay.roleAddenda.debugger)),
  };
  const totalRoles = Object.keys(roleStates).length;
  const groundedRoles = Object.values(roleStates).filter((state) => state !== "generic").length;
  const groundableRoleNames = ["architect", "engineer", "tester", "reviewer"] as const;
  const groundableRoles = groundableRoleNames.length;
  const groundedGroundableRoles = groundableRoleNames.filter(
    (role) => roleStates[role] !== "generic",
  ).length;
  const track = inspection.overlay.defaultTrack ?? "standard";
  const expectedStages = stagesForTrack(track).length;
  const loopLearnings = filterAcceptedLearningsByKinds(
    acceptedLearnings,
    LOOP_DERIVED_LEARNING_KINDS,
  ).length;
  const compiledCoverageState = phaseStatus.stalePhases.includes("compiled")
    ? "not-run"
    : "compiled";
  const evalState = readLoopBehaviorEvalState(sdlcDir);
  const behaviorEval = summarizeBehaviorEval(evalState);
  return {
    initialized: inspection.initialized,
    operatingMode: inspection.overlay.operatingMode,
    upToDate: inspection.upToDate,
    setupReady,
    hostSetupGuidePresent,
    alignmentReady: setupReady && !validButNeedsAttention,
    validButNeedsAttention,
    stalePhases: phaseStatus.stalePhases,
    nextAction: phaseStatus.nextAction,
    handsOff,
    gapClosureProvenance: provenance,
    architectureConfidence: archConfidence,
    architectureReasons: inspection.profile.architecture?.reasons ?? [],
    evidenceQuality: quality,
    roleStates,
    blockingGaps: inspection.gaps.length,
    coverage: evidenceCoverage(inspection.standardsIndex),
    packages: inspection.profile.packages?.length ?? 0,
    hierarchy: {
      acceptedScopes: hierarchyScopes.length,
      packageScopes: hierarchyScopes.filter((scope) => scope.kind === "package").length,
      moduleScopes: hierarchyScopes.filter((scope) => scope.kind === "module").length,
    },
    standards: inspection.standardsIndex.standards.map((s) => s.statement),
    acceptedLearnings: {
      count: acceptedLearnings.length,
      claims: summarizeAcceptedLearnings(acceptedLearnings),
    },
    loopQuality: {
      expectedStages,
      groundedRoles,
      totalRoles,
      groundedGroundableRoles,
      groundableRoles,
      roleGroundingComplete: groundedGroundableRoles === groundableRoles,
      approvalGateCoverage: compiledCoverageState,
      handoffCoverage: compiledCoverageState,
      behaviorEval,
      loopLearnings,
    },
  };
}

function setupPhaseStatus(options: {
  state: ReturnType<typeof readSetupState>;
  upToDate: boolean;
  overlayPath: string;
  sdlcDir: string;
  baseDir?: string;
  packDirs?: string[];
  outDir: string;
  hosts?: HostId[];
}): { stalePhases: SetupPhase[]; nextAction?: StatusReport["nextAction"]; known: boolean } {
  if (!options.upToDate) {
    return {
      stalePhases: ["mined", "overlay-written", "compiled", "smoke-passed"],
      nextAction: "customize",
      known: true,
    };
  }
  const stale: SetupPhase[] = [];
  if (options.baseDir && existsSync(options.baseDir)) {
    const overlayFp = overlayFingerprint(options.overlayPath, options.sdlcDir);
    const baseFp = baseFingerprint(options.baseDir, options.sdlcDir, options.packDirs);
    const compiledFp = compiledFingerprint(overlayFp, baseFp, options.hosts);
    const smokeFp = emittedFingerprint(options.outDir, baseFp);
    if (
      options.state.phases.compiled?.fingerprint !== compiledFp ||
      !compiledArtifactsPresent(options.outDir)
    ) {
      stale.push("compiled");
    }
    if (stale.length > 0 || options.state.phases["smoke-passed"]?.fingerprint !== smokeFp) {
      stale.push("smoke-passed");
    }
  } else {
    return { stalePhases: ["compiled", "smoke-passed"], nextAction: "compile", known: false };
  }
  const first = stale[0];
  const nextAction =
    first === "compiled" ? "compile" : first === "smoke-passed" ? "smoke" : undefined;
  return { stalePhases: stale, nextAction, known: true };
}

function roleState(
  hasDeterministicGrounding: boolean,
  hasLlmAddendum: boolean,
): "generic" | "deterministic" | "llm-authored" | "deterministic+llm" {
  if (hasDeterministicGrounding && hasLlmAddendum) return "deterministic+llm";
  if (hasDeterministicGrounding) return "deterministic";
  if (hasLlmAddendum) return "llm-authored";
  return "generic";
}

function hasRelevantLearning(
  entries: AcceptedLearningEntry[],
  role: keyof typeof SETUP_GROUNDING_LEARNINGS_BY_ROLE,
): boolean {
  return (
    filterAcceptedLearningsByKinds(entries, SETUP_GROUNDING_LEARNINGS_BY_ROLE[role] ?? []).length >
    0
  );
}

function pct(covered: number, total: number): string {
  if (total === 0) return "n/a";
  return `${Math.round((covered / total) * 100)}%`;
}

/** Render a status report as a compact, human-readable block. */
export function formatStatus(report: StatusReport): string {
  const { coverage } = report;
  const lines: string[] = ["aisdlc status", ""];

  if (!report.initialized) {
    lines.push("Setup: not yet run — run `aisdlc customize` first.");
    return lines.join("\n");
  }

  lines.push("Setup: initialized");
  lines.push(`Operating mode: ${report.operatingMode}`);
  lines.push(`Setup-ready: ${report.setupReady ? "yes" : "no"}`);
  if (report.setupReady && report.hostSetupGuidePresent) {
    lines.push("Host activation guide: .sdlc/host-setup.md");
  }
  lines.push(
    `Alignment-ready: ${report.alignmentReady ? "yes" : report.validButNeedsAttention ? "needs attention" : "no"}`,
  );
  lines.push(
    report.upToDate
      ? "Freshness: up to date (a re-run would be a no-op)"
      : "Freshness: stale — re-run `aisdlc customize` to re-align",
  );
  if (report.stalePhases.length > 0) {
    lines.push(`Stale phases: ${report.stalePhases.join(", ")}`);
    if (report.nextAction) lines.push(`Next action: aisdlc ${report.nextAction}`);
  }
  lines.push(`Blocking gaps: ${report.blockingGaps}`);
  lines.push(`Hands-off setup: ${report.handsOff ? "yes" : "no"}`);
  if (Object.keys(report.gapClosureProvenance).length > 0) {
    lines.push(`Gap closure provenance: ${JSON.stringify(report.gapClosureProvenance)}`);
  }
  if (report.architectureConfidence) {
    lines.push(`Architecture confidence: ${report.architectureConfidence}`);
    if (report.architectureReasons.length > 0)
      lines.push(`Architecture reasons: ${report.architectureReasons.join("; ")}`);
  }
  if (report.packages > 0) {
    lines.push(`Workspace packages: ${report.packages} (per-package instructions emitted)`);
  }
  if (report.hierarchy.acceptedScopes > 0) {
    lines.push(
      `Instruction hierarchy: ${report.hierarchy.acceptedScopes} accepted scope(s) (${report.hierarchy.packageScopes} package, ${report.hierarchy.moduleScopes} module)`,
    );
  }
  lines.push(
    `Evidence coverage: ${coverage.covered}/${coverage.total} standards cite a source (${pct(coverage.covered, coverage.total)})`,
  );
  if (coverage.uncited.length > 0) {
    lines.push("Uncited standards:");
    for (const s of coverage.uncited) lines.push(`  - ${s}`);
  }
  if (report.evidenceQuality.lowValueSources.length > 0) {
    lines.push(`Low-value evidence sources: ${report.evidenceQuality.lowValueSources.join(", ")}`);
  }
  lines.push(
    `Role grounding: architect=${report.roleStates.architect}, engineer=${report.roleStates.engineer}, tester=${report.roleStates.tester}, reviewer=${report.roleStates.reviewer}, debugger=${report.roleStates.debugger}`,
  );
  const behaviorEvalDisplay =
    report.loopQuality.behaviorEval.state === "not-run"
      ? "not-run"
      : `${report.loopQuality.behaviorEval.state} (${report.loopQuality.behaviorEval.passed}/${report.loopQuality.behaviorEval.total})`;
  lines.push(
    `Loop quality: stages=${report.loopQuality.expectedStages}, grounded roles=${report.loopQuality.groundedGroundableRoles}/${report.loopQuality.groundableRoles} groundable (${report.loopQuality.groundedRoles}/${report.loopQuality.totalRoles} total), handoffs=${report.loopQuality.handoffCoverage}, approval gates=${report.loopQuality.approvalGateCoverage}, behavior eval=${behaviorEvalDisplay}, loop learnings=${report.loopQuality.loopLearnings}`,
  );
  if (report.acceptedLearnings.count > 0) {
    lines.push(`Accepted learnings (${report.acceptedLearnings.count}):`);
    for (const claim of report.acceptedLearnings.claims) {
      lines.push(`  - ${claim}`);
    }
  }

  lines.push("", "Standards:");
  report.standards.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));

  return lines.join("\n");
}
