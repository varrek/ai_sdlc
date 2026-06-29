import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { Overlay } from "../../src/schema/index.js";
import { makeContract, makeModel, makeRole } from "../helpers/model.js";

function byPath(files: { path: string; contents: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.contents]));
}

const overlay = Overlay.parse({
  version: 1,
  integrations: {
    gitlab: { serverId: "gitlab-mcp", allowedRoles: ["engineer"] },
  },
});

function loopModel() {
  return makeModel({
    roles: [
      makeRole("engineer", "write", ["gitlab"]),
      makeRole("reviewer", "read-only", []),
    ],
    integrations: [makeContract("gitlab")],
    overlay,
  });
}

describe("agent emit (least-privilege)", () => {
  it("claude reviewer agent is read-only with no Write/Edit and no MCP tools", () => {
    const files = byPath(new ClaudeCodeAdapter().emit(loopModel()).files);
    const reviewer = matter(files.get(".claude/agents/reviewer.md")!);
    const tools = String(reviewer.data.tools);
    expect(tools).not.toMatch(/Write|Edit/);
    expect(tools).not.toMatch(/mcp__/);
    expect(tools).toContain("Read");
  });

  it("claude engineer agent can call the bound GitLab MCP server", () => {
    const files = byPath(new ClaudeCodeAdapter().emit(loopModel()).files);
    const engineer = matter(files.get(".claude/agents/engineer.md")!);
    const tools = String(engineer.data.tools);
    expect(tools).toContain("Write");
    expect(tools).toContain("mcp__gitlab-mcp");
  });

  it("cursor records posture in agent frontmatter (hook-enforced)", () => {
    const files = byPath(new CursorAdapter().emit(loopModel()).files);
    const reviewer = matter(files.get(".cursor/agents/reviewer.md")!);
    expect(reviewer.data.posture).toBe("read-only");
  });

  it("copilot emits a custom agent per role", () => {
    const files = byPath(new CopilotAdapter().emit(loopModel()).files);
    expect(files.has(".github/agents/engineer.agent.md")).toBe(true);
    expect(files.has(".github/agents/reviewer.agent.md")).toBe(true);
  });

  it("codex reviewer is read-only with no MCP servers enabled", () => {
    const files = byPath(new CodexAdapter().emit(loopModel()).files);
    const reviewer = files.get(".codex/agents/reviewer.toml")!;
    expect(reviewer).toContain('sandbox_mode = "read-only"');
    expect(reviewer).not.toContain("[mcp_servers.");
  });

  it("codex engineer enables the bound GitLab MCP server", () => {
    const files = byPath(new CodexAdapter().emit(loopModel()).files);
    const engineer = files.get(".codex/agents/engineer.toml")!;
    expect(engineer).toContain('sandbox_mode = "workspace-write"');
    expect(engineer).toContain("[mcp_servers.gitlab-mcp]");
    expect(engineer).toContain("enabled = true");
  });
});
