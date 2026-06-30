import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnalyzeDocGardenOptions } from "../garden/doc-gardener.js";
import {
  applyDocGardenFixes,
  hasSeverityAtLeast,
  judgmentFindings,
  renderDocGardenMarkdown,
  renderDocGardenText,
  serializeDocGardenReport,
} from "../garden/doc-gardener.js";
import type { DocGardenReport, DocGardenSeverity } from "../garden/types.js";
import { DOC_GARDEN_REPORT_BASENAME } from "../garden/types.js";

export interface GardenCliOptions extends AnalyzeDocGardenOptions {
  failOn?: DocGardenSeverity;
}

export interface GardenCliResult {
  report: DocGardenReport;
  fixResult: ReturnType<typeof applyDocGardenFixes>;
  output: string;
  exitCode: number;
  writtenPaths: string[];
}

export function runGardenCli(options: GardenCliOptions): GardenCliResult {
  const fixResult = applyDocGardenFixes(options);
  const report = fixResult.report;
  const reportDir = join(options.configDir ?? options.repoRoot, ".sdlc");
  mkdirSync(reportDir, { recursive: true });
  const jsonPath = join(reportDir, DOC_GARDEN_REPORT_BASENAME);
  const markdownPath = join(reportDir, "doc-gardening-report.md");
  writeFileSync(jsonPath, serializeDocGardenReport(report), "utf8");
  writeFileSync(markdownPath, renderDocGardenMarkdown(report), "utf8");

  const lines = [
    "Doc garden workflow: applied deterministic fixes and wrote the report.",
    ...renderDocGardenText(report, fixResult).split("\n"),
  ];
  const remaining = judgmentFindings(report);
  if (remaining.length > 0) {
    lines.push(
      `${remaining.length} finding(s) need host-agent judgment — invoke the \`garden-docs\` skill and re-run \`aisdlc garden\`.`,
    );
  } else if (report.summary.total === 0) {
    lines.push("Doc garden clean — no further action.");
  }
  lines.push(`Report: ${jsonPath}`);

  return {
    report,
    fixResult,
    output: lines.join("\n"),
    exitCode: options.failOn && hasSeverityAtLeast(report, options.failOn) ? 1 : 0,
    writtenPaths: [jsonPath, markdownPath],
  };
}
