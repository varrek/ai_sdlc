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
