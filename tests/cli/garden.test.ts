import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGardenCli } from "../../src/cli/garden.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("garden workflow command", () => {
  it("applies deterministic fixes, writes reports, and hands off judgment findings", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), "# Agent map\n", "utf8");
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

    const result = runGardenCli({ repoRoot: root });

    expect(result.fixResult.fixedPaths).toEqual(["docs/capability-matrix.md", "AGENTS.md"]);
    expect(result.report.findings.map((finding) => finding.id)).toEqual(["broken-local-link"]);
    expect(result.output).toContain("garden-docs` skill");
    expect(existsSync(join(root, ".sdlc", "doc-gardening-report.json"))).toBe(true);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("## Codebase map");
  });

  it("reports a clean doc garden when no findings remain", () => {
    const root = tmpRepo();
    writeFileSync(join(root, "AGENTS.md"), "# Agent map\n\nSee [docs](docs/guide.md).\n", "utf8");
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "guide.md"), "# Guide\n", "utf8");

    const result = runGardenCli({ repoRoot: root });

    expect(result.report.summary.total).toBe(0);
    expect(result.output).toContain("Doc garden clean");
  });
});

function tmpRepo(): string {
  mkdirSync(".verify", { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), ".verify", "garden-workflow-"));
  tmpDirs.push(dir);
  return dir;
}
