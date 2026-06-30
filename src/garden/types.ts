export const DOC_GARDEN_FINDING_IDS = [
  "broken-local-link",
  "doc-scan-truncated",
  "hierarchy-codex-budget",
  "hierarchy-scope-missing",
  "missing-codebase-map",
  "root-doc-bloat",
  "stale-capability-matrix",
] as const;

export type DocGardenFindingId = (typeof DOC_GARDEN_FINDING_IDS)[number];

/** Finding kinds `garden-docs --fix` / `aisdlc garden` repair deterministically. */
export const FIXABLE_DOC_GARDEN_FINDING_IDS = [
  "missing-codebase-map",
  "stale-capability-matrix",
] as const satisfies readonly DocGardenFindingId[];

/** Finding kinds that need host-agent judgment via the `garden-docs` skill. */
export const JUDGMENT_DOC_GARDEN_FINDING_IDS = [
  "broken-local-link",
  "doc-scan-truncated",
  "hierarchy-codex-budget",
  "hierarchy-scope-missing",
  "root-doc-bloat",
] as const satisfies readonly DocGardenFindingId[];

export const DOC_GARDEN_REPORT_BASENAME = "doc-gardening-report.json";

export type DocGardenSeverity = "warning" | "error";

export interface DocGardenFinding {
  id: DocGardenFindingId;
  severity: DocGardenSeverity;
  path: string;
  message: string;
  suggestion: string;
}

export interface DocGardenReport {
  findings: DocGardenFinding[];
  summary: {
    total: number;
    warnings: number;
    errors: number;
  };
}

export interface DocGardenFixResult {
  report: DocGardenReport;
  applied: Array<{ id: DocGardenFindingId; path: string }>;
  fixedPaths: string[];
}
