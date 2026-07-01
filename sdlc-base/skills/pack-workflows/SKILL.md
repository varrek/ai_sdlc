---
name: pack-workflows
description: Apply optional reference-pack workflow skills when packs are enabled — use pack-local SKILL.md files for stack-specific ceremony.
---

# /pack-workflows

When compile enables reference packs (`--packs`), additional skills ship under
each pack (for example `packs/data-ml/skills/…`). This skill routes you to the
right pack workflow without bloating the portable base.

## Invariants

- **Pack skills are optional.** Base skills (`customize`, `sdlc-loop`) stay
  host-neutral.
- **Read `docs/packs.md`.** Match detected stack signals to attached packs.
- **Verify.** Pack usage should appear in compiled `.cursor/skills/` (or host
  equivalent) after compile.

## Flow

1. Read `.sdlc/maintenance-report.json` for enabled pack paths.
2. Open the pack's `skills/*/SKILL.md` relevant to the task (security, mobile,
   data-ml, etc.).
3. Follow the pack skill, then re-run `aisdlc maintain` if setup changed.
