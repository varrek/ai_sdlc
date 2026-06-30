import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeDocGarden,
  applyDocGardenFixes,
  hasSeverityAtLeast,
  renderDocGardenMarkdown,
  renderDocGardenText,
  serializeDocGardenReport,
} from "../garden/doc-gardener.js";
import type { DocGardenReport, DocGardenSeverity } from "../garden/types.js";

export interface GardenDocsOptions {
  repoRoot: string;
  configDir?: string;
  overlayPath?: string;
  overlayDir?: string;
  format?: "text" | "json";
  writeReport?: boolean;
  failOn?: DocGardenSeverity;
  fix?: boolean;
}

export interface GardenDocsResult {
  report: DocGardenReport;
  output: string;
  exitCode: number;
  writtenPaths: string[];
  fixedPaths: string[];
}

export function runGardenDocs(options: GardenDocsOptions): GardenDocsResult {
  const analyzeOptions = {
    repoRoot: options.repoRoot,
    configDir: options.configDir,
    overlayPath: options.overlayPath,
    overlayDir: options.overlayDir,
  };
  const fixResult = options.fix ? applyDocGardenFixes(analyzeOptions) : undefined;
  const report = fixResult?.report ?? analyzeDocGarden(analyzeOptions);
  const serializedJson = serializeDocGardenReport(report);
  const writtenPaths: string[] = [];
  if (options.writeReport) {
    const reportDir = join(options.configDir ?? options.repoRoot, ".sdlc");
    mkdirSync(reportDir, { recursive: true });
    const jsonPath = join(reportDir, "doc-gardening-report.json");
    const markdownPath = join(reportDir, "doc-gardening-report.md");
    writeFileSync(jsonPath, serializedJson, "utf8");
    writeFileSync(markdownPath, renderDocGardenMarkdown(report), "utf8");
    writtenPaths.push(jsonPath, markdownPath);
  }
  const output =
    options.format === "json" ? serializedJson.trimEnd() : renderDocGardenText(report, fixResult);
  return {
    report,
    output,
    exitCode: options.failOn && hasSeverityAtLeast(report, options.failOn) ? 1 : 0,
    writtenPaths,
    fixedPaths: fixResult?.fixedPaths ?? [],
  };
}

export function parseGardenDocsFormat(value: string | undefined): "text" | "json" {
  if (!value || value === "text") return "text";
  if (value === "json") return "json";
  throw new Error("--format must be text or json");
}

export function parseGardenDocsFailOn(value: string | undefined): DocGardenSeverity | undefined {
  if (!value) return undefined;
  if (value === "warning" || value === "error") return value;
  throw new Error("--fail-on must be warning or error");
}
