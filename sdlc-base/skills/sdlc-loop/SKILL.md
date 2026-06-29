---
name: sdlc-loop
description: Run a task through the single-writer Architect -> Engineer -> Reviewer loop with a human Approved? gate, compiled to each host's native dispatch.
disableModelInvocation: true
---

# /sdlc-loop

Drive one task through the role loop. There is **no custom orchestrator** — the
loop compiles to each host's native dispatch (Cursor/Claude subagents, Copilot
handoffs). This skill encodes the discipline that dispatch must honor.

## Invariants (non-negotiable)

- **Single writer.** Only the Engineer modifies files. Architect, Reviewer, and
  Debugger are read-only; the Tester is read-run (it executes tests but never
  writes).
- **Approved? gate.** Nothing leaves the workspace (no MR, no remote push) until a
  human approves. Enforced by a pre-tool hook on Cursor/Claude; by an instruction
  checklist + CI on Copilot's IDE.
- **Fresh-context review.** The Reviewer runs in a clean context with no write
  access, so its verdict is independent of how the change was produced.

## Bounded operating loop

Each role works in short, inspectable cycles: plan the next three to five steps,
act, observe real tool/test/review feedback, then choose exactly one of
`continue`, `replan`, `escalate`, or `done`. Replan at most twice before
escalating with the blocker and evidence. Do not drift into an unbounded
self-reflection loop.

## Flow

1. **Architect (read-only)** turns the task into a bounded plan: scope, non-goals,
   files/interfaces, risks. Returns a compressed summary. → **Approved?**
2. **Engineer (write)** implements strictly to the approved plan and adds/updates
   tests.
3. **Tester (read-run)** runs the suite and probes edge cases, returning a
   pass/fail report with any coverage gaps. On failure it goes back to the
   Engineer; the Tester never writes the fix itself.
4. **Approved? gate** — human checkpoint before review/wrap-up.
5. **Reviewer (fresh, read-only)** approves or requests changes with ordered,
   actionable reasons.
6. On approval, the wrap-up step (see `wrap-up`) opens/updates the GitLab MR and
   updates Jira via least-privilege MCP.

The Tester runs on the Standard and Full tracks; the lean Quick track relies on
the Engineer's own test run. See `track-select` for the per-track stage chain.

If a failure needs investigation, the **Debugger (read-only)** produces a
root-cause + fix approach and hands it back to the Engineer — preserving the
single-writer rule.

## Per-host notes

- **Cursor / Claude Code:** full depth — subagents with enforced postures and a
  hook-based gate.
- **Copilot:** sequential handoffs (`.github/agents/handoffs.json`); the gate
  degrades to the instruction checklist + CI; autonomous wrap-up uses the cloud
  agent. See `portability.gap.yml` and the capability matrix.
