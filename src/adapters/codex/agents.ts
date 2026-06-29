import type { ToolPosture } from "../../schema/index.js";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { allowedServersForRole } from "../shared/roles.js";
import { joinTomlSections, tomlMultilineString, tomlString } from "./toml.js";

function sandboxModeForPosture(posture: ToolPosture): string {
  switch (posture) {
    case "read-only":
      return "read-only";
    case "read-run":
      return "read-only";
    case "write":
      return "workspace-write";
    default: {
      const _exhaustive: never = posture;
      return _exhaustive;
    }
  }
}

/**
 * Codex custom agents in `.codex/agents/<name>.toml`. Least-privilege uses
 * `sandbox_mode` plus per-agent MCP enablement (servers are defined in
 * `.codex/config.toml`).
 */
export function emitAgents(model: NeutralModel): EmittedFile[] {
  return model.roles.map((role) => {
    const lines = [
      `name = ${tomlString(role.frontmatter.name)}`,
      `description = ${tomlString(role.frontmatter.description)}`,
      `sandbox_mode = ${tomlString(sandboxModeForPosture(role.frontmatter.posture))}`,
    ];
    if (role.frontmatter.model) {
      lines.push(`model = ${tomlString(role.frontmatter.model)}`);
    }
    lines.push(`developer_instructions = ${tomlMultilineString(role.body.trim())}`);

    for (const serverId of allowedServersForRole(role, model.overlay)) {
      lines.push("");
      lines.push(`[mcp_servers.${serverId}]`);
      lines.push("enabled = true");
    }

    return {
      path: `.codex/agents/${role.frontmatter.name}.toml`,
      contents: joinTomlSections([lines.join("\n")]),
    };
  });
}
