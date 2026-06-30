import type { Adapter, EmitResult, HostCapabilities, NeutralModel } from "../../core/types.js";
import { emitAgents } from "./agents.js";
import { emitGates } from "./gates.js";
import { emitInstructions } from "./instructions.js";
import { emitLspGuidance } from "./lsp-guidance.js";
import { emitMcp } from "./mcp.js";
import { emitPluginManifest } from "./plugin-manifest.js";
import { emitHierarchyRules } from "./rules.js";
import { emitSkills } from "./skills.js";

const CAPABILITIES: HostCapabilities = {
  instructions: "native",
  hierarchicalInstructions: "native",
  skills: "native",
  roleSubagents: "native",
  perRoleToolRestriction: "fallback", // global mcpAllowlist only; per-role via hook
  gates: "native",
  mcp: "native",
  pluginDistribution: "partial", // opt-in `.cursor-plugin/plugin.json` with companion docs
  lspGuidance: "partial", // emits setup guidance; runtime LSP remains host/plugin-managed
};

export class CursorAdapter implements Adapter {
  readonly host = "cursor" as const;
  readonly capabilities = CAPABILITIES;

  emit(model: NeutralModel): EmitResult {
    const files = [
      ...emitInstructions(model),
      ...emitHierarchyRules(model),
      ...emitSkills(model),
      ...emitAgents(model),
      ...emitGates(model),
      ...emitMcp(model),
    ];

    if (model.manifest.options?.cursor?.pluginManifest) {
      files.push(emitPluginManifest(model));
      files.push(emitLspGuidance(model));
    }

    return { files, gaps: [] };
  }
}
