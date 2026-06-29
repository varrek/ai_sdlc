import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { stableJson } from "../shared/roles.js";

const DEFAULT_PLUGIN_NAME = "ai-sdlc";
const DEFAULT_PLUGIN_VERSION = "0.1.0";

/**
 * Cursor plugin manifest referencing the in-repo layout the adapter already
 * emits. Explicit paths avoid duplicating agents/skills/hooks/MCP trees under
 * plugin-native root directories (see docs/plans/2026-06-29-005-*).
 */
export function emitPluginManifest(model: NeutralModel): EmittedFile {
  const cursorOptions = model.manifest.options?.cursor;
  const name = cursorOptions?.pluginName ?? DEFAULT_PLUGIN_NAME;

  const manifest = {
    name,
    displayName: "AI SDLC",
    description:
      "Evidence-backed AI SDLC configuration compiled for this repository.",
    version: DEFAULT_PLUGIN_VERSION,
    agents: ".cursor/agents",
    skills: ".agents/skills",
    hooks: ".cursor/hooks.json",
    mcpServers: ".cursor/mcp.json",
  };

  return {
    path: ".cursor-plugin/plugin.json",
    contents: stableJson(manifest),
  };
}
