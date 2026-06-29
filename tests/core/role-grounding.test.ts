import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBase } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";
import type { ProjectContext } from "../../src/core/project-context.js";
import {
  appendArchitectGrounding,
  hasDeterministicTesterGrounding,
  ROLE_GROUNDING_HEADING,
} from "../../src/core/role-grounding.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

const sampleMap: ProjectContext = {
  packages: [],
  map: [{ path: "src", role: "Application source", sources: ["src/main.py"] }],
  exclusions: [],
};

const monorepoContext: ProjectContext = {
  packages: [
    { path: "packages/api", instructionBody: "", testCommand: "pytest" },
    { path: "packages/web", instructionBody: "", testCommand: "vitest run" },
  ],
  map: [
    { path: "packages/api", role: "Python API", sources: ["packages/api/pyproject.toml"] },
    { path: "packages/web", role: "Web frontend", sources: ["packages/web/package.json"] },
  ],
  exclusions: [],
};

describe("role grounding", () => {
  it("appends architect map grounding without changing other roles", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1 });
    const model = mergeOverlay(base, overlay, sampleMap);
    const architect = model.roles.find((r) => r.frontmatter.name === "architect")!;
    const tester = model.roles.find((r) => r.frontmatter.name === "tester")!;
    expect(architect.body).toContain(ROLE_GROUNDING_HEADING);
    expect(architect.body).toContain("`src`");
    expect(tester.body).not.toContain(ROLE_GROUNDING_HEADING);
  });

  it("appends tester grounding with root command and provenance", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({
      version: 1,
      interviewAnswers: { "test-command": "pytest" },
      gapClosureProvenance: { "test-command": "miner" },
    });
    const model = mergeOverlay(base, overlay, sampleMap);
    const tester = model.roles.find((r) => r.frontmatter.name === "tester")!;
    expect(tester.body).toContain(ROLE_GROUNDING_HEADING);
    expect(tester.body).toContain("**Root:** `pytest`");
    expect(tester.body).toContain("provenance: miner");
    expect(tester.body).toContain("Do not infer a test runner");
  });

  it("appends package-local tester grounding when root test-command gap is open", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1 });
    const model = mergeOverlay(base, overlay, monorepoContext);
    const tester = model.roles.find((r) => r.frontmatter.name === "tester")!;
    expect(tester.body).toContain("**`packages/api`:** `pytest`");
    expect(tester.body).toContain("**`packages/web`:** `vitest run`");
    expect(tester.body).not.toContain("**Root:**");
  });

  it("leaves tester generic when no test commands are known", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1 });
    const emptyContext: ProjectContext = { packages: [], map: [], exclusions: [] };
    const model = mergeOverlay(base, overlay, emptyContext);
    const tester = model.roles.find((r) => r.frontmatter.name === "tester")!;
    expect(tester.body).not.toContain(ROLE_GROUNDING_HEADING);
    expect(hasDeterministicTesterGrounding({ overlay, projectContext: emptyContext })).toBe(false);
  });

  it("preserves architect behavior when project map is empty", () => {
    const base = loadBase(baseDir);
    const architect = base.roles.find((r) => r.frontmatter.name === "architect")!;
    const unchanged = appendArchitectGrounding(architect, { packages: [], map: [], exclusions: [] });
    expect(unchanged.body).toBe(architect.body);
  });

  it("composes LLM addenda with deterministic tester grounding", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({
      version: 1,
      interviewAnswers: { "test-command": "npm test" },
      gapClosureProvenance: { "test-command": "ci" },
      roleAddenda: { tester: "Also run lint before merge." },
    });
    const model = mergeOverlay(base, overlay, sampleMap);
    const tester = model.roles.find((r) => r.frontmatter.name === "tester")!;
    expect(tester.body).toContain("## Project-specific guidance (generated)");
    expect(tester.body).toContain("Also run lint before merge.");
    expect(tester.body).toContain("**Root:** `npm test`");
  });
});
