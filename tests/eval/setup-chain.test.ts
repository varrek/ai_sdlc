import { afterEach, describe, expect, it } from "vitest";
import { runSetupChain } from "../../src/eval/setup-chain.js";
import { baseDir, cleanupCorpusTempDirs, copyFixture } from "../corpus/corpus-harness.js";

afterEach(() => cleanupCorpusTempDirs());

describe("setup chain", () => {
  it("runs the existing setup chain and records timings", () => {
    const root = copyFixture("ts-app");

    const result = runSetupChain(root, { baseDir });

    expect(result.status.setupReady).toBe(true);
    expect(result.status.operatingMode).toBe("plugin");
    expect(result.overlay.gapClosureProvenance["test-command"]).toBe("miner");
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.timings.customizeMs).toBeGreaterThanOrEqual(0);
  });

  it("honors deterministic mode for bench callers", () => {
    const root = copyFixture("ts-app");

    const result = runSetupChain(root, { baseDir, operatingMode: "deterministic" });

    expect(result.status.operatingMode).toBe("deterministic");
    expect(result.freshness.compileFresh).toBe(false);
    expect(result.freshness.upToDate).toBe(true);
  });
});
