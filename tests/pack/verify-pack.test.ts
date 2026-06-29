import { describe, expect, it } from "vitest";

const { buildPackContract, validatePackedFiles } = await import("../../scripts/pack-rules.mjs");

describe("pack verification rules", () => {
  const packageJson = {
    bin: {
      aisdlc: "./dist/cli/index.js",
    },
    files: ["dist", "sdlc-base", "packs", "templates", "docs/capability-matrix.md", "SECURITY.md"],
  };

  it("accepts a package containing the declared bin, sentinels, and explicit files", () => {
    const contract = buildPackContract(packageJson);
    const packedFiles = new Set([
      "package.json",
      "README.md",
      "dist/cli/index.js",
      "sdlc-base/AGENTS.md",
      "packs/security/pack.yaml",
      "templates/overlay/README.md",
      "docs/capability-matrix.md",
      "SECURITY.md",
    ]);

    expect(validatePackedFiles(packedFiles, contract)).toEqual([]);
  });

  it("reports missing required package paths", () => {
    const contract = buildPackContract(packageJson);
    const packedFiles = new Set(["package.json", "README.md", "dist/cli/index.js"]);

    expect(validatePackedFiles(packedFiles, contract)).toEqual([
      "expected docs/capability-matrix.md to be included in the package",
      "expected SECURITY.md to be included in the package",
      "expected sdlc-base/AGENTS.md to be included in the package",
      "expected packs/security/pack.yaml to be included in the package",
      "expected templates/overlay/README.md to be included in the package",
    ]);
  });

  it("rejects development-only files outside the package allowlist", () => {
    const contract = buildPackContract(packageJson);
    const packedFiles = new Set([
      "package.json",
      "README.md",
      "dist/cli/index.js",
      "sdlc-base/AGENTS.md",
      "packs/security/pack.yaml",
      "templates/overlay/README.md",
      "docs/capability-matrix.md",
      "SECURITY.md",
      "tests/pack/verify-pack.test.ts",
    ]);

    expect(validatePackedFiles(packedFiles, contract)).toContain(
      "unexpected development-only file in package: tests/pack/verify-pack.test.ts",
    );
  });
});
