# Residual Review Findings

Source: LFG ce-code-review pass for `docs/plans/2026-06-30-002-feat-kiro-host-adapter-plan.md` on branch `feat/add-kiro-provider`.

Tracker filing was unavailable in this session: `gh auth status` and `rtk gh auth status` both reported an invalid GitHub token, and no open PR could be inspected. These items are recorded here as the durable no-sink fallback.

## Residual Review Findings

- P2 `src/adapters/kiro/gates.ts:89` - Kiro posture rules remain duplicated between `kiroToolsForPosture()` and the generated `tool-gate.mjs` `allowed()` switch. Defer reason: eliminating this cleanly requires changing the emitted role-policy artifact shape or generating hook code from a shared posture table, which is a broader generated-contract change than a mechanical review fix.
- P2 `src/adapters/kiro/agents.ts:12` - Kiro custom role subagents do not bind workspace skills through `resources` / `skill://` entries. Defer reason: Kiro's IDE subagent frontmatter support differs from the CLI skill-resource guidance and needs host validation before emitting unsupported metadata.
- P2 `src/adapters/kiro/gates.ts:27` - Role identity aliases in Kiro hook payload parsing still need live Kiro fixture validation. Defer reason: this branch now documents partial enforcement and tests `SDLC_ACTIVE_ROLE`, but pruning or changing alias precedence should wait for captured Kiro IDE/CLI payloads.
