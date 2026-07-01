---
title: "fix: Fresh TECH_DEBT_AUDIT pass after PR #31"
type: fix
date: 2026-06-30
---

# fix: Fresh TECH_DEBT_AUDIT pass after PR #31

## Summary

PR #31 merged the first remediation wave. This pass re-runs the audit on latest
`main`, closes remaining actionable findings (not quick-wins only), and updates
README and eval docs to match current behavior.

---

## Requirements

- R1. Move `accepted-learnings-sync` out of `core` into `customize` (F025).
- R2. Share fail-closed MCP policy loading across Cursor, Codex, and Kiro (F022 extension).
- R3. Cache mined profiles by inventory fingerprint; add `aisdlc status --refresh` (F013/F014).
- R4. Export and test `classifySetupFailure` branches (F035).
- R5. Begin `repo-miner` modularization with `miner-walk.ts` (F001 partial).
- R6. Document eval framework ownership and external bench advanced controls (F037/F045).
- R7. Refresh `TECH_DEBT_AUDIT.md` with RESOLVED/OPEN/NEW tags from tooling evidence.
- R8. Update README command surface (`status`, `record-event`, `--refresh`).

---

## Scope Boundaries

### In Scope

F001 partial, F013–F014, F025, F035, F037, F044–F045, Codex/Kiro MCP fail-closed, README/docs.

### Deferred

F016 CLI router split, F038 golden snapshot split, F039/F040 breaking dependency majors, full F001 orchestration split.

---

## Verification

- `npm run typecheck`
- `npm test`
- `npm run check`
- Golden snapshot update only if gate script output changed intentionally
