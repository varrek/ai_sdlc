import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { collectServerDefs } from "../shared/mcp.js";
import { stableJson } from "../shared/roles.js";

/**
 * Copilot reads MCP servers from `.vscode/mcp.json` under a `servers` key
 * (vs `mcpServers` on Cursor/Claude). The underlying server defs are identical.
 */
export function emitMcp(model: NeutralModel): EmittedFile[] {
  const servers = collectServerDefs(model);
  return [{ path: ".vscode/mcp.json", contents: stableJson({ servers }) }];
}
