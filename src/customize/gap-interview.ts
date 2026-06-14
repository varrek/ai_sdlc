import type { RepoProfile } from "./repo-miner.js";

/** A question the interview may ask when mining can't answer it. */
export interface GapQuestion {
  id: string;
  question: string;
}

interface GapDef extends GapQuestion {
  /** True when mining or prior answers already resolve this gap (no prompt). */
  answered(profile: RepoProfile, answers: Record<string, string>): boolean;
}

/**
 * The full gap catalog. Each gap is asked ONLY when neither mining nor prior
 * interview answers resolve it — repo-mine first, interview for the remainder.
 */
const GAPS: GapDef[] = [
  {
    id: "test-command",
    question: "What command runs the test suite?",
    answered: (p, a) => Boolean(p.testRunner) || "test-command" in a,
  },
  {
    id: "gitlab-server",
    question: "Which internal MCP server backs GitLab merge requests? (server id)",
    answered: (_p, a) => "gitlab-server" in a,
  },
  {
    id: "jira-server",
    question: "Which internal MCP server backs Jira? (server id)",
    answered: (_p, a) => "jira-server" in a,
  },
];

/** Return the questions that remain unanswered after mining + prior answers. */
export function computeGaps(
  profile: RepoProfile,
  answers: Record<string, string> = {},
): GapQuestion[] {
  return GAPS.filter((g) => !g.answered(profile, answers)).map((g) => ({
    id: g.id,
    question: g.question,
  }));
}
