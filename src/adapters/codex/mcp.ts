import type { NeutralModel } from "../../core/types.js";
import { collectServerDefs, type ServerDef } from "../shared/mcp.js";
import { tomlInlineTable, tomlString, tomlStringArray } from "./toml.js";

function renderServerTable(serverId: string, def: ServerDef): string {
  const lines: string[] = [`[mcp_servers.${serverId}]`];

  if (typeof def.command === "string") {
    lines.push(`command = ${tomlString(def.command)}`);
  }
  if (Array.isArray(def.args) && def.args.length > 0) {
    lines.push(`args = ${tomlStringArray(def.args.filter((arg): arg is string => typeof arg === "string"))}`);
  }
  if (typeof def.url === "string") {
    lines.push(`url = ${tomlString(def.url)}`);
  }
  if (def.env && typeof def.env === "object" && !Array.isArray(def.env)) {
    const env = Object.fromEntries(
      Object.entries(def.env as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    if (Object.keys(env).length > 0) {
      lines.push(`env = ${tomlInlineTable(env)}`);
    }
  }

  lines.push("enabled = true");
  return lines.join("\n");
}

/** Codex reads MCP servers from project-scoped `.codex/config.toml`. */
export function renderMcpSections(model: NeutralModel): string[] {
  const servers = collectServerDefs(model);
  return Object.keys(servers)
    .sort()
    .map((serverId) => renderServerTable(serverId, servers[serverId]!));
}
