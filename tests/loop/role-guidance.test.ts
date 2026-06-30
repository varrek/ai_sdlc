import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { KiroAdapter } from "../../src/adapters/kiro/index.js";
import { loadBase } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

function byPath(files: { path: string; contents: string }[]): Map<string, string> {
  return new Map(files.map((file) => [file.path, file.contents]));
}

describe("base role loop guidance", () => {
  it("adds bounded operating-loop vocabulary to every base role", () => {
    const base = loadBase(baseDir);

    for (const role of base.roles) {
      expect(role.body).toContain("## Operating loop");
      expect(role.body).toContain("three to five");
      for (const token of ["`continue`", "`replan`", "`escalate`", "`done`"]) {
        expect(role.body).toContain(token);
      }
      expect(role.body).toContain("Replan at most twice");
    }
  });

  it("frames tester and reviewer as evaluator gates", () => {
    const base = loadBase(baseDir);
    const tester = base.roles.find((role) => role.frontmatter.name === "tester")!;
    const reviewer = base.roles.find((role) => role.frontmatter.name === "reviewer")!;
    const engineer = base.roles.find((role) => role.frontmatter.name === "engineer")!;

    expect(tester.body).toContain("## Evaluator gate");
    expect(tester.body).toContain("**Fail**");
    expect(tester.body).toContain("actionable deltas");
    expect(reviewer.body).toContain("## Evaluator gate");
    expect(reviewer.body).toContain("**Request changes**");
    expect(reviewer.body).toContain("ordered, actionable deltas");
    expect(engineer.body).toContain("act only on the listed deltas");
  });

  it("emits bounded loop guidance across host adapters", () => {
    const model = mergeOverlay(loadBase(baseDir), Overlay.parse({ version: 1 }));
    const cursor = byPath(new CursorAdapter().emit(model).files);
    const claude = byPath(new ClaudeCodeAdapter().emit(model).files);
    const codex = byPath(new CodexAdapter().emit(model).files);
    const kiro = byPath(new KiroAdapter().emit(model).files);

    for (const body of [
      cursor.get(".cursor/agents/reviewer.md")!,
      claude.get(".claude/agents/reviewer.md")!,
      codex.get(".codex/agents/reviewer.toml")!,
      kiro.get(".kiro/agents/reviewer.md")!,
    ]) {
      expect(body).toContain("## Operating loop");
      expect(body).toContain("## Evaluator gate");
      expect(body).toContain("ordered, actionable deltas");
    }
  });
});
