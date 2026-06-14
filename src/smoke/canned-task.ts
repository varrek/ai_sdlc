/**
 * The canonical smoke task: a trivial, additive change (append a comment line)
 * that the Engineer stage applies and the Reviewer stage approves. Trivial on
 * purpose — the smoke validates the generated *config*, not model capability,
 * and must be CI-safe with no live credentials.
 */
export interface TaskOutcome {
  file: string;
  before: string;
  after: string;
  /** Lines added by the change (used by the reviewer to confirm additive-only). */
  addedLines: string[];
}

export const CANNED_FILE = "sdlc_smoke_target.txt";

export function runCannedTask(): TaskOutcome {
  const before = "# SDLC smoke target\n";
  const addedLines = ["# touched by the SDLC smoke Engineer stage"];
  const after = `${before}${addedLines.join("\n")}\n`;
  return { file: CANNED_FILE, before, after, addedLines };
}

/** Reviewer check: the change must be non-empty and additive only (no deletions). */
export function reviewIsApproved(outcome: TaskOutcome): boolean {
  if (outcome.addedLines.length === 0) return false;
  return outcome.after.startsWith(outcome.before);
}
