import { evidenceCoverage, type EvidenceCoverage } from "../customize/emitters.js";
import { inspectRepo } from "./customize.js";

export interface StatusReport {
  /** True once `aisdlc customize` has produced an overlay. */
  initialized: boolean;
  /** True when a re-run would be a no-op (mined + overlay phases fresh). */
  upToDate: boolean;
  /** Open blocking interview gaps (deferred integrations excluded by construction). */
  blockingGaps: number;
  coverage: EvidenceCoverage;
  /** Standard statements, in the order `aisdlc explain <n>` numbers them (1-based). */
  standards: string[];
}

export interface StatusOptions {
  repoRoot: string;
  overlayDir?: string;
  sdlcDir?: string;
}

/** Read-only: derive the four strategy metrics for the current repo. Never writes. */
export function buildStatus(options: StatusOptions): StatusReport {
  const inspection = inspectRepo(options);
  return {
    initialized: inspection.initialized,
    upToDate: inspection.upToDate,
    blockingGaps: inspection.gaps.length,
    coverage: evidenceCoverage(inspection.standardsIndex),
    standards: inspection.standardsIndex.standards.map((s) => s.statement),
  };
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
  lines.push(
    report.upToDate
      ? "Freshness: up to date (a re-run would be a no-op)"
      : "Freshness: stale — re-run `aisdlc customize` to re-align",
  );
  lines.push(`Blocking gaps: ${report.blockingGaps}`);
  lines.push(
    `Evidence coverage: ${coverage.covered}/${coverage.total} standards cite a source (${pct(coverage.covered, coverage.total)})`,
  );
  if (coverage.uncited.length > 0) {
    lines.push("Uncited standards:");
    for (const s of coverage.uncited) lines.push(`  - ${s}`);
  }

  lines.push("", "Standards:");
  report.standards.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));

  return lines.join("\n");
}
