import { ROLE_ADDENDUM_MAX_CHARS, type ToolPosture } from "../schema/index.js";

export { ROLE_ADDENDUM_MAX_CHARS };

/**
 * Repo-specific role addenda are authored by the host agent (see the `tune-roles`
 * skill) and stored in the overlay, then merged into the role body by
 * `applyRoleOverlay`. The compiler stays a pure function of the overlay; the only
 * non-deterministic actor is the agent that writes the overlay text, whose output
 * is a reviewable diff.
 *
 * This module is the *mechanical* half of the addenda contract: the bounds the
 * `tune-roles` skill states in prose are enforced here in code, matching the
 * framework's "gates can't be typo'd off" ethos. The validator is defense in
 * depth, not the sole control — additivity (the base prompt always survives and
 * wins on conflict), human review of the overlay diff, and the smoke gate are the
 * primary safeguards.
 */

/** The fixed, unique heading a merged addendum is fenced under in every host file. */
export const ROLE_ADDENDUM_HEADING = "## Project-specific guidance (generated)";

interface ForbiddenRule {
  pattern: RegExp;
  reason: string;
}

/**
 * Conservative regexes for addenda that try to weaken a non-negotiable gate, the
 * Approved? checkpoint, or the single-writer rule. The verb/noun proximity match
 * keeps these targeted; legitimate, additive guidance does not trip them.
 */
const GATE_RULES: ForbiddenRule[] = [
  {
    pattern: /\b(skip|bypass|disable|ignore|remove|drop|circumvent)\b[\s\S]{0,40}\breview(er)?\b/i,
    reason: "attempts to weaken the review gate",
  },
  {
    pattern: /\b(skip|bypass|disable|ignore|remove|drop|circumvent)\b[\s\S]{0,40}\btests?\b/i,
    reason: "attempts to weaken the tests-must-pass gate",
  },
  {
    pattern:
      /\b(skip|bypass|disable|ignore|override|circumvent|proceed past)\b[\s\S]{0,40}\bapproved\b/i,
    reason: "attempts to weaken the Approved? gate",
  },
  {
    pattern: /\b(skip|bypass|disable|ignore|override|circumvent)\b[\s\S]{0,40}\bgates?\b/i,
    reason: "attempts to weaken a non-negotiable gate",
  },
  {
    pattern:
      /\b(ignore|break|bypass|violate|disable|remove|drop|relax)\b[\s\S]{0,40}\bsingle[-\s]?writer\b/i,
    reason: "attempts to weaken the single-writer rule",
  },
];

/** Phrasings that grant file-write capability — forbidden for non-`write` roles. */
const WRITE_GRANT =
  /\b(you (may|can|are allowed to|should)|feel free to|go ahead and)\b[\s\S]{0,30}\b(write|edit|modify|change|patch|create|delete)\b[\s\S]{0,25}\bfiles?\b/i;

/**
 * Throw if an addendum violates the contract: too long, tries to weaken a gate or
 * the single-writer rule, or grants write to a role whose posture is not `write`.
 * The message names the role and the specific violation so the build failure is
 * actionable.
 */
export function assertRoleAddendumWithinContract(
  roleName: string,
  posture: ToolPosture,
  text: string,
): void {
  if (text.length > ROLE_ADDENDUM_MAX_CHARS) {
    throw new Error(
      `role addendum for '${roleName}' is ${text.length} chars; the contract cap is ${ROLE_ADDENDUM_MAX_CHARS}`,
    );
  }
  for (const rule of GATE_RULES) {
    if (rule.pattern.test(text)) {
      throw new Error(
        `role addendum for '${roleName}' ${rule.reason}; addenda must be additive and may not touch the gates`,
      );
    }
  }
  if (posture !== "write" && WRITE_GRANT.test(text)) {
    throw new Error(
      `role addendum for '${roleName}' grants file-write to a ${posture} role; addenda may not change a role's posture`,
    );
  }
}

/** Append a (already-validated) addendum to a role body under the fenced heading. */
export function appendAddendum(body: string, text: string): string {
  return `${body.trimEnd()}\n\n${ROLE_ADDENDUM_HEADING}\n\n${text.trim()}\n`;
}
