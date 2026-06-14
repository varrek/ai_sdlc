import { loopStagesForTrack, STAGE_ROLE } from "../../core/loop.js";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { stableJson } from "../shared/roles.js";

/**
 * Copilot orchestrates via sequential handoffs between custom agents (no
 * parallel subagent dispatch, no IDE gate). We emit an explicit handoff chain
 * for the SDLC loop plus the documented gate fallback, so the degradation is a
 * first-class artifact rather than an implicit gap. The chain is the per-track
 * stage sequence (quick drops the Architect; full appends the integration
 * wrap-up), and `stageAgents` maps each stage to the agent that performs it —
 * wrap-up is performed by the Engineer (sole holder of the gitlab/jira
 * integrations), so least-privilege is preserved.
 */
export function emitHandoffs(model: NeutralModel): EmittedFile[] {
  const order = loopStagesForTrack(model);
  if (order.length < 2) return [];

  const handoffs = order.slice(0, -1).map((from, i) => ({ from, to: order[i + 1]! }));
  const stageAgents = Object.fromEntries(order.map((stage) => [stage, STAGE_ROLE[stage]]));
  const hasWrapUp = order.includes("wrap-up");

  const doc = {
    version: 1,
    track: model.overlay.defaultTrack ?? "standard",
    note:
      "Copilot IDE has no pre-tool gate hook. The Approved? gate is enforced via " +
      ".github/copilot-instructions.md (checklist) + .github/workflows/sdlc-gate.yml (CI). " +
      "Roles run as sequential handoffs; autonomous wrap-up routes through the Copilot cloud agent." +
      (hasWrapUp
        ? " The wrap-up stage runs as the Engineer and requires bound gitlab + jira integrations."
        : ""),
    order,
    stageAgents,
    handoffs,
  };
  return [{ path: ".github/agents/handoffs.json", contents: stableJson(doc) }];
}
