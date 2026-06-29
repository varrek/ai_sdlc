import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeDocGarden, renderDocGardenText } from "../../src/garden/doc-gardener.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("doc gardener", () => {
  it("returns no findings for a clean minimal repo", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), "# Agent map\n\nSee [docs](docs/guide.md).\n", "utf8");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "guide.md"), "# Guide\n", "utf8");

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.summary.total).toBe(0);
    expect(renderDocGardenText(report)).toContain("0 finding");
  });

  it("reports root bloat, broken links, missing maps, and stale generated docs", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), `${Array.from({ length: 130 }, () => "line").join("\n")}\n`, "utf8");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "guide.md"), "[Missing](missing.md)\n", "utf8");
    writeFileSync(join(root, "docs", "capability-matrix.md"), "# stale\n", "utf8");
    mkdirSync(join(root, ".sdlc", "overlay"), { recursive: true });
    writeFileSync(
      join(root, ".sdlc", "overlay", "project-context.json"),
      JSON.stringify({ packages: [], map: [{ path: "src", role: "Source", sources: ["src"] }], exclusions: [] }),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings.map((finding) => finding.id)).toEqual([
      "broken-local-link",
      "missing-codebase-map",
      "root-doc-bloat",
      "stale-capability-matrix",
    ]);
    expect(report.summary.errors).toBe(1);
    expect(report.summary.warnings).toBe(3);
  });

  it("scans docs from repo root while loading project context from config root", () => {
    const root = tmpRepo();
    const config = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), "# Agent map\n\n## Codebase map\n", "utf8");
    mkdirSync(join(config, ".sdlc", "overlay"), { recursive: true });
    writeFileSync(
      join(config, ".sdlc", "overlay", "project-context.json"),
      JSON.stringify({ packages: [], map: [{ path: "src", role: "Source", sources: ["src"] }], exclusions: [] }),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root, configDir: config });
    expect(report.findings.some((finding) => finding.id === "missing-codebase-map")).toBe(false);
  });

  it("redacts secrets in broken link findings", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), "[Secret](missing.md?token=abc123)\n", "utf8");

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings[0]?.message).toContain("token=<redacted>");
  });

  it("accepts codebase-map pointers in any root instruction doc", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "CLAUDE.md"), "# Claude\n\nSee the codebase map in AGENTS.md.\n", "utf8");
    mkdirSync(join(root, ".sdlc", "overlay"), { recursive: true });
    writeFileSync(
      join(root, ".sdlc", "overlay", "project-context.json"),
      JSON.stringify({ packages: [], map: [{ path: "src", role: "Source", sources: ["src"] }], exclusions: [] }),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings.some((finding) => finding.id === "missing-codebase-map")).toBe(false);
  });

  it("checks reference-style markdown links", () => {
    const root = tmpRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "guide.md"), "[Missing][target]\n\n[target]: missing.md\n", "utf8");

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings.map((finding) => finding.id)).toEqual(["broken-local-link"]);
    expect(report.findings[0]?.message).toContain("missing.md");
  });
});

function tmpRepo(): string {
  mkdirSync(".verify", { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), ".verify", "doc-garden-"));
  tmpDirs.push(dir);
  return dir;
}
