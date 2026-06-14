import type { Adapter, EmitResult, Gap, NeutralModel } from "../../core/types.js";
import { emitInstructions } from "./instructions.js";
import { emitSkills } from "./skills.js";

/**
 * Copilot's IDE has no `PreToolUse`-style hook, so the `Approved?` gate cannot
 * be enforced inline the way it can on Cursor/Claude. This is a real, permanent
 * capability gap we declare up front (honest degradation); U4 emits the
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

  emit(model: NeutralModel): EmitResult {
    return {
      files: [...emitInstructions(model), ...emitSkills(model)],
      gaps: [COPILOT_GATE_GAP],
    };
  }
}
