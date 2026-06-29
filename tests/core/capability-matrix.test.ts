import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../../src/adapters/registry.js";
import { renderCapabilityMatrix } from "../../src/core/capability-matrix.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("capability matrix", () => {
  it("committed docs/capability-matrix.md matches the adapters' declared capabilities", () => {
    const rendered = renderCapabilityMatrix(buildRegistry().all());
    const onDisk = readFileSync(join(repoRoot, "docs/capability-matrix.md"), "utf8");
    expect(onDisk).toBe(rendered);
  });

  it("declares copilot's gate as a fallback (degraded)", () => {
    const matrix = renderCapabilityMatrix(buildRegistry().all());
    const gateRow = matrix.split("\n").find((l) => l.startsWith("| Hooks / Approved? gate"))!;
    expect(gateRow).toMatch(/Fallback/);
    expect(matrix).toContain("| codex |");
  });
});
