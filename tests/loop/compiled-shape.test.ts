import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { loadBase, loadOverlay } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

function model() {
  return mergeOverlay(loadBase(baseDir), loadOverlay(undefined));
}

function byPath(files: { path: string; contents: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.contents]));
}

describe("compiled loop shape", () => {
  it("base ships the loop roles + the loop skill", () => {
    const m = model();
    const names = m.roles.map((r) => r.frontmatter.name).sort();
    expect(names).toEqual(["architect", "debugger", "engineer", "reviewer", "tester"]);
    expect(m.skills.some((s) => s.frontmatter.name === "sdlc-loop")).toBe(true);
  });

  it("a role addendum reaches the emitted host agent files, fenced under its heading", () => {
    const m = mergeOverlay(
      loadBase(baseDir),
      Overlay.parse({ version: 1, roleAddenda: { engineer: "REPO-MARKER: use Vitest, ESM only." } }),
    );
    const cursor = byPath(new CursorAdapter().emit(m).files);
    const claude = byPath(new ClaudeCodeAdapter().emit(m).files);

    for (const file of [
      cursor.get(".cursor/agents/engineer.md")!,
      claude.get(".claude/agents/engineer.md")!,
    ]) {
      expect(file).toContain("## Project-specific guidance (generated)");
      expect(file).toContain("REPO-MARKER: use Vitest, ESM only.");
      // base body still present ahead of the addendum
      expect(file).toMatch(/only\*\* role permitted to[\s\S]*Project-specific guidance/);
    }
    // a role with no addendum is unaffected
    expect(cursor.get(".cursor/agents/reviewer.md")!).not.toContain("Project-specific guidance");
  });

  it("the tester is emitted read-run on every host", () => {
    const m = model();
    const cursor = byPath(new CursorAdapter().emit(m).files);
    const claude = byPath(new ClaudeCodeAdapter().emit(m).files);

    expect(matter(cursor.get(".cursor/agents/tester.md")!).data.posture).toBe("read-run");
    // read-run grants Bash (run tests) but never Write/Edit.
    const testerTools = String(matter(claude.get(".claude/agents/tester.md")!).data.tools);
    expect(testerTools).toMatch(/Bash/);
    expect(testerTools).not.toMatch(/Write|Edit/);
  });

  it("cursor + claude dispatch the roles with correct tool postures", () => {
    const m = model();
    const cursor = byPath(new CursorAdapter().emit(m).files);
    const claude = byPath(new ClaudeCodeAdapter().emit(m).files);

    // Cursor records posture; Claude enforces via tools allowlist.
    expect(matter(cursor.get(".cursor/agents/engineer.md")!).data.posture).toBe("write");
    expect(matter(cursor.get(".cursor/agents/architect.md")!).data.posture).toBe("read-only");

    const engineerTools = String(matter(claude.get(".claude/agents/engineer.md")!).data.tools);
    expect(engineerTools).toMatch(/Write/);
    const architectTools = String(matter(claude.get(".claude/agents/architect.md")!).data.tools);
    expect(architectTools).not.toMatch(/Write|Edit/);
  });

  it("reviewer is emitted read-only on every host", () => {
    const m = model();
    const cursor = byPath(new CursorAdapter().emit(m).files);
    const claude = byPath(new ClaudeCodeAdapter().emit(m).files);
    const copilot = byPath(new CopilotAdapter().emit(m).files);

    expect(matter(cursor.get(".cursor/agents/reviewer.md")!).data.posture).toBe("read-only");
    const claudeReviewer = String(matter(claude.get(".claude/agents/reviewer.md")!).data.tools);
    expect(claudeReviewer).not.toMatch(/Write|Edit/);
    const copilotReviewer = matter(copilot.get(".github/agents/reviewer.agent.md")!).data.tools as string[];
    expect(copilotReviewer).not.toContain("Write");
    expect(copilotReviewer).not.toContain("Edit");
  });

  it("copilot emits sequential handoffs + the IDE-gate fallback note", () => {
    const copilot = byPath(new CopilotAdapter().emit(model()).files);
    const handoffs = JSON.parse(copilot.get(".github/agents/handoffs.json")!) as {
      order: string[];
      handoffs: { from: string; to: string }[];
      note: string;
    };
    expect(handoffs.order).toEqual(["architect", "engineer", "test", "reviewer"]);
    expect(handoffs.handoffs).toEqual([
      { from: "architect", to: "engineer" },
      { from: "engineer", to: "test" },
      { from: "test", to: "reviewer" },
    ]);
    expect(handoffs.note).toMatch(/no pre-tool gate hook/i);
    expect(handoffs.note).toMatch(/native handoffs/i);
    expect(copilot.get(".github/copilot-instructions.md")).toMatch(/no pre-tool gate hook/i);

    const architect = matter(copilot.get(".github/agents/architect.agent.md")!);
    expect(architect.data.target).toBe("vscode");
    expect(architect.data.handoffs).toBeDefined();
  });

  it("copilot handoffs honor the overlay ceremony track (quick drops architect)", () => {
    const quick = mergeOverlay(
      loadBase(baseDir),
      Overlay.parse({ version: 1, defaultTrack: "quick" }),
    );
    const copilot = byPath(new CopilotAdapter().emit(quick).files);
    const handoffs = JSON.parse(copilot.get(".github/agents/handoffs.json")!) as {
      track: string;
      order: string[];
      handoffs: { from: string; to: string }[];
    };
    expect(handoffs.track).toBe("quick");
    expect(handoffs.order).toEqual(["engineer", "reviewer"]);
    expect(handoffs.handoffs).toEqual([{ from: "engineer", to: "reviewer" }]);
  });

  it("full track wires the wrap-up stage into the handoff chain (performed by engineer)", () => {
    const full = mergeOverlay(loadBase(baseDir), Overlay.parse({ version: 1, defaultTrack: "full" }));
    const copilot = byPath(new CopilotAdapter().emit(full).files);
    const handoffs = JSON.parse(copilot.get(".github/agents/handoffs.json")!) as {
      track: string;
      order: string[];
      stageAgents: Record<string, string>;
      handoffs: { from: string; to: string }[];
      note: string;
    };
    expect(handoffs.track).toBe("full");
    expect(handoffs.order).toEqual(["architect", "engineer", "test", "reviewer", "wrap-up"]);
    expect(handoffs.handoffs).toContainEqual({ from: "reviewer", to: "wrap-up" });
    // wrap-up is a stage, not a role — the Engineer (sole writer) performs it.
    expect(handoffs.stageAgents["wrap-up"]).toBe("engineer");
    // the test stage is performed by the Tester (read-run, never writes).
    expect(handoffs.stageAgents.test).toBe("tester");
    expect(handoffs.note).toMatch(/wrap-up stage runs as the Engineer/i);
  });

  it("ships the wrap-up skill only on the full track", () => {
    const skillNames = (track: "quick" | "standard" | "full") =>
      mergeOverlay(loadBase(baseDir), Overlay.parse({ version: 1, defaultTrack: track }))
        .skills.map((s) => s.frontmatter.name)
        .sort();

    expect(skillNames("full")).toContain("wrap-up");
    expect(skillNames("standard")).not.toContain("wrap-up");
    expect(skillNames("quick")).not.toContain("wrap-up");
    // General-capability skills survive on every track.
    for (const track of ["quick", "standard", "full"] as const) {
      expect(skillNames(track)).toEqual(expect.arrayContaining(["customize", "sdlc-loop", "track-select"]));
    }
  });

  it("a full-track repo emits the wrap-up SKILL.md across hosts", () => {
    const full = mergeOverlay(loadBase(baseDir), Overlay.parse({ version: 1, defaultTrack: "full" }));
    const files = byPath(new CopilotAdapter().emit(full).files);
    expect(files.has(".github/skills/wrap-up/SKILL.md")).toBe(true);
    // The track directive is build-time only — it must not leak into emitted frontmatter.
    expect(files.get(".github/skills/wrap-up/SKILL.md")).not.toMatch(/tracks:/);
  });
});
