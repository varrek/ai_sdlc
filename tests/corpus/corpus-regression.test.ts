import { afterEach, describe, expect, it } from "vitest";
import { assertCorpusExpectation, CORPUS_EXPECTATIONS } from "./corpus-expectations.js";
import { cleanupCorpusTempDirs, copyFixture, runSetup } from "./corpus-harness.js";

afterEach(() => cleanupCorpusTempDirs());

describe("semantic corpus regression", () => {
  it.each(CORPUS_EXPECTATIONS.map((entry) => [entry.fixture, entry.description, entry] as const))(
    "%s — %s",
    (fixture, _description, expected) => {
      const root = copyFixture(fixture);
      const artifacts = runSetup(root);
      assertCorpusExpectation(artifacts, expected);
    },
  );

  it("runs the full customize → compile → smoke → status chain for every fixture", () => {
    expect(CORPUS_EXPECTATIONS).toHaveLength(10);
    for (const expected of CORPUS_EXPECTATIONS) {
      const root = copyFixture(expected.fixture);
      const artifacts = runSetup(root);
      expect(artifacts.status.initialized, `${expected.fixture} initialized`).toBe(true);
      expect(artifacts.smoke.setupReady, `${expected.fixture} smoke.setupReady`).toBe(expected.setupReady);
      expect(artifacts.status.setupReady, `${expected.fixture} status.setupReady`).toBe(expected.setupReady);
    }
  });
});
