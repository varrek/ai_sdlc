import type { Overlay } from "../schema/index.js";
import type { RepoProfile } from "../customize/repo-miner.js";
import { inspectRepo } from "./customize.js";

export interface ExplainResult {
  ok: boolean;
  message: string;
}

export interface ExplainOptions {
  repoRoot: string;
  overlayDir?: string;
  sdlcDir?: string;
  /** 1-based standard index, as numbered by `aisdlc status`. */
  n: number;
}

export const EXPLAIN_CLAIM_KEYS = ["test-command", "architecture"] as const;
export type ExplainClaimKey = (typeof EXPLAIN_CLAIM_KEYS)[number];

export interface ExplainClaimOptions {
  repoRoot: string;
  overlayDir?: string;
  sdlcDir?: string;
  key: ExplainClaimKey;
}

export function isExplainClaimKey(value: string): value is ExplainClaimKey {
  return (EXPLAIN_CLAIM_KEYS as readonly string[]).includes(value);
}

function formatEvidenceSection(label: string, items: string[], emptyNote: string): string {
  if (items.length === 0) return `${label}:\n  ${emptyNote}`;
  return `${label}:\n${items.map((item) => `  - ${item}`).join("\n")}`;
}

function collectTestCommandPositiveEvidence(profile: RepoProfile): string[] {
  const paths = new Set<string>();
  for (const path of profile.evidence["test-command"] ?? []) paths.add(path);
  if (profile.testRunner) {
    for (const path of profile.evidence[`test-runner:${profile.testRunner}`] ?? []) paths.add(path);
  }
  return [...paths].sort();
}

function collectTestCommandNegativeEvidence(profile: RepoProfile, resolvedCommand: string | undefined): string[] {
  const negatives: string[] = [];
  if (!resolvedCommand) {
    negatives.push("No CI-mined or manifest-derived test command was resolved.");
    if (profile.conventions?.testLayout === "separate") {
      negatives.push("A dedicated tests/ layout is present but bare test directories do not infer a runner.");
    }
    if (profile.testRunner && !profile.testCommand) {
      negatives.push(
        `Runner \`${profile.testRunner}\` was detected but no runnable command was mined from CI or manifests.`,
      );
    }
  } else if (profile.conventions?.testLayout === "separate") {
    negatives.push("Bare tests/ directories alone would not infer a runner without explicit pytest/CI/config signals.");
  }
  return negatives;
}

function explainTestCommand(profile: RepoProfile, overlay: Overlay): ExplainResult {
  const resolvedCommand = overlay.interviewAnswers["test-command"]?.trim() || profile.testCommand;
  const provenance = overlay.gapClosureProvenance?.["test-command"];
  const positive = collectTestCommandPositiveEvidence(profile);
  const negative = collectTestCommandNegativeEvidence(profile, resolvedCommand);

  const valueLine = resolvedCommand
    ? `Value: \`${resolvedCommand}\``
    : "Value: (gap open — no authoritative test command yet)";
  const provenanceLine = provenance ? `Provenance: ${provenance}` : "Provenance: (not recorded)";

  const packageLines =
    profile.packages
      ?.filter((pkg) => pkg.testCommand)
      .map((pkg) => `  - \`${pkg.path}\`: \`${pkg.testCommand}\``) ?? [];
  const packagesSection =
    packageLines.length > 0 ? `\nPackage-local commands:\n${packageLines.join("\n")}` : "";

  const message = [
    "Claim: test-command",
    valueLine,
    provenanceLine,
    formatEvidenceSection("Positive evidence", positive, "(no supporting paths cited)"),
    formatEvidenceSection("Negative evidence", negative, "(none — claim is fully supported)"),
    packagesSection.trim(),
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return { ok: true, message };
}

function collectArchitecturePositiveEvidence(profile: RepoProfile): string[] {
  const paths = new Set<string>();
  for (const [claim, claimPaths] of Object.entries(profile.evidence)) {
    if (!claim.startsWith("architecture:")) continue;
    for (const path of claimPaths) paths.add(`${claim} → ${path}`);
  }
  return [...paths].sort();
}

function collectArchitectureNegativeEvidence(profile: RepoProfile): string[] {
  const arch = profile.architecture;
  if (!arch) return [];

  const negatives = arch.demotedRoots.map((root) => `${root} (demoted: low-value/tutorial/docs/demo surface)`);
  if (arch.confidence === "low") {
    for (const reason of arch.reasons) {
      negatives.push(`Low-confidence signal: ${reason}`);
    }
  }
  return negatives;
}

function explainArchitecture(profile: RepoProfile): ExplainResult {
  const arch = profile.architecture;
  if (!arch) {
    return {
      ok: true,
      message: [
        "Claim: architecture",
        "Value: (no architecture map — genuinely flat repo or insufficient module structure)",
        formatEvidenceSection("Positive evidence", [], "(no architecture claim emitted)"),
        formatEvidenceSection("Negative evidence", [], "(none)"),
      ].join("\n"),
    };
  }

  const where = arch.sourceRoot === "." ? "repo root" : `\`${arch.sourceRoot}/\``;
  const moduleList = arch.modules.map((m) => `\`${m}\``).join(", ");
  const entryList =
    arch.entrypoints.length > 0 ? arch.entrypoints.map((e) => `\`${e}\``).join(", ") : "(none cited)";

  const positive = collectArchitecturePositiveEvidence(profile);
  const negative = collectArchitectureNegativeEvidence(profile);

  const message = [
    "Claim: architecture",
    `Confidence: ${arch.confidence}`,
    `Primary root: ${where}`,
    `Modules: ${moduleList}`,
    `Entrypoints: ${entryList}`,
    formatEvidenceSection("Positive evidence", positive, "(no architecture evidence paths cited)"),
    formatEvidenceSection("Negative evidence", negative, "(none — no rejected roots or uncertainty signals)"),
  ].join("\n");

  return { ok: true, message };
}

/**
 * Read-only: explain a stable mined claim by key. Returns structured positive and
 * negative evidence without relying on numbered standard order.
 */
export function explainClaim(options: ExplainClaimOptions): ExplainResult {
  const inspection = inspectRepo(options);
  if (!inspection.initialized) {
    return { ok: false, message: "Not set up yet — run `aisdlc customize` first." };
  }

  const { profile, overlay } = inspection;
  switch (options.key) {
    case "test-command":
      return explainTestCommand(profile, overlay);
    case "architecture":
      return explainArchitecture(profile);
    default: {
      const _exhaustive: never = options.key;
      return _exhaustive;
    }
  }
}

/**
 * Read-only: print standard `n` (1-based, matching `aisdlc status`) with its
 * cited sources. Out-of-range or not-yet-set-up returns `ok: false` with a clear
 * message and no throw, so the CLI can exit non-zero without a stack trace.
 */
export function explainStandard(options: ExplainOptions): ExplainResult {
  const inspection = inspectRepo(options);
  if (!inspection.initialized) {
    return { ok: false, message: "Not set up yet — run `aisdlc customize` first." };
  }

  const standards = inspection.standardsIndex.standards;
  const { n } = options;
  if (!Number.isInteger(n) || n < 1 || n > standards.length) {
    return {
      ok: false,
      message:
        standards.length === 0
          ? "No standards mined yet."
          : `No standard #${n}. Valid range is 1..${standards.length}; run \`aisdlc status\` to list them.`,
    };
  }

  const standard = standards[n - 1]!;
  const sources =
    standard.sources.length > 0
      ? standard.sources.map((s) => `  - ${s}`).join("\n")
      : "  (no sources cited — an evidence-coverage gap)";
  return { ok: true, message: `Standard #${n}: ${standard.statement}\nSources:\n${sources}` };
}
