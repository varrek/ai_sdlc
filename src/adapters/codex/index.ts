import type { Adapter, EmitResult, HostCapabilities, NeutralModel } from "../../core/types.js";
import { emitAgents } from "./agents.js";
import { emitGates } from "./gates.js";
import { emitInstructions } from "./instructions.js";
import { emitSkills } from "./skills.js";

const CAPABILITIES: HostCapabilities = {
  instructions: "native",
  skills: "native",
  roleSubagents: "native",
  perRoleToolRestriction: "partial", // sandbox_mode + per-agent MCP; no tool allowlist
  gates: "native",
  mcp: "native",
};

export class CodexAdapter implements Adapter {
  readonly host = "codex" as const;
  readonly capabilities = CAPABILITIES;

  emit(model: NeutralModel): EmitResult {
    return {
      files: [
        ...emitInstructions(model),
        ...emitSkills(model),
        ...emitAgents(model),
        ...emitGates(model),
      ],
      gaps: [],
    };
  }
}
