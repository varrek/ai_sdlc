import { describe, expect, it } from "vitest";
import {
  acceptedInstructionScopes,
  GENERATED_INSTRUCTION_MARKER,
  hostTargetsForScope,
  type InstructionHierarchy,
  parseInstructionHierarchy,
  parseProjectContext,
  serializeInstructionHierarchy,
  slugifyScopePath,
} from "../../src/core/project-context.js";

const hierarchy: InstructionHierarchy = {
  version: 1,
  scopes: [
    {
      path: "src/core",
      kind: "module",
      role: "Source module",
      sources: ["src/core/index.ts"],
      instructionBody: `${GENERATED_INSTRUCTION_MARKER}\n\n# Core guidance\n`,
      hostTargets: [
        "src/core/CLAUDE.md",
        "src/core/AGENTS.md",
        ".cursor/rules/src-core.mdc",
        ".github/instructions/src-core.instructions.md",
      ],
      ownership: "generated",
      accepted: true,
    },
  ],
};

describe("project context hierarchy", () => {
  it("round-trips a serialized instruction hierarchy", () => {
    expect(parseInstructionHierarchy(JSON.parse(serializeInstructionHierarchy(hierarchy)))).toEqual(
      hierarchy,
    );
  });

  it("rejects malformed instruction hierarchies", () => {
    expect(parseInstructionHierarchy({ version: 2, scopes: [] })).toBeUndefined();
    expect(
      parseInstructionHierarchy({
        version: 1,
        scopes: [{ path: "src/core", kind: "module" }],
      }),
    ).toBeUndefined();
  });

  it("filters unaccepted hierarchy scopes before emission", () => {
    const [accepted] = acceptedInstructionScopes({
      packages: [],
      map: [],
      exclusions: [],
      instructionHierarchy: {
        version: 1,
        scopes: [
          hierarchy.scopes[0]!,
          { ...hierarchy.scopes[0]!, path: "src/experimental", accepted: false },
        ],
      },
    });

    expect(accepted?.path).toBe("src/core");
  });

  it("falls back to packages when a generated hierarchy has no scopes", () => {
    const [scope] = acceptedInstructionScopes({
      packages: [
        {
          path: "packages/api",
          instructionBody: "API guidance",
          testCommand: "pytest",
        },
      ],
      map: [],
      exclusions: [],
      instructionHierarchy: { version: 1, scopes: [] },
    });

    expect(scope?.path).toBe("packages/api");
  });

  it("slugifies path separators distinctly from hyphens inside segments", () => {
    expect(slugifyScopePath("src/foo")).toBe("src-foo");
    expect(slugifyScopePath("src-foo")).toBe("src_2d_foo");
  });

  it("includes Kiro steering in scope host targets", () => {
    expect(hostTargetsForScope("src/core")).toContain(".kiro/steering/src-core.md");
  });

  it("falls back to package scopes when hierarchy is absent or malformed", () => {
    const context = parseProjectContext(
      JSON.stringify({
        packages: [
          {
            path: "packages/api",
            languages: ["typescript"],
            instructionBody: "API guidance",
            testCommand: "npm test",
          },
        ],
        instructionHierarchy: { version: 1, scopes: [{ path: "bad" }] },
        map: [],
        exclusions: [],
      }),
    );

    expect(context?.instructionHierarchy).toBeUndefined();
    expect(acceptedInstructionScopes(context)).toMatchObject([
      {
        path: "packages/api",
        kind: "package",
        instructionBody: "API guidance",
        accepted: true,
      },
    ]);
  });
});
