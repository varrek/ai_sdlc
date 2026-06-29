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
    writeFileSync(
      join(root, "AGENTS.md"),
      `${Array.from({ length: 130 }, () => "line").join("\n")}\n`,
      "utf8",
    );
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "guide.md"), "[Missing](missing.md)\n", "utf8");
    writeFileSync(join(root, "docs", "capability-matrix.md"), "# stale\n", "utf8");
    mkdirSync(join(root, ".sdlc", "overlay"), { recursive: true });
    writeFileSync(
      join(root, ".sdlc", "overlay", "project-context.json"),
      JSON.stringify({
        packages: [],
        map: [{ path: "src", role: "Source", sources: ["src"] }],
        exclusions: [],
      }),
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
      JSON.stringify({
        packages: [],
        map: [{ path: "src", role: "Source", sources: ["src"] }],
        exclusions: [],
      }),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root, configDir: config });
    expect(report.findings.some((finding) => finding.id === "missing-codebase-map")).toBe(false);
  });

  it("loads project context from a custom overlay directory", () => {
    const root = tmpRepo();
    const overlayDir = tmpRepo();
    writeFileSync(join(root, "CLAUDE.md"), "# Claude\n", "utf8");
    writeFileSync(
      join(overlayDir, "project-context.json"),
      JSON.stringify({
        packages: [],
        map: [{ path: "src", role: "Source", sources: ["src"] }],
        exclusions: [],
      }),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root, overlayDir });
    const finding = report.findings.find((item) => item.id === "missing-codebase-map");
    expect(finding?.path).toBe("CLAUDE.md");
  });

  it("redacts secrets in broken link findings", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), "[Secret](missing.md?token=abc123)\n", "utf8");

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings[0]?.message).toContain("token=<redacted>");
  });

  it("accepts codebase-map pointers in any root instruction doc", () => {
    const root = tmpRepo();
    writeFileSync(
      join(root, "CLAUDE.md"),
      "# Claude\n\nSee the codebase map in AGENTS.md.\n",
      "utf8",
    );
    mkdirSync(join(root, ".sdlc", "overlay"), { recursive: true });
    writeFileSync(
      join(root, ".sdlc", "overlay", "project-context.json"),
      JSON.stringify({
        packages: [],
        map: [{ path: "src", role: "Source", sources: ["src"] }],
        exclusions: [],
      }),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings.some((finding) => finding.id === "missing-codebase-map")).toBe(false);
  });

  it("checks reference-style markdown links", () => {
    const root = tmpRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "guide.md"),
      "[Missing][target]\n\n[target]: missing.md\n",
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings.map((finding) => finding.id)).toEqual(["broken-local-link"]);
    expect(report.findings[0]?.message).toContain("missing.md");
  });

  it("ignores markdown-looking links inside code spans and fenced code blocks", () => {
    const root = tmpRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "guide.md"),
      [
        "Pack names match `^[a-z][a-z0-9-]*$`.",
        "",
        "```md",
        "[Missing][target]",
        "[target]: missing.md",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });

    expect(report.findings.some((finding) => finding.id === "broken-local-link")).toBe(false);
  });

  it("ignores markdown-looking links inside indented code blocks", () => {
    const root = tmpRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "guide.md"),
      ["    [Missing][target]", "    [target]: missing.md", ""].join("\n"),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });

    expect(report.findings.some((finding) => finding.id === "broken-local-link")).toBe(false);
  });

  it("does not report the current packs regex as a broken link", () => {
    const report = analyzeDocGarden({ repoRoot: process.cwd() });
    const packsFinding = report.findings.find(
      (finding) => finding.id === "broken-local-link" && finding.path === "docs/packs.md",
    );

    expect(packsFinding).toBeUndefined();
  });

  it("still reports missing reference links outside code", () => {
    const root = tmpRepo();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "docs", "guide.md"),
      "`[Fine][target]`\n\n[Missing][target]\n",
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });

    expect(report.findings.map((finding) => finding.id)).toEqual(["broken-local-link"]);
    expect(report.findings[0]?.message).toContain("[Missing][target]");
  });

  it("reports invalid percent-encoded link targets without throwing", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), "[Bad](bad%ZZ.md)\n", "utf8");

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings.map((finding) => finding.id)).toEqual(["broken-local-link"]);
    expect(report.findings[0]?.message).toContain("invalid percent-encoding");
  });

  it("reports missing codebase-map warnings against the root doc that exists", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "CLAUDE.md"), "# Claude\n", "utf8");
    mkdirSync(join(root, ".sdlc", "overlay"), { recursive: true });
    writeFileSync(
      join(root, ".sdlc", "overlay", "project-context.json"),
      JSON.stringify({
        packages: [],
        map: [{ path: "src", role: "Source", sources: ["src"] }],
        exclusions: [],
      }),
      "utf8",
    );

    const report = analyzeDocGarden({ repoRoot: root });
    const finding = report.findings.find((item) => item.id === "missing-codebase-map");
    expect(finding?.path).toBe("CLAUDE.md");
  });

  it("warns when docs traversal hits the scan limit", () => {
    const root = tmpRepo();
    const docs = join(root, "docs");
    mkdirSync(docs, { recursive: true });
    for (let i = 0; i < 1001; i++) {
      writeFileSync(join(docs, `section-${i}.md`), "# Section\n", "utf8");
    }

    const report = analyzeDocGarden({ repoRoot: root });
    expect(report.findings.some((finding) => finding.id === "doc-scan-truncated")).toBe(true);
  });
});

function tmpRepo(): string {
  mkdirSync(".verify", { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), ".verify", "doc-garden-"));
  tmpDirs.push(dir);
  return dir;
}
