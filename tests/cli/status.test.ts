import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCustomize } from "../../src/cli/customize.js";
import { buildStatus, formatStatus } from "../../src/cli/status.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function tmpOverlay(): string {
  const root = mkdtempSync(join(tmpdir(), "aisdlc-status-"));
  tmpDirs.push(root);
  return join(root, "overlay");
}

describe("status", () => {
  it("reports Plugin Mode as the default operating mode", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });

    const report = buildStatus({ repoRoot: repo("python-rags"), overlayDir });

    expect(report.operatingMode).toBe("plugin");
    expect(formatStatus(report)).toContain("Operating mode: plugin");
    expect(report.acceptedLearnings.count).toBeGreaterThan(0);
    expect(formatStatus(report)).toContain("Accepted learnings");
  });
});
