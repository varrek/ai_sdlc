import type { Adapter, EmitResult, HostCapabilities, NeutralModel } from "../../core/types.js";
import { emitAgents } from "./agents.js";
import { emitGates } from "./gates.js";
import { emitInstructions } from "./instructions.js";
import { emitMcp } from "./mcp.js";
import { emitSkills } from "./skills.js";

const CAPABILITIES: HostCapabilities = {
  instructions: "native",
  hierarchicalInstructions: "native",
  skills: "native",
  roleSubagents: "native",
  perRoleToolRestriction: "native", // tools/disallowedTools frontmatter
  gates: "native",
  mcp: "native",
  pluginDistribution: "none",
  lspGuidance: "none",
};

export class ClaudeCodeAdapter implements Adapter {
  readonly host = "claude-code" as const;
  readonly capabilities = CAPABILITIES;

  emit(model: NeutralModel): EmitResult {
    return {
      files: [
        ...emitInstructions(model),
        ...emitSkills(model),
        ...emitAgents(model),
        ...emitGates(model),
        ...emitMcp(model),
      ],
      gaps: [],
    };
  }
}
