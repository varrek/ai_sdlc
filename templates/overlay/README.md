# `.sdlc/overlay/` — your project's customization layer

This directory is **yours**. The AI SDLC base is consumed pinned (git submodule
or npm package) and is never edited in place. Everything project-specific lives
here so that base upgrades stay clean.

## Files

- `.customize.yaml` — the overlay. Edit this; it is the only hand-edited file.
  New overlays default to `operatingMode: plugin`; set
  `operatingMode: deterministic` only to opt out of host-LLM personalization.
- `project.lock` — records the pinned base version. Written by `aisdlc upgrade`.

## Workflow

1. `aisdlc customize` mines the repo, fills in `.customize.yaml`, and in default
   Plugin Mode asks the host model to draft reviewable role guidance.
2. `aisdlc compile` merges base + accepted overlay state and emits host-native
   config.
3. `aisdlc upgrade` re-pins the base to a new version and replays the compile.
   - **No conflicts:** `project.lock` advances; your overlay is untouched.
   - **Conflict** (a base push changes something you overrode): the upgrade
     **blocks**, writes `upgrade-conflicts.yml`, and changes nothing. Resolve
     each listed edge, then re-run. Nothing is ever auto-merged or overwritten.

## What you cannot do here

Do not encode hidden gate, posture, or capability changes in prose role guidance.
Plugin Mode policy changes must use a structured, reviewable policy channel; until
that channel exists, keep them as review notes rather than overlay behavior.
