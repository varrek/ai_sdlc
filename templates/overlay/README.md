# `.sdlc/overlay/` — your project's customization layer

This directory is **yours**. The AI SDLC base is consumed pinned (git submodule
or npm package) and is never edited in place. Everything project-specific lives
here so that base upgrades stay clean.

## Files

- `.customize.yaml` — the overlay. Edit this; it is the only hand-edited file.
- `project.lock` — records the pinned base version. Written by `aisdlc upgrade`.

## Workflow

1. `aisdlc customize` mines the repo and fills in `.customize.yaml` (interviewing
   only for gaps it cannot infer).
2. `aisdlc compile` merges base + overlay and emits host-native config.
3. `aisdlc upgrade` re-pins the base to a new version and replays the compile.
   - **No conflicts:** `project.lock` advances; your overlay is untouched.
   - **Conflict** (a base push changes something you overrode): the upgrade
     **blocks**, writes `upgrade-conflicts.yml`, and changes nothing. Resolve
     each listed edge, then re-run. Nothing is ever auto-merged or overwritten.

## What you cannot do here

The non-negotiable gates — review required, tests must pass, the `Approved?`
gate, and least-privilege MCP — are not expressible in the overlay. They are
enforced by the base and apply to every project.
