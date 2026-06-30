import type { Adapter, EmitResult, Gap, HostCapabilities, NeutralModel } from "../../core/types.js";
import { emitAgents } from "./agents.js";
import { emitGates } from "./gates.js";
import { emitInstructions } from "./instructions.js";
import { emitMcp } from "./mcp.js";
import { emitSkills } from "./skills.js";
import { emitSteering } from "./steering.js";

const CAPABILITIES: HostCapabilities = {
  instructions: "native",
  hierarchicalInstructions: "native",
  skills: "native",
  roleSubagents: "native",
  perRoleToolRestriction: "partial",
  gates: "partial",
  mcp: "native",
  pluginDistribution: "none",
  lspGuidance: "none",
};

const KIRO_GATE_GAP: Gap = {
  host: "kiro",
  capability: "approved-gate-hook",
  reason:
    "Kiro PreToolUse hooks do not trigger inside custom subagents; the Approved? hook applies to main-agent tool use only, while subagents rely on role guidance and native tool prompts.",
};

const KIRO_ROLE_POLICY_GAP: Gap = {
  host: "kiro",
  capability: "per-role-hook-policy",
  reason:
    "Kiro custom-agent tool lists provide partial least-privilege, but hook-based role/MCP policy does not run in subagents and main-agent role identity depends on SDLC_ACTIVE_ROLE.",
};

export class KiroAdapter implements Adapter {
  readonly host = "kiro" as const;
  readonly capabilities = CAPABILITIES;

  emit(model: NeutralModel): EmitResult {
    return {
      files: [
        ...emitInstructions(model),
        ...emitSteering(model),
        ...emitSkills(model),
        ...emitAgents(model),
        ...emitMcp(model),
        ...emitGates(model),
      ],
      gaps: [KIRO_GATE_GAP, KIRO_ROLE_POLICY_GAP],
    };
  }
}
