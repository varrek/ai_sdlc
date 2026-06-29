import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseGardenDocsFailOn, parseGardenDocsFormat, runGardenDocs } from "../../src/cli/garden-docs.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("garden-docs command", () => {
  it("prints text output and exits zero for warnings by default", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), `${Array.from({ length: 130 }, () => "line").join("\n")}\n`, "utf8");

    const result = runGardenDocs({ repoRoot: root });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("1 finding");
    expect(result.output).toContain("root-doc-bloat");
  });

  it("supports json output, report writes, and fail-on warning", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), `${Array.from({ length: 130 }, () => "line").join("\n")}\n`, "utf8");

    const result = runGardenDocs({ repoRoot: root, format: "json", writeReport: true, failOn: "warning" });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.output).summary.total).toBe(1);
    expect(existsSync(join(root, ".sdlc", "doc-gardening-report.json"))).toBe(true);
    expect(existsSync(join(root, ".sdlc", "doc-gardening-report.md"))).toBe(true);
  });

  it("does not fail on warnings when fail-on is error", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), `${Array.from({ length: 130 }, () => "line").join("\n")}\n`, "utf8");

    const result = runGardenDocs({ repoRoot: root, failOn: "error" });
    expect(result.report.summary.warnings).toBe(1);
    expect(result.report.summary.errors).toBe(0);
    expect(result.exitCode).toBe(0);
  });

  it("passes custom overlay directories to the analyzer", () => {
    const root = tmpRepo();
    const overlayDir = tmpRepo();
    writeFileSync(join(root, "CLAUDE.md"), "# Claude\n", "utf8");
    writeFileSync(
      join(overlayDir, "project-context.json"),
      JSON.stringify({ packages: [], map: [{ path: "src", role: "Source", sources: ["src"] }], exclusions: [] }),
      "utf8",
    );

    const result = runGardenDocs({ repoRoot: root, overlayDir });
    expect(result.report.findings.find((finding) => finding.id === "missing-codebase-map")?.path).toBe("CLAUDE.md");
  });

  it("rejects invalid option values", () => {
    expect(() => parseGardenDocsFormat("xml")).toThrow("--format");
    expect(() => parseGardenDocsFailOn("info")).toThrow("--fail-on");
  });
});

function tmpRepo(): string {
  mkdirSync(".verify", { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), ".verify", "garden-cli-"));
  tmpDirs.push(dir);
  return dir;
}
