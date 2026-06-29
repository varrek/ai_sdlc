import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { AdapterRegistry } from "../../src/core/adapter-registry.js";
import { compile } from "../../src/core/engine.js";
import { makeModel, makeSkill } from "../helpers/model.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function freshOut(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-skills-"));
  tmpDirs.push(dir);
  return dir;
}

function registry(): AdapterRegistry {
  return new AdapterRegistry()
    .register(new CursorAdapter())
    .register(new ClaudeCodeAdapter())
    .register(new CopilotAdapter())
    .register(new CodexAdapter());
}

describe("skills emit", () => {
  it("emits a valid SKILL.md in each host path with required frontmatter", () => {
    const model = makeModel({ skills: [makeSkill("customize", { disableModelInvocation: true })] });
    const files = new Map(
      [
        ...new CursorAdapter().emit(model).files,
        ...new ClaudeCodeAdapter().emit(model).files,
        ...new CopilotAdapter().emit(model).files,
        ...new CodexAdapter().emit(model).files,
      ].map((f) => [f.path, f.contents]),
    );

    const expected = [
      ".agents/skills/customize/SKILL.md",
      ".cursor/skills/customize/SKILL.md",
      ".claude/skills/customize/SKILL.md",
      ".github/skills/customize/SKILL.md",
      ".codex/skills/customize/SKILL.md",
    ];
    for (const path of expected) {
      expect(files.has(path), `missing ${path}`).toBe(true);
      const parsed = matter(files.get(path)!);
      expect(parsed.data.name).toBe("customize");
      expect(parsed.data.description).toBeTruthy();
      // disableModelInvocation maps to the kebab-case standard key
      expect(parsed.data["disable-model-invocation"]).toBe(true);
      expect(parsed.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("re-emit after removing a skill prunes its files on every host (no orphans)", () => {
    const out = freshOut();
    const two = makeModel({ skills: [makeSkill("alpha"), makeSkill("beta")] });
    compile(two, registry(), { outDir: out });
    expect(existsSync(join(out, ".claude/skills/beta/SKILL.md"))).toBe(true);

    const one = makeModel({ skills: [makeSkill("alpha")] });
    const result = compile(one, registry(), { outDir: out });

    for (const host of [".agents", ".cursor", ".claude", ".github", ".codex"]) {
      expect(existsSync(join(out, host, "skills/beta/SKILL.md"))).toBe(false);
    }
    expect(result.pruned).toContain(".claude/skills/beta/SKILL.md");
    expect(existsSync(join(out, ".cursor/skills/alpha/SKILL.md"))).toBe(true);
  });
});
