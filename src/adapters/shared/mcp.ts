import type { McpServerSpec } from "../../schema/index.js";
import type { NeutralModel } from "../../core/types.js";

export type ServerDef = Record<string, unknown>;

function serverDefFromSpec(spec: McpServerSpec | undefined): ServerDef {
  const def: ServerDef = {};
  if (!spec) return def;
  if (spec.command) {
    def.command = spec.command;
    if (spec.args.length > 0) def.args = spec.args;
  }
  if (spec.url) def.url = spec.url;
  if (Object.keys(spec.env).length > 0) def.env = spec.env;
  return def;
}

/**
 * Collect serverId -> connection def for every integration contract that has an
 * overlay binding. Host adapters wrap these in their own envelope key
 * (`mcpServers` for Cursor/Claude, `servers` for Copilot's `.vscode/mcp.json`),
 * so the underlying server definitions stay identical across hosts.
 */
export function collectServerDefs(model: NeutralModel): Record<string, ServerDef> {
  const defs: Record<string, ServerDef> = {};
  for (const contract of model.integrations) {
    const binding = model.overlay.integrations[contract.name];
    if (!binding) continue;
    defs[binding.serverId] = serverDefFromSpec(binding.server);
  }
  return defs;
}
