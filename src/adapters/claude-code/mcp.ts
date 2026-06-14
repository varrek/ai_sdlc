import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { collectServerDefs } from "../shared/mcp.js";
import { stableJson } from "../shared/roles.js";

/** Claude Code reads MCP servers from `.mcp.json`. */
export function emitMcp(model: NeutralModel): EmittedFile[] {
  const servers = collectServerDefs(model);
  return [{ path: ".mcp.json", contents: stableJson({ mcpServers: servers }) }];
}
