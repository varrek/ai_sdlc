import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { buildRegistry } from "../adapters/registry.js";
import { renderCapabilityMatrix } from "../core/capability-matrix.js";
import { loadProjectContext, PROJECT_CONTEXT_FILE, projectContextPathFor } from "../core/loader.js";
import { DEFAULT_EXCLUSIONS } from "../core/project-context.js";
import { redactUntrustedText } from "../eval/redact.js";
import type { DocGardenFinding, DocGardenReport, DocGardenSeverity } from "./types.js";

export interface AnalyzeDocGardenOptions {
  repoRoot: string;
  configDir?: string;
  overlayPath?: string;
  overlayDir?: string;
}

const ROOT_DOCS = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
const ROOT_LINE_LIMIT = 120;
const ROOT_CHAR_LIMIT = 12_000;
const DOC_WALK_LIMIT = 1000;
const DOC_DIR_WALK_LIMIT = 2000;

interface MarkdownLink {
  target: string;
  raw: string;
}

interface MarkdownInventory {
  files: string[];
  findings: DocGardenFinding[];
}

interface MarkdownWalkResult {
  files: string[];
  truncated: boolean;
}

export function analyzeDocGarden(options: AnalyzeDocGardenOptions): DocGardenReport {
  const repoRoot = resolve(options.repoRoot);
  const findings: DocGardenFinding[] = [];

  findings.push(...findRootBloat(repoRoot));
  findings.push(...findBrokenLinks(repoRoot));
  findings.push(...findMissingCodebaseMap(repoRoot, options));
  findings.push(...findStaleCapabilityMatrix(repoRoot));

  const sorted = findings.map(redactFinding).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.id.localeCompare(b.id);
  });
  return {
    findings: sorted,
    summary: {
      total: sorted.length,
      warnings: sorted.filter((f) => f.severity === "warning").length,
      errors: sorted.filter((f) => f.severity === "error").length,
    },
  };
}

export function renderDocGardenText(report: DocGardenReport): string {
  const lines = [
    `Doc gardening: ${report.summary.total} finding(s), ${report.summary.warnings} warning(s), ${report.summary.errors} error(s).`,
  ];
  for (const finding of report.findings) {
    lines.push(
      `${finding.severity.toUpperCase()} ${finding.id} ${finding.path}: ${finding.message}`,
    );
    lines.push(`  Next: ${finding.suggestion}`);
  }
  return lines.join("\n");
}

export function renderDocGardenMarkdown(report: DocGardenReport): string {
  const lines = [
    "# Doc-gardening report",
    "",
    `Findings: ${report.summary.total} total, ${report.summary.warnings} warning(s), ${report.summary.errors} error(s).`,
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("No doc-gardening findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `- **${finding.severity.toUpperCase()} ${finding.id}** \`${finding.path}\`: ${finding.message}`,
        `  - Suggested action: ${finding.suggestion}`,
      );
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function serializeDocGardenReport(report: DocGardenReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function hasSeverityAtLeast(report: DocGardenReport, severity: DocGardenSeverity): boolean {
  if (severity === "warning") return report.summary.total > 0;
  return report.summary.errors > 0;
}

function findRootBloat(repoRoot: string): DocGardenFinding[] {
  const findings: DocGardenFinding[] = [];
  for (const path of ROOT_DOCS) {
    const absolute = join(repoRoot, path);
    if (!existsSync(absolute)) continue;
    const contents = readFileSync(absolute, "utf8");
    const lines = contents.split(/\r?\n/).length;
    if (lines > ROOT_LINE_LIMIT || contents.length > ROOT_CHAR_LIMIT) {
      findings.push({
        id: "root-doc-bloat",
        severity: "warning",
        path,
        message: `root agent doc is ${lines} line(s) and ${contents.length} character(s)`,
        suggestion:
          "Move package- or task-specific guidance into layered docs or skills and keep the root file as a map.",
      });
    }
  }
  return findings;
}

function findBrokenLinks(repoRoot: string): DocGardenFinding[] {
  const findings: DocGardenFinding[] = [];
  const inventory = markdownFiles(repoRoot);
  findings.push(...inventory.findings);
  for (const path of inventory.files) {
    const absolute = join(repoRoot, path);
    const contents = readFileSync(absolute, "utf8");
    const seenTargets = new Set<string>();
    for (const link of markdownLinks(contents)) {
      if (link.target.length === 0) {
        const missingKey = `missing:${link.raw}`;
        if (seenTargets.has(missingKey)) continue;
        seenTargets.add(missingKey);
        findings.push({
          id: "broken-local-link",
          severity: "error",
          path,
          message: `reference-style link has no definition: ${link.raw}`,
          suggestion:
            "Add the missing reference definition or convert the link to an inline local target.",
        });
        continue;
      }
      const target = link.target;
      if (!isLocalFileLink(target)) continue;
      if (seenTargets.has(target)) continue;
      seenTargets.add(target);
      const targetPath = target.split("#")[0]!;
      const decoded = decodeLinkPath(targetPath);
      if (!decoded.ok) {
        findings.push({
          id: "broken-local-link",
          severity: "error",
          path,
          message: `local link target has invalid percent-encoding: ${target}`,
          suggestion:
            "Fix the markdown link encoding so doc gardening can resolve the target path.",
        });
        continue;
      }
      const resolved = resolve(dirname(absolute), decoded.value);
      if (!isWithin(repoRoot, resolved) || !existsSync(resolved)) {
        findings.push({
          id: "broken-local-link",
          severity: "error",
          path,
          message: `local link target does not exist: ${target}`,
          suggestion:
            "Update the link or restore the referenced doc so agents can follow the table of contents.",
        });
      }
    }
  }
  return findings;
}

function findMissingCodebaseMap(
  repoRoot: string,
  options: AnalyzeDocGardenOptions,
): DocGardenFinding[] {
  const context = loadProjectContext(resolveProjectContextPath(options));
  if (!context || context.map.length === 0) return [];
  let firstRootDoc: string | undefined;
  for (const path of ROOT_DOCS) {
    const absolute = join(repoRoot, path);
    if (!existsSync(absolute)) continue;
    firstRootDoc ??= path;
    if (/codebase map/i.test(readFileSync(absolute, "utf8"))) return [];
  }
  return [
    {
      id: "missing-codebase-map",
      severity: "warning",
      path: firstRootDoc ?? "AGENTS.md",
      message:
        "project context has map entries, but the root instructions do not mention a codebase map",
      suggestion: "Re-run compile or add a root pointer to the generated codebase map.",
    },
  ];
}

function findStaleCapabilityMatrix(repoRoot: string): DocGardenFinding[] {
  const matrixPath = join(repoRoot, "docs", "capability-matrix.md");
  if (!existsSync(matrixPath)) return [];
  const expected = getExpectedCapabilityMatrix();
  const current = readFileSync(matrixPath, "utf8");
  if (current === expected) return [];
  return [
    {
      id: "stale-capability-matrix",
      severity: "warning",
      path: "docs/capability-matrix.md",
      message: "capability matrix differs from adapter declarations",
      suggestion: "Run `aisdlc gen-matrix` and review the generated diff.",
    },
  ];
}

function markdownFiles(repoRoot: string): MarkdownInventory {
  const files = new Set<string>();
  const findings: DocGardenFinding[] = [];
  for (const path of ROOT_DOCS) {
    if (existsSync(join(repoRoot, path))) files.add(path);
  }
  const docsRoot = join(repoRoot, "docs");
  if (existsSync(docsRoot)) {
    const walked = walkMarkdown(repoRoot, docsRoot, DOC_WALK_LIMIT);
    for (const file of walked.files) files.add(file);
    if (walked.truncated) {
      findings.push({
        id: "doc-scan-truncated",
        severity: "warning",
        path: "docs",
        message: `doc scan stopped after ${DOC_WALK_LIMIT} markdown file(s) or ${DOC_DIR_WALK_LIMIT} directories`,
        suggestion:
          "Narrow docs, remove generated/vendor trees, or raise the scan limit before relying on complete link coverage.",
      });
    }
  }
  return { files: [...files].sort(), findings };
}

function walkMarkdown(repoRoot: string, root: string, limit: number): MarkdownWalkResult {
  const files: string[] = [];
  const stack = [root];
  let visitedDirs = 0;
  while (stack.length > 0 && files.length < limit && visitedDirs < DOC_DIR_WALK_LIMIT) {
    const current = stack.pop()!;
    visitedDirs++;
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (files.length >= limit) break;
      if (entry.name.startsWith(".")) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUSIONS.includes(entry.name)) continue;
        stack.push(path);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(toPosix(relative(repoRoot, path)));
      }
    }
  }
  return {
    files,
    truncated: stack.length > 0 || files.length >= limit || visitedDirs >= DOC_DIR_WALK_LIMIT,
  };
}

function markdownLinks(contents: string): MarkdownLink[] {
  const linkable = maskMarkdownCode(contents);
  const links: MarkdownLink[] = [];
  const definitions = new Map<string, string>();
  const definitionRegex = /^\s*\[([^\]]+)\]:\s+(\S+)/gm;
  for (const match of linkable.matchAll(definitionRegex)) {
    definitions.set(match[1]!.trim().toLowerCase(), match[2]!);
    links.push({ target: match[2]!, raw: match[0]! });
  }
  const regex = /\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of linkable.matchAll(regex)) links.push({ target: match[1]!, raw: match[0]! });
  const referenceRegex = /\[[^\]]+\]\[([^\]]+)\]/g;
  for (const match of linkable.matchAll(referenceRegex)) {
    const key = match[1]!.trim().toLowerCase();
    links.push({ target: definitions.get(key) ?? "", raw: match[0]! });
  }
  return links;
}

function maskMarkdownCode(contents: string): string {
  if (!contents.includes("`") && !contents.includes("~~~") && !/^(?: {4}|\t).+$/m.test(contents)) {
    return contents;
  }
  return contents
    .replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2[^\n]*(?=\n|$)|$)/g, (match) =>
      blankMarkdown(match),
    )
    .replace(/^(?: {4}|\t).+$/gm, (match) => blankMarkdown(match))
    .replace(/(`+)[^\n]*?\1/g, (match) => blankMarkdown(match));
}

function blankMarkdown(value: string): string {
  return value.replace(/[^\n]/g, " ");
}

function isLocalFileLink(target: string): boolean {
  return !/^(https?:|mailto:|#|cursor:)/.test(target) && target.trim().length > 0;
}

function decodeLinkPath(targetPath: string): { ok: true; value: string } | { ok: false } {
  try {
    return { ok: true, value: decodeURIComponent(targetPath) };
  } catch {
    return { ok: false };
  }
}

function isWithin(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

function getExpectedCapabilityMatrix(): string {
  return renderCapabilityMatrix(buildRegistry().all());
}

function resolveProjectContextPath(options: AnalyzeDocGardenOptions): string | undefined {
  if (options.overlayPath) return projectContextPathFor(resolve(options.overlayPath));
  if (options.overlayDir) return join(resolve(options.overlayDir), PROJECT_CONTEXT_FILE);
  const configDir = resolve(options.configDir ?? options.repoRoot);
  return projectContextPathFor(join(configDir, ".sdlc", "overlay", ".customize.yaml"));
}

function redactFinding(finding: DocGardenFinding): DocGardenFinding {
  return {
    ...finding,
    message: redactUntrustedText(finding.message),
    suggestion: redactUntrustedText(finding.suggestion),
  };
}
