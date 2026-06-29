---
name: tune-roles
description: Author repo-specific role guidance from mined evidence, write it to the overlay, then recompile and re-smoke. Default Plugin Mode /customize invokes this automatically when the host model is available.
---

# /tune-roles

Personalize the role agents for *this* repository. You (the host agent) draft a
short **addendum** per role from the mined evidence, write it into the overlay,
then recompile and re-smoke. The compiler merges each addendum into its role body
under a fenced heading, so additions are visible as a normal, reviewable overlay
diff.

This is the first step where the *model* authors config. Your output is overlay
state, not hidden compiled output; users must be able to review what changed.

## Invariants (non-negotiable)

- **Prose cannot hide policy changes.** `roleAddenda` prose adds repo-specific
  guidance. Do not weaken gates, change postures, or expand capabilities in prose;
  those changes require the structured Plugin Mode policy channel. Until that
  channel exists, present them as review notes instead of encoding them in
  `roleAddenda`.
- **Bounded + enforced.** Each addendum is capped (~1500 chars) and checked by the
  addenda contract at compile time. An addendum that trips the contract fails the
  build — fix the text, don't work around it.
- **Reviewable.** The result is an `overlay.roleAddenda` diff a human approves
  before it ships. Never hide generated guidance outside the overlay.

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

If you find yourself writing any of the second list, stop. In Plugin Mode it may
be relevant as a structured policy proposal, but it is not valid role-addendum
prose.

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
- In default Plugin Mode this skill is part of `/customize`; in deterministic mode
  it remains an explicit follow-up when the team wants reviewable role addenda
  without changing the operating mode.
