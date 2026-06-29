import { loopStagesForTrack, STAGE_ROLE } from "../../core/loop.js";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { stableJson } from "../shared/roles.js";

/**
 * Copilot orchestrates via sequential handoffs between custom agents (native
 * `handoffs` frontmatter on each profile, plus this machine-readable chain).
 * Copilot IDE has no pre-tool gate hook, so the Approved? gate degrades to the
 * instruction checklist + CI backstop documented here and in instructions.ts.
 * Wrap-up on the full track routes through the Copilot cloud agent; the chain
 * maps each stage to the performing agent — wrap-up runs as the Engineer (sole
 * holder of gitlab/jira integrations), preserving least-privilege.
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
      "Loop stages use native handoffs in each agent profile's frontmatter; this file " +
      "documents the full chain. Autonomous wrap-up routes through the Copilot cloud agent." +
      (hasWrapUp
        ? " The wrap-up stage runs as the Engineer and requires bound gitlab + jira integrations."
        : ""),
    order,
    stageAgents,
    handoffs,
  };
  return [{ path: ".github/agents/handoffs.json", contents: stableJson(doc) }];
}
