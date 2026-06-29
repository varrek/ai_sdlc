import { describe, expect, it } from "vitest";
import { buildLspGuidance, renderLspGuidance } from "../../src/core/lsp-guidance.js";

describe("LSP guidance", () => {
  it("maps known languages to stable language-server recommendations", () => {
    const guidance = buildLspGuidance({
      languages: ["typescript", "python", "go", "java", "c#", "rust"],
      packages: [],
      map: [],
      exclusions: [],
    });

    expect(guidance.recommendations.map((r) => r.server)).toEqual([
      "csharp-ls",
      "gopls",
      "jdtls",
      "pyright",
      "rust-analyzer",
      "typescript-language-server",
    ]);
  });

  it("groups recommendations by package path and reports unknown languages", () => {
    const markdown = renderLspGuidance({
      packages: [
        { path: "packages/web", languages: ["typescript"], instructionBody: "" },
        { path: "packages/api", languages: ["python", "elixir"], instructionBody: "" },
      ],
      map: [],
      exclusions: [],
    });

    expect(markdown).toContain("typescript-language-server");
    expect(markdown).toContain("`packages/web`");
    expect(markdown).toContain("pyright");
    expect(markdown).toContain("`packages/api`");
    expect(markdown).toContain("`elixir`");
  });
});
