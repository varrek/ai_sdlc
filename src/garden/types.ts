export const DOC_GARDEN_FINDING_IDS = [
  "broken-local-link",
  "missing-codebase-map",
  "root-doc-bloat",
  "stale-capability-matrix",
] as const;

export type DocGardenFindingId = (typeof DOC_GARDEN_FINDING_IDS)[number];

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
