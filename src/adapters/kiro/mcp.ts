import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { collectServerDefs } from "../shared/mcp.js";
import { stableJson } from "../shared/roles.js";

/** Kiro reads workspace MCP servers from `.kiro/settings/mcp.json`. */
export function emitMcp(model: NeutralModel): EmittedFile[] {
  return [
    {
      path: ".kiro/settings/mcp.json",
      contents: stableJson({ mcpServers: collectServerDefs(model) }),
    },
  ];
}
