import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runMaintainCli } from "../../src/cli/maintain.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = resolve(here, "..", "..", "sdlc-base");
const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("maintain command", () => {
  it("runs the full chain and writes a maintenance report", () => {
    const root = mkdtempSync(join(tmpdir(), "aisdlc-maintain-"));
    tmpDirs.push(root);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "node --version" }, devDependencies: { vitest: "1.0.0" } }),
      "utf8",
    );

    const result = runMaintainCli({
      repoRoot: root,
      baseDir,
      operatingMode: "deterministic",
      force: true,
    });

    expect(existsSync(join(root, ".sdlc", "maintenance-report.json"))).toBe(true);
    expect(result.output).toContain("Maintenance workflow");
    expect(result.writtenPaths.some((path) => path.endsWith("maintenance-report.json"))).toBe(true);
  });
});
