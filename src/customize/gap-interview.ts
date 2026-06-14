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
 * The blocking gap catalog: only gaps that must close for a repo to reach
 * "setup-ready". Org-specific integration bindings (GitLab/Jira) are NOT here —
 * they are deferred (see `DEFERRED_INTEGRATIONS`) and surfaced just-in-time when
 * a task actually needs them, so a fresh repo reaches ready with zero hand-edits.
 */
const GAPS: GapDef[] = [
  {
    id: "test-command",
    question: "What command runs the test suite?",
    answered: (p, a) => Boolean(p.testCommand) || "test-command" in a,
  },
];

/**
 * Integration contracts left unbound at setup and surfaced just-in-time as a
 * role/skill precondition when the loop reaches a step that needs them (e.g.
 * wrap-up). Informational only — never blocks readiness.
 */
export const DEFERRED_INTEGRATIONS = ["gitlab", "jira"] as const;

/** Return the blocking questions that remain unanswered after mining + prior answers. */
export function computeGaps(
  profile: RepoProfile,
  answers: Record<string, string> = {},
): GapQuestion[] {
  return GAPS.filter((g) => !g.answered(profile, answers)).map((g) => ({
    id: g.id,
    question: g.question,
  }));
}
