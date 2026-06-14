---
name: ai-sdlc
last_updated: 2026-06-14
---

# ai-sdlc Strategy

## Target problem

Off-the-shelf AI agents and skills don't fit a real project: they assume the wrong test command, linter, framework, and conventions, so their advice is wrong for the repo. Aligning them by hand costs hours, and even a hand-tuned config drifts out of alignment as the repo changes — with nothing to re-align it.

## Our approach

Derive each agent's config from the repo itself: mine the project's real stack and architecture into an evidence-backed overlay where every standard cites the source file that justifies it — so roles like the Architect carry rules grounded in the actual project. Keep it aligned automatically through freshness and drift detection, making re-alignment a re-run rather than a re-write.

## Who it's for

**Primary:** An individual developer on their own project. They're hiring ai-sdlc to make their AI agents follow *this* repo's stack, architecture, and standards — without hand-writing or babysitting per-tool configs.

## Key metrics

- **Hands-off setup rate** — % of repos that reach `setup-ready` with zero manual overlay edits (mining resolved everything). *Measured from `.sdlc/setup-state.yaml` + blocking-gap count.*
- **Blocking gaps at first run** — count of things mining couldn't resolve and had to ask about; lower means better alignment. *Measured from `customize` output.*
- **Evidence coverage** — % of emitted standards that cite a source file, i.e. the evidence-backed guarantee holding in practice. *Measured from `standards-index.yaml`.*
- **Re-run is a no-op** — after an unrelated repo change, the chain correctly skips via freshness, so staying aligned stays cheap. *Measured from freshness skips in `compile` / `smoke`.*

## Tracks

### Repo mining & evidence

How much of the stack, architecture, and conventions the miner detects, and the source-backing behind every standard.

_Why it serves the approach:_ Alignment is only as good as what we can mine with evidence — this is the root of the bet.

### Freshness & re-alignment

Phase state, fingerprinting, drift reporting, and idempotent re-runs.

_Why it serves the approach:_ Keeps the config aligned as the repo changes — re-run, not re-write — which is what stops drift.

### Setup orchestration & UX

The `/customize` chain, the interview for gaps mining can't resolve, resumable phases, and legible output.

_Why it serves the approach:_ Makes hands-off, evidence-backed setup actually reachable for a solo developer.
