import { describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { Overlay } from "../../src/schema/index.js";
import { makeContract, makeModel, makeRole } from "../helpers/model.js";

function byPath(files: { path: string; contents: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.contents]));
}

const model = makeModel({
  roles: [makeRole("engineer", "write", ["gitlab"])],
  integrations: [makeContract("gitlab")],
  overlay: Overlay.parse({
    version: 1,
    integrations: {
      gitlab: {
        serverId: "gitlab-mcp",
        allowedRoles: ["engineer"],
        server: { command: "gitlab-mcp-server", env: { GITLAB_TOKEN: "GITLAB_TOKEN" } },
      },
    },
  }),
});

describe("mcp emit", () => {
  it("produces matching server defs across the three host files", () => {
    const cursor = byPath(new CursorAdapter().emit(model).files);
    const claude = byPath(new ClaudeCodeAdapter().emit(model).files);
    const copilot = byPath(new CopilotAdapter().emit(model).files);

    const cursorServers = JSON.parse(cursor.get(".cursor/mcp.json")!).mcpServers;
    const claudeServers = JSON.parse(claude.get(".mcp.json")!).mcpServers;
    const copilotServers = JSON.parse(copilot.get(".vscode/mcp.json")!).servers;

    expect(cursorServers).toEqual(claudeServers);
    expect(copilotServers).toEqual(claudeServers);
    expect(cursorServers["gitlab-mcp"].command).toBe("gitlab-mcp-server");
    expect(cursorServers["gitlab-mcp"].env).toEqual({ GITLAB_TOKEN: "GITLAB_TOKEN" });
  });

  it("cursor permissions.json lists the bound server in the global allowlist", () => {
    const cursor = byPath(new CursorAdapter().emit(model).files);
    const perms = JSON.parse(cursor.get(".cursor/permissions.json")!) as { mcpAllowlist: string[] };
    expect(perms.mcpAllowlist).toContain("gitlab-mcp");
  });
});
