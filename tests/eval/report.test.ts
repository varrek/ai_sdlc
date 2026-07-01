import { describe, expect, it } from "vitest";
import { classifySetupFailure } from "../../src/eval/report.js";
import type { SetupChainResult } from "../../src/eval/setup-chain.js";

function setup(
  partial: Partial<SetupChainResult["status"]> & { smokePassed?: boolean },
): SetupChainResult {
  const smokePassed = partial.smokePassed ?? true;
  return {
    status: {
      setupReady: false,
      blockingGaps: partial.blockingGaps ?? 0,
      packages: partial.packages ?? 0,
      gapClosureProvenance: {},
      roleStates: {
        architect: "generic",
        engineer: "generic",
        tester: "generic",
        reviewer: "generic",
        debugger: "generic",
      },
      coverage: { covered: 0, total: 0 },
      architectureConfidence: "high",
    },
    smoke: { result: { passed: smokePassed } },
    artifacts: {},
  } as SetupChainResult;
}

describe("classifySetupFailure", () => {
  it("returns undefined when setup is ready", () => {
    const ready = setup({ blockingGaps: 0 });
    ready.status.setupReady = true;
    expect(classifySetupFailure(ready)).toBeUndefined();
  });

  it("classifies smoke gate failures as emitter-bug", () => {
    expect(classifySetupFailure(setup({ smokePassed: false }))).toMatchObject({
      failureClass: "emitter-bug",
      failureMessage: "smoke gate did not pass",
    });
  });

  it("classifies monorepo blocking gaps", () => {
    expect(classifySetupFailure(setup({ packages: 2, blockingGaps: 1 }))).toMatchObject({
      failureClass: "monorepo-miner-limitation",
    });
  });

  it("classifies single-package blocking gaps as repo-edge-case", () => {
    expect(classifySetupFailure(setup({ packages: 1, blockingGaps: 2 }))).toMatchObject({
      failureClass: "repo-edge-case",
    });
  });

  it("falls back to needs-triage when setup is not ready without gaps", () => {
    expect(classifySetupFailure(setup({ blockingGaps: 0 }))).toMatchObject({
      failureClass: "needs-triage",
    });
  });
});
