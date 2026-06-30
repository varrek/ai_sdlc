import { describe, expect, it } from "vitest";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_CATALOG,
  DEFAULT_REPORT_DIR,
  runBench,
} from "../../src/cli/bench.js";

describe("external corpus bench", () => {
  it.skipIf(process.env.AISDLC_EXTERNAL_CORPUS !== "1")(
    "runs the pinned external corpus when explicitly enabled",
    () => {
      const result = runBench({
        seed: 42,
        count: 10,
        catalogPath: DEFAULT_CATALOG,
        cacheDir: DEFAULT_CACHE_DIR,
        reportDir: DEFAULT_REPORT_DIR,
        baseDir: "sdlc-base",
        mode: "deterministic",
        failOnClasses: ["workflow-error"],
      });

      expect(result.report).toBeDefined();
      expect(result.report?.results).toHaveLength(10);
      expect(result.exitCode).toBe(0);
    },
  );
});
