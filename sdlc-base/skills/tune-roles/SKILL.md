---
name: tune-roles
description: Author short, repo-specific addenda to the base role prompts (architect/engineer/tester/reviewer/debugger) from mined evidence, write them to the overlay, then recompile and re-smoke. Use after /customize when the generic role prompts should learn this repo's stack, test command, and risk hot-spots.
---

# /tune-roles

Personalize the role agents for *this* repository. You (the host agent) draft a
short **addendum** per role from the mined evidence, write it into the overlay,
then recompile and re-smoke. The compiler merges each addendum into its role body
under a fenced heading — so the base prompt (and its gate language) always
survives, and your additions are visible as a normal, reviewable overlay diff.

This is the one step where the *model* authors config. Everything downstream stays
deterministic: your output is overlay text, not compiled output.

## Invariants (non-negotiable)

- **Additive only.** Addenda *add* repo-specific guidance. They never restate,
  soften, or override the base prompt, the four gates, or a role's posture. On any
  conflict, the base prompt wins.
- **Bounded + enforced.** Each addendum is capped (~1500 chars) and checked by the
  addenda contract at compile time. An addendum that trips the contract fails the
  build — fix the text, don't work around it.
- **Reviewable.** The result is an `overlay.roleAddenda` diff a human approves
  before it ships. Never auto-apply without that review.

## Contract — what an addendum may and may not contain

**May:** stack/framework idioms ("use Vitest, ESM imports, no CommonJS"), the
repo's real test/run/lint commands and where they live, module boundaries to
respect, and risk hot-spots a role should weight (e.g. for the Reviewer: "the auth
middleware in `src/auth/` is security-sensitive").

**May not** (the compiler will reject these):
- Weaken or skip the **review** gate or the **tests-must-pass** gate.
- Bypass or proceed past the **Approved?** checkpoint.
- Weaken the **single-writer** rule.
- Grant file-write to a non-`write` role (architect/reviewer/tester/debugger).

If you find yourself writing any of the second list, stop — that belongs to the
base constitution, not an overlay addendum.

## Flow

1. **Read the evidence.** Load the mined `RepoProfile` and project-context
   (`.sdlc/overlay/standards-index.yaml`, the codebase map) and the base role
   bodies in `roles/` (or the emitted `*/agents/*`). Ground every guidance line in
   a real repo signal.
2. **Draft one addendum per role**, additive and within the contract above. Cite
   the signal in prose ("repo uses pnpm workspaces → ..."). Keep each short and
   defer to the base prompt. Skip a role if the evidence adds nothing — an empty
   addendum is better than filler.
3. **Write the overlay.** Put each addendum under `roleAddenda.<role>` in
   `.sdlc/overlay/.customize.yaml`. Use only role names that exist in the base.
4. **Compile + smoke.** Run `aisdlc compile …` then `aisdlc smoke …`. A contract
   violation surfaces as a compile error naming the role and the rule it broke.
5. **Review.** Present the `roleAddenda` diff for human approval. Adjust and
   re-run on feedback.

## Notes

- Addenda for a role not present in the resolved model are ignored, so a track that
  drops a role (e.g. quick has no architect) simply won't emit that addendum.
- This skill is opt-in and separate from the deterministic `/customize` chain; run
  it when the generic prompts are leaving repo-specific value on the table.
