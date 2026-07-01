import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resetReviewMatrixCache, activeReviewLenses } from "../../src/core/review-matrix.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

describe("review matrix", () => {
  it("always includes reviewer and security lenses", () => {
    resetReviewMatrixCache();
    const lenses = activeReviewLenses([], baseDir);
    expect(lenses).toContain("reviewer");
    expect(lenses).toContain("security");
  });

  it("activates data-migration lens for migration paths", () => {
    resetReviewMatrixCache();
    const lenses = activeReviewLenses(["db/migrate/20260101_init.sql"], baseDir);
    expect(lenses).toContain("data-migration");
  });

  it("activates infra lens for workflow changes", () => {
    resetReviewMatrixCache();
    const lenses = activeReviewLenses([".github/workflows/ci.yml"], baseDir);
    expect(lenses).toContain("infra");
  });
});
