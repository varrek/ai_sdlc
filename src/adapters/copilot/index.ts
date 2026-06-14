import type {
  Adapter,
  EmitResult,
  Gap,
  HostCapabilities,
  NeutralModel,
} from "../../core/types.js";
import { emitAgents } from "./agents.js";
import { emitGates } from "./gates.js";
import { emitInstructions } from "./instructions.js";
import { emitMcp } from "./mcp.js";
import { emitSkills } from "./skills.js";

const CAPABILITIES: HostCapabilities = {
  instructions: "native",
  skills: "native",
  roleSubagents: "partial", // runSubagent / handoffs; cloud agent for autonomous
  perRoleToolRestriction: "partial", // custom-agent tools; no MCP-by-role hook in IDE
  gates: "fallback", // no IDE hook → instruction checklist + CI
  mcp: "native",
};

/**
 * Copilot's IDE has no `PreToolUse`-style hook, so the `Approved?` gate cannot
 * be enforced inline the way it can on Cursor/Claude. This is a real, permanent
 * capability gap we declare up front (honest degradation); gates.ts emits the
 * instruction-checklist + CI fallback that backs it.
 */
const COPILOT_GATE_GAP: Gap = {
  host: "copilot",
  capability: "approved-gate-hook",
  reason:
    "Copilot IDE has no PreToolUse hook; the Approved? gate degrades to an instruction checklist + branch-protection/CI enforcement.",
};

export class CopilotAdapter implements Adapter {
  readonly host = "copilot" as const;
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
      gaps: [COPILOT_GATE_GAP],
    };
  }
}
