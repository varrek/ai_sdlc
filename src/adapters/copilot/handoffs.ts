import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { presentLoopRolesForTrack, stableJson } from "../shared/roles.js";

/**
 * Copilot orchestrates via sequential handoffs between custom agents (no
 * parallel subagent dispatch, no IDE gate). We emit an explicit handoff chain
 * for the SDLC loop plus the documented gate fallback, so the degradation is a
 * first-class artifact rather than an implicit gap. The chain honors the
 * overlay's ceremony track (e.g. `quick` drops the Architect stage).
 */
export function emitHandoffs(model: NeutralModel): EmittedFile[] {
  const order = presentLoopRolesForTrack(model);
  if (order.length < 2) return [];

  const handoffs = order.slice(0, -1).map((from, i) => ({ from, to: order[i + 1]! }));
  const doc = {
    version: 1,
    track: model.overlay.defaultTrack ?? "standard",
    note:
      "Copilot IDE has no pre-tool gate hook. The Approved? gate is enforced via " +
      ".github/copilot-instructions.md (checklist) + .github/workflows/sdlc-gate.yml (CI). " +
      "Roles run as sequential handoffs; autonomous wrap-up routes through the Copilot cloud agent.",
    order,
    handoffs,
  };
  return [{ path: ".github/agents/handoffs.json", contents: stableJson(doc) }];
}
