import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBase } from "../../src/core/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

describe("evaluator gate role contracts", () => {
  it("keeps Tester read-run while requiring actionable failure handbacks", () => {
    const tester = loadBase(baseDir).roles.find((role) => role.frontmatter.name === "tester")!;

    expect(tester.frontmatter.posture).toBe("read-run");
    expect(tester.body).toContain("exact command");
    expect(tester.body).toContain("actionable deltas");
    expect(tester.body).toContain("You do not write the fix or the tests yourself");
  });

  it("requires Reviewer to return ordered actionable deltas", () => {
    const reviewer = loadBase(baseDir).roles.find((role) => role.frontmatter.name === "reviewer")!;

    expect(reviewer.frontmatter.posture).toBe("read-only");
    expect(reviewer.body).toContain("**Request changes**");
    expect(reviewer.body).toContain("ordered, actionable deltas");
    expect(reviewer.body).toContain("Review is a non-negotiable gate");
  });

  it("keeps Engineer retries scoped to evaluator findings", () => {
    const engineer = loadBase(baseDir).roles.find((role) => role.frontmatter.name === "engineer")!;

    expect(engineer.frontmatter.posture).toBe("write");
    expect(engineer.body).toContain("act only on the listed deltas");
    expect(engineer.body).toContain("not broaden the diff during a retry");
  });
});
