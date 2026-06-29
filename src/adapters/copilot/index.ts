import type { Adapter, EmitResult, Gap, HostCapabilities, NeutralModel } from "../../core/types.js";
import { emitAgents } from "./agents.js";
import { emitGates } from "./gates.js";
import { emitHandoffs } from "./handoffs.js";
import { emitInstructions } from "./instructions.js";
import { emitMcp } from "./mcp.js";
import { emitSkills } from "./skills.js";

const CAPABILITIES: HostCapabilities = {
  instructions: "native",
  skills: "native",
  roleSubagents: "partial", // custom agents + native handoffs; no parallel subagent dispatch
  perRoleToolRestriction: "partial", // agent `tools` + server/* MCP scoping; partial enforcement
  gates: "fallback", // no IDE PreToolUse hook → instruction checklist + CI + cloud hook
  mcp: "native",
  pluginDistribution: "none",
  lspGuidance: "none",
};

/**
 * Copilot's IDE has no `PreToolUse`-style hook, so the `Approved?` gate cannot
 * be enforced inline the way it can on Cursor/Claude. This is a real, permanent
 * capability gap we declare up front (honest degradation); gates.ts emits the
 * instruction-checklist + CI + cloud-hook fallback that backs it.
 */
const COPILOT_GATE_GAP: Gap = {
  host: "copilot",
  capability: "approved-gate-hook",
  reason:
    "Copilot IDE has no PreToolUse hook; the Approved? gate degrades to an instruction checklist + branch-protection/CI enforcement (cloud/CLI hook when available).",
};

/**
 * Per-role MCP least-privilege is declared in custom-agent `tools` (`server/*`)
 * but the IDE has no `beforeMCPExecution` hook. Workspace `.vscode/mcp.json`
 * still exposes all configured servers — enforcement is partial, not fail-closed.
 */
const COPILOT_MCP_GAP: Gap = {
  host: "copilot",
  capability: "per-role-mcp-hook",
  reason:
    "Copilot IDE has no beforeMCPExecution hook; per-role MCP reach is declared in custom-agent tools (server/*) with partial enforcement only.",
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
        ...emitHandoffs(model),
        ...emitGates(model),
        ...emitMcp(model),
      ],
      gaps: [COPILOT_GATE_GAP, COPILOT_MCP_GAP],
    };
  }
}
