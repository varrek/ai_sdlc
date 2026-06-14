import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { collectServerDefs } from "../shared/mcp.js";
import { stableJson } from "../shared/roles.js";

/**
 * Cursor MCP: `.cursor/mcp.json` holds server definitions; `permissions.json`
 * holds the GLOBAL `mcpAllowlist` (Cursor has no per-role allowlist, KTD-5), so
 * per-role restriction is layered on by the gate hook.
 */
export function emitMcp(model: NeutralModel): EmittedFile[] {
  const servers = collectServerDefs(model);
  const serverIds = Object.keys(servers).sort();

  return [
    { path: ".cursor/mcp.json", contents: stableJson({ mcpServers: servers }) },
    {
      path: ".cursor/permissions.json",
      contents: stableJson({ mcpAllowlist: serverIds }),
    },
  ];
}
