import { describe, expect, it } from "vitest";
import { repoId, type ExternalRepoEntry } from "../../src/eval/catalog.js";
import { buildEvalRunReport, hasFailingClass, renderEvalSummary, resultFromCacheFailure } from "../../src/eval/report.js";

const repo: ExternalRepoEntry = {
  owner: "owner",
  repo: "repo",
  commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  primaryLanguage: "TypeScript",
  toolTags: [],
  sizeBand: "medium",
  catalogRevision: "test",
  id: "owner/repo@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

describe("eval report", () => {
  it("summarizes failure classes and redacts messages", () => {
    expect(repo.id).toBe(repoId(repo));
    const result = resultFromCacheFailure(repo, {
      ok: false,
      failureClass: "network",
      message: "https://user:secret@example.test/repo.git?token=abc123 failed",
    });

    const report = buildEvalRunReport({
      runId: "run",
      seed: 42,
      count: 1,
      catalogRevision: "test",
      startedAt: "2026-06-29T00:00:00.000Z",
      selectedRepoIds: [repo.id],
      selectedRepos: [repo],
      diversityGaps: [],
      results: [result],
    });

    expect(report.summary.failureClasses.network).toBe(1);
    expect(report.results[0]!.failureMessage).toContain("token=<redacted>");
    expect(renderEvalSummary(report)).toContain("Setup-ready: 0/1");
    expect(hasFailingClass(report, new Set(["network"]))).toBe(true);
  });

  it("summarizes agent quality and materialization timings", () => {
    const report = buildEvalRunReport({
      runId: "run",
      seed: 42,
      count: 1,
      catalogRevision: "test",
      startedAt: "2026-06-29T00:00:00.000Z",
      selectedRepoIds: [repo.id],
      selectedRepos: [repo],
      diversityGaps: [],
      results: [
        {
          repo,
          materialization: { ms: 123, cacheReused: false },
          setup: {
            setupReady: true,
            alignmentReady: true,
            handsOff: true,
            blockingGaps: 0,
            gapClosureProvenance: { "test-command": "miner" },
            evidenceCoverage: { covered: 1, total: 1 },
            architectureConfidence: "high",
            roleStates: { architect: "deterministic", engineer: "deterministic", tester: "deterministic" },
            smokePassed: true,
            smokeFresh: false,
            customizeFresh: false,
            compileFresh: false,
            upToDate: true,
            packages: 0,
            agentQuality: {
              score: 100,
              architectGrounded: true,
              engineerGrounded: true,
              testerGrounded: true,
              hasRootTestCommand: true,
              hasCodebaseMap: true,
              evidenceBackedStandards: true,
              mapIsNoisy: false,
            },
          },
        },
      ],
    });

    expect(report.summary.agentQuality.averageScore).toBe(100);
    expect(report.summary.slowestMaterialization).toEqual({ repoId: repo.id, ms: 123 });
    expect(renderEvalSummary(report)).toContain("Agent quality: avg 100/100");
  });
});
