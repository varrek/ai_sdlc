import type { Adapter, EmitResult, HostCapabilities, NeutralModel } from "../../core/types.js";
import { emitAgents } from "./agents.js";
import { emitGates } from "./gates.js";
import { emitInstructions } from "./instructions.js";
import { emitMcp } from "./mcp.js";
import { emitPluginManifest } from "./plugin-manifest.js";
import { emitSkills } from "./skills.js";

const CAPABILITIES: HostCapabilities = {
  instructions: "native",
  skills: "native",
  roleSubagents: "native",
  perRoleToolRestriction: "fallback", // global mcpAllowlist only; per-role via hook
  gates: "native",
  mcp: "native",
};

export class CursorAdapter implements Adapter {
  readonly host = "cursor" as const;
  readonly capabilities = CAPABILITIES;

  emit(model: NeutralModel): EmitResult {
    const files = [
      ...emitInstructions(model),
      ...emitSkills(model),
      ...emitAgents(model),
      ...emitGates(model),
      ...emitMcp(model),
    ];

    if (model.manifest.options?.cursor?.pluginManifest) {
      files.push(emitPluginManifest(model));
    }

    return { files, gaps: [] };
  }
}
