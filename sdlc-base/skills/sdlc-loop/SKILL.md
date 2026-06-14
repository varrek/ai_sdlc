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
  Debugger are read-only.
- **Approved? gate.** Nothing leaves the workspace (no MR, no remote push) until a
  human approves. Enforced by a pre-tool hook on Cursor/Claude; by an instruction
  checklist + CI on Copilot's IDE.
- **Fresh-context review.** The Reviewer runs in a clean context with no write
  access, so its verdict is independent of how the change was produced.

## Flow

1. **Architect (read-only)** turns the task into a bounded plan: scope, non-goals,
   files/interfaces, risks. Returns a compressed summary. → **Approved?**
2. **Engineer (write)** implements strictly to the approved plan, adds/updates
   tests, and runs them green.
3. **Approved? gate** — human checkpoint before review/wrap-up.
4. **Reviewer (fresh, read-only)** approves or requests changes with reasons.
5. On approval, the wrap-up step (see `wrap-up`) opens/updates the GitLab MR and
   updates Jira via least-privilege MCP.

If a failure needs investigation, the **Debugger (read-only)** produces a
root-cause + fix approach and hands it back to the Engineer — preserving the
single-writer rule.

## Per-host notes

- **Cursor / Claude Code:** full depth — subagents with enforced postures and a
  hook-based gate.
- **Copilot:** sequential handoffs (`.github/agents/handoffs.json`); the gate
  degrades to the instruction checklist + CI; autonomous wrap-up uses the cloud
  agent. See `portability.gap.yml` and the capability matrix.
