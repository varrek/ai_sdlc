import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify } from "yaml";
import { runCustomize } from "../../src/cli/customize.js";
import { buildStatus, formatStatus } from "../../src/cli/status.js";
import { upsertAcceptedLearning } from "../../src/core/accepted-learnings.js";
import type { StandardsIndex } from "../../src/customize/emitters.js";
import {
  type LoopBehaviorEvalResult,
  writeLoopBehaviorEvalState,
} from "../../src/eval/loop-behavior-eval-state.js";
import type { LoopScore } from "../../src/eval/loop-score.js";

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
    expect(report.loopQuality.expectedStages).toBe(5);
    expect(report.loopQuality.handoffCoverage).toBe("not-run");
    expect(formatStatus(report)).toContain("Loop quality:");
    expect(formatStatus(report)).toContain("groundable");
    expect(formatStatus(report)).toContain("behavior eval=not-run");
  });

  it("reports deterministic tester grounding when test commands are mined", () => {
    const work = tmpWork("python-rags");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.roleStates.engineer).toBe("deterministic");
    expect(report.roleStates.tester).toBe("deterministic");
    expect(formatStatus(report)).toContain("engineer=deterministic");
    expect(formatStatus(report)).toContain("tester=deterministic");
    expect(report.loopQuality.groundedRoles).toBeGreaterThanOrEqual(2);
  });

  it("reports deterministic reviewer and debugger grounding on go-app", () => {
    const work = tmpWork("go-app");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.roleStates.architect).toBe("deterministic");
    expect(report.roleStates.reviewer).toBe("deterministic");
    expect(report.roleStates.debugger).toBe("deterministic");
    expect(report.loopQuality.groundableRoles).toBe(5);
    expect(formatStatus(report)).toContain("reviewer=deterministic");
    expect(formatStatus(report)).toContain("debugger=deterministic");
  });

  it("reports standards-based architect grounding when architecture confidence is low", () => {
    const work = tmpWork("ci-repo");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.architectureConfidence).toBe("low");
    expect(report.roleStates.architect).toBe("deterministic");
    expect(report.roleStates.reviewer).toBe("deterministic");
    expect(report.roleStates.debugger).toBe("deterministic");
  });

  it("reports accepted instruction hierarchy scopes", () => {
    const work = tmpWork("monorepo");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.hierarchy.acceptedScopes).toBe(2);
    expect(report.hierarchy.packageScopes).toBe(2);
    expect(formatStatus(report)).toContain("Instruction hierarchy: 2 accepted scope");
  });

  it("reports accepted hierarchy scopes from the persisted review artifact", () => {
    const work = tmpWork("monorepo");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });
    const hierarchyPath = join(overlayDir, "instruction-hierarchy.json");
    const hierarchy = JSON.parse(readFileSync(hierarchyPath, "utf8")) as {
      scopes: { accepted: boolean }[];
    };
    hierarchy.scopes.forEach((scope) => {
      scope.accepted = false;
    });
    writeFileSync(hierarchyPath, `${JSON.stringify(hierarchy, null, 2)}\n`, "utf8");

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.hierarchy.acceptedScopes).toBe(0);
    expect(formatStatus(report)).not.toContain("Instruction hierarchy:");
  });

  it("reports generic tester grounding when test-command gap is open", () => {
    const work = tmpWork("streamlit-venv");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.roleStates.engineer).toBe("generic");
    expect(report.roleStates.tester).toBe("generic");
    expect(formatStatus(report)).toContain("engineer=generic");
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

  it("reports behavior eval results when artifact is present", () => {
    const work = tmpWork("python-rags");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });
    const mockScore: LoopScore = {
      passed: true,
      metrics: {
        expectedStages: 4,
        observedStages: 4,
        missingStages: [],
        replanCount: 0,
        approvalGateCount: 2,
        terminalStatus: "done",
      },
      violations: [],
    };
    const results: LoopBehaviorEvalResult[] = [
      {
        scenarioId: "test-scenario-1",
        passed: true,
        score: mockScore,
        evaluatedAt: "2026-06-29T12:00:00Z",
      },
      {
        scenarioId: "test-scenario-2",
        passed: true,
        score: mockScore,
        evaluatedAt: "2026-06-29T12:00:00Z",
      },
    ];
    writeLoopBehaviorEvalState(join(work, ".sdlc"), results);

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.loopQuality.behaviorEval.state).toBe("passed");
    expect(report.loopQuality.behaviorEval.passed).toBe(2);
    expect(report.loopQuality.behaviorEval.total).toBe(2);
    expect(formatStatus(report)).toContain("behavior eval=passed (2/2)");
  });

  it("reports stale freshness when standards evidence metadata drifts", () => {
    const work = tmpWork("python-rags");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });
    const standardsPath = join(overlayDir, "standards-index.yaml");
    const edited = parseYaml(readFileSync(standardsPath, "utf8")) as StandardsIndex;
    edited.standards[0]!.sources = ["stale-source.txt"];
    writeFileSync(standardsPath, stringify(edited), "utf8");

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.upToDate).toBe(false);
    expect(report.stalePhases).toContain("overlay-written");
    expect(formatStatus(report)).toContain("Freshness: stale");
  });

  it("reports partial behavior eval when some scenarios fail", () => {
    const work = tmpWork("python-rags");
    const overlayDir = join(work, ".sdlc", "overlay");
    runCustomize({ repoRoot: work, overlayDir });
    const passingScore: LoopScore = {
      passed: true,
      metrics: {
        expectedStages: 4,
        observedStages: 4,
        missingStages: [],
        replanCount: 0,
        approvalGateCount: 2,
        terminalStatus: "done",
      },
      violations: [],
    };
    const failingScore: LoopScore = {
      passed: false,
      metrics: {
        expectedStages: 4,
        observedStages: 3,
        missingStages: ["test"],
        replanCount: 0,
        approvalGateCount: 1,
        terminalStatus: "done",
      },
      violations: [{ kind: "missing-stage", stage: "test", message: "Missing loop stage: test" }],
    };
    const results: LoopBehaviorEvalResult[] = [
      {
        scenarioId: "passing-scenario",
        passed: true,
        score: passingScore,
        evaluatedAt: "2026-06-29T12:00:00Z",
      },
      {
        scenarioId: "failing-scenario",
        passed: false,
        score: failingScore,
        evaluatedAt: "2026-06-29T12:00:00Z",
      },
    ];
    writeLoopBehaviorEvalState(join(work, ".sdlc"), results);

    const report = buildStatus({ repoRoot: work, overlayDir });

    expect(report.loopQuality.behaviorEval.state).toBe("partial");
    expect(report.loopQuality.behaviorEval.passed).toBe(1);
    expect(report.loopQuality.behaviorEval.total).toBe(2);
    expect(formatStatus(report)).toContain("behavior eval=partial (1/2)");
  });
});
