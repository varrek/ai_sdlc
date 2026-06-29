import { describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { makeModel } from "../helpers/model.js";

function byPath(files: { path: string; contents: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.contents]));
}

describe("instructions emit", () => {
  it("cursor emits AGENTS.md as a passthrough of the constitution", () => {
    const model = makeModel();
    const files = byPath(new CursorAdapter().emit(model).files);
    expect(files.get("AGENTS.md")).toBe(model.constitution);
  });

  it("claude emits CLAUDE.md with an @AGENTS.md import and a Claude appendix", () => {
    const model = makeModel();
    const files = byPath(new ClaudeCodeAdapter().emit(model).files);
    expect(files.has("AGENTS.md")).toBe(true);
    const claude = files.get("CLAUDE.md")!;
    expect(claude).toContain("@AGENTS.md");
    expect(claude).toContain("Claude Code appendix");
  });

  it("copilot emits AGENTS.md plus a copilot-instructions excerpt of the gates", () => {
    const model = makeModel();
    const files = byPath(new CopilotAdapter().emit(model).files);
    expect(files.has("AGENTS.md")).toBe(true);
    const excerpt = files.get(".github/copilot-instructions.md")!;
    expect(excerpt).toContain("Non-negotiable gates");
    expect(excerpt).toContain("Review required.");
  });

  it("copilot inlines mined project standards (Copilot does not follow @import reliably)", () => {
    const model = makeModel({
      constitution: [
        makeModel().constitution,
        "",
        "## Project standards (from overlay)",
        "",
        "- Run tests with `pytest`; the test suite must pass before a change ships.",
        "- Lint/format with ruff.",
      ].join("\n"),
    });
    const excerpt = byPath(new CopilotAdapter().emit(model).files).get(
      ".github/copilot-instructions.md",
    )!;
    expect(excerpt).toContain("Project standards");
    expect(excerpt).toContain("pytest");
    expect(excerpt).toContain("ruff");
  });

  it("copilot omits the standards section when the overlay contributes none", () => {
    const excerpt = byPath(new CopilotAdapter().emit(makeModel()).files).get(
      ".github/copilot-instructions.md",
    )!;
    expect(excerpt).not.toContain("Project standards");
  });

  it("codex emits AGENTS.md as a passthrough of the constitution", () => {
    const model = makeModel();
    const files = byPath(new CodexAdapter().emit(model).files);
    expect(files.get("AGENTS.md")).toBe(model.constitution);
  });
});
