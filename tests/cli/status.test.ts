import { rmSync, mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCustomize } from "../../src/cli/customize.js";
import { buildStatus, formatStatus } from "../../src/cli/status.js";
import { upsertAcceptedLearning } from "../../src/core/accepted-learnings.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function tmpWork(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `aisdlc-status-${name}-`));
  tmpDirs.push(root);
  cpSync(repo(name), root, { recursive: true });
  return root;
}

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
    expect(report.loopQuality.expectedStages).toBe(4);
    expect(report.loopQuality.handoffCoverage).toBe("not-run");
    expect(formatStatus(report)).toContain("Loop quality:");
    expect(formatStatus(report)).toContain("behavior eval=not-run");
  });

  it("reports deterministic tester grounding when test commands are mined", () => {
    const work = tmpWork("python-rags");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.roleStates.tester).toBe("deterministic");
    expect(formatStatus(report)).toContain("tester=deterministic");
    expect(report.loopQuality.groundedRoles).toBeGreaterThanOrEqual(2);
  });

  it("reports generic tester grounding when test-command gap is open", () => {
    const work = tmpWork("streamlit-venv");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.roleStates.tester).toBe("generic");
    expect(formatStatus(report)).toContain("tester=generic");
  });

  it("counts loop-derived learnings separately from setup role grounding", () => {
    const work = tmpWork("python-rags");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });
    const before = buildStatus({ repoRoot: work, overlayDir });
    upsertAcceptedLearning(join(work, ".sdlc"), {
      key: "review:retry",
      kind: "review-finding",
      claim: "Reviewer requested retry-path coverage.",
      sources: ["src/app.py"],
      provenance: "gate",
    });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.loopQuality.loopLearnings).toBe(1);
    expect(formatStatus(report)).toContain("loop learnings=1");
    expect(report.roleStates.reviewer).toBe(before.roleStates.reviewer);
  });
});
