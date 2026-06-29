import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AcceptedLearningEntry } from "../../src/core/accepted-learnings.js";
import { loadBase } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

describe("mergeOverlay", () => {
  it("appends overlay standards to the constitution", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1, standards: ["Conventional commits required."] });
    const model = mergeOverlay(base, overlay);
    expect(model.constitution).toContain("Project standards (from overlay)");
    expect(model.constitution).toContain("Conventional commits required.");
  });

  it("overrides a role model with the overlay value (overlay wins)", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1, roleModels: { architect: "claude-opus" } });
    const model = mergeOverlay(base, overlay);
    const architect = model.roles.find((r) => r.frontmatter.name === "architect");
    expect(architect?.frontmatter.model).toBe("claude-opus");
  });

  it("leaves base untouched when overlay is empty", () => {
    const base = loadBase(baseDir);
    const model = mergeOverlay(base, Overlay.parse({ version: 1 }));
    expect(model.constitution).toBe(base.constitution);
    expect(model.roles[0]?.frontmatter.model).toBeUndefined();
  });

  it("appends a role addendum under the fenced heading, leaving other roles untouched", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({
      version: 1,
      roleAddenda: { engineer: "Repo uses Vitest; run `npm test`." },
    });
    const model = mergeOverlay(base, overlay);

    const engineer = model.roles.find((r) => r.frontmatter.name === "engineer")!;
    expect(engineer.body).toContain("## Project-specific guidance (generated)");
    expect(engineer.body).toContain("Repo uses Vitest");
    // base body survives ahead of the addendum
    expect(engineer.body).toMatch(/only\*\* role permitted to[\s\S]*Project-specific guidance/);

    const reviewer = model.roles.find((r) => r.frontmatter.name === "reviewer")!;
    const baseReviewer = base.roles.find((r) => r.frontmatter.name === "reviewer")!;
    expect(reviewer.body).toBe(baseReviewer.body);
  });

  it("ignores addenda for roles absent from the base", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1, roleAddenda: { ghost: "noop" } });
    const model = mergeOverlay(base, overlay);
    for (const role of model.roles) {
      expect(role.body).not.toContain("## Project-specific guidance (generated)");
    }
  });

  it("is idempotent: merging the same addenda twice yields identical bodies", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1, roleAddenda: { tester: "Run `npm test` (ESM)." } });
    const a = mergeOverlay(base, overlay).roles.map((r) => r.body);
    const b = mergeOverlay(base, overlay).roles.map((r) => r.body);
    expect(a).toEqual(b);
  });

  it("throws when an addendum violates the contract (surfaces at compile)", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({
      version: 1,
      roleAddenda: { reviewer: "You may edit files directly to fix nits." },
    });
    expect(() => mergeOverlay(base, overlay)).toThrow(/posture/);
  });

  it("injects accepted learnings into tester and architect roles", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1 });
    const learnings: AcceptedLearningEntry[] = [
      {
        key: "test-command",
        kind: "test-command",
        claim: "Accepted test command: `npm test`",
        sources: ["package.json"],
        provenance: "miner",
      },
      {
        key: "architecture:docs",
        kind: "architecture-demotion",
        claim: "Do not treat `docs` as primary source — demoted during mining.",
        sources: [],
        provenance: "miner",
      },
    ];
    const model = mergeOverlay(base, overlay, undefined, learnings);

    const tester = model.roles.find((role) => role.frontmatter.name === "tester")!;
    expect(tester.body).toContain("Accepted project learnings");
    expect(tester.body).toContain("npm test");

    const architect = model.roles.find((role) => role.frontmatter.name === "architect")!;
    expect(architect.body).toContain("Do not treat `docs` as primary source");
  });
});
