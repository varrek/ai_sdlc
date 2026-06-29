import { type LoopStage, loopStagesForTrack, STAGE_ROLE } from "../../core/loop.js";
import type { NeutralModel } from "../../core/types.js";

/** Native Copilot custom-agent handoff entry (frontmatter `handoffs` array). */
export interface CopilotAgentHandoff {
  label: string;
  agent: string;
  prompt: string;
  send: boolean;
}

const HANDOFF_TO: Partial<Record<LoopStage, { label: string; prompt: string }>> = {
  engineer: {
    label: "Hand off to Engineer",
    prompt: "Implement the plan outlined above.",
  },
  test: {
    label: "Hand off to Tester",
    prompt: "Run the project test suite on this change.",
  },
  reviewer: {
    label: "Hand off to Reviewer",
    prompt: "Review the change for quality, security, and plan adherence.",
  },
  "wrap-up": {
    label: "Start wrap-up",
    prompt: "Open or update the GitLab MR and Jira ticket for this change.",
  },
};

/**
 * The next loop stage after `stage`, or undefined when `stage` is terminal.
 */
function nextStage(stage: LoopStage, order: LoopStage[]): LoopStage | undefined {
  const idx = order.indexOf(stage);
  if (idx < 0 || idx >= order.length - 1) return undefined;
  return order[idx + 1];
}

/**
 * Native handoff frontmatter for a role that participates in the active ceremony
 * track. Returns undefined when the role is outside the loop or is the terminal
 * stage (unless wrap-up follows reviewer on the full track).
 */
export function handoffsForRole(
  roleName: string,
  model: NeutralModel,
): CopilotAgentHandoff[] | undefined {
  const order = loopStagesForTrack(model);
  const stage = order.find((s) => STAGE_ROLE[s] === roleName);
  if (!stage) return undefined;

  const to = nextStage(stage, order);
  if (!to) return undefined;

  const meta = HANDOFF_TO[to];
  if (!meta) return undefined;

  return [
    {
      label: meta.label,
      agent: STAGE_ROLE[to],
      prompt: meta.prompt,
      send: false,
    },
  ];
}
