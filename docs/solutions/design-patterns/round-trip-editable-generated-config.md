---
title: "Round-trip user-editable generated config (read-merge-write)"
date: 2026-06-14
category: design-patterns
module: customize / overlay compiler
problem_type: design_pattern
component: tooling
severity: high
tags:
  - customize
  - overlay
  - round-trip
  - read-merge-write
  - cli
  - codegen
  - interview-gaps
  - silent-data-loss
applies_when:
  - "A CLI or generator emits a file users are told to hand-edit, then re-run the same command"
  - "An artifact mixes machine-derived fields with user-owned fields (bindings, overrides, answers)"
  - "A later command in a pipeline consumes an artifact an earlier command wrote"
symptoms:
  - "Re-running the generator discards hand-edits (integrations, roleModels, defaultTrack, interviewAnswers)"
  - "The ready gate never flips true after the user fills in answers in the artifact file"
  - "Downstream compile/smoke runs against an empty overlay unless --overlay is passed explicitly"
---

# Round-trip user-editable generated config (read-merge-write)

## Context

The `/customize` command mines a repository and emits `.sdlc/overlay/.customize.yaml` — a
project overlay that is **machine-generated** but also **hand-editable**. The CLI explicitly
tells the user to fill in unresolved interview gaps in that file and re-run:

> Answer these in `.sdlc/overlay/.customize.yaml`, then re-run.

That documented loop could not converge. `runCustomize` rebuilt the overlay from scratch on
every invocation, ignoring whatever was already on disk. A user who hand-added an
`integrations.jira` binding or set `roleModels.engineer: opus` lost those edits the instant
they re-ran `/customize`; the interview gaps reopened and `ready` never flipped to `true`. A
second instance of the same mistake: `compile` and `smoke` defaulted to an **empty** overlay
unless `--overlay` was passed, so a normal `customize → compile` flow silently dropped the
project's standards, integrations, and track.

The root cause is a category error: a file that is **both** generated **and** user-editable was
treated as write-only (regenerate-from-source) instead of round-tripping (load prior → preserve
user-owned fields → re-emit derived fields).

## Guidance

For any artifact that is generated **and** hand-editable, regeneration must be a
**read-merge-write round-trip**:

1. **Load** the prior artifact if it exists.
2. **Preserve** user-owned fields (answers, bindings, overrides, choices).
3. **Regenerate** only derived/mined fields.
4. **Report drift** on the derived part instead of silently rewriting it.
5. **Auto-discover** the canonical artifact in downstream consumers — never default to empty.

Make field ownership explicit. For `.customize.yaml`:

| Field | Owner | On re-run |
|---|---|---|
| `standards` | Mined from repo | Always regenerated; drift reported via `diffStandardsIndex` |
| `interviewAnswers` | User / prior run | Seeded from prior, then merged with explicit answers |
| `integrations` | User / prior run | Copied from prior; synthesized from an answer only when absent |
| `roleModels` | User / prior run | Copied from prior |
| `defaultTrack` | User / prior run | Prior wins; the mining suggestion is fallback only |

### Before — regenerate from scratch (the bug)

```typescript
// src/cli/customize.ts (before) — no prior load; the artifact on disk is ignored
const overlay = buildOverlay(profile, options.answers ?? {});

// src/customize/emitters.ts (before) — every field rebuilt from scratch
export function buildOverlay(profile: RepoProfile, answers: Record<string, string> = {}): Overlay {
  const integrations: Record<string, IntegrationBinding> = {};
  if (answers["jira-server"]) integrations.jira = { serverId: answers["jira-server"], allowedRoles: [] };
  // ...same for other integrations
  return Overlay.parse({
    version: 1,
    defaultTrack: suggestTrack(profile),  // always re-suggested
    standards: buildStandardsIndex(profile).standards.map((s) => s.statement),
    integrations,                         // empty unless this run supplied answers
    roleModels: {},                       // always wiped
    interviewAnswers: answers,            // prior answers discarded
  });
}
```

### After — prior-aware round-trip

```typescript
// src/cli/customize.ts — load prior, then merge answers
const priorOverlay = existsSync(overlayPath) ? loadOverlay(overlayPath) : undefined;
const answers = mergeAnswers(priorOverlay, options.answers ?? {});
const overlay = buildOverlay(profile, answers, priorOverlay);

// Precedence (low → high): derived-from-existing-binding → prior interviewAnswers → explicit answers
function mergeAnswers(prior: Overlay | undefined, explicit: Record<string, string>): Record<string, string> {
  const answers: Record<string, string> = { ...(prior?.interviewAnswers ?? {}) };
  for (const [id, binding] of Object.entries(prior?.integrations ?? {})) {
    const key = `${id}-server`;
    if (!(key in answers)) answers[key] = binding.serverId; // a hand-added binding also closes the gap
  }
  return { ...answers, ...explicit };
}
```

The `${id}-server` key derivation is project-specific. The transferable idea is "derive
answers from durable user edits so a hand-edit closes the same gap an interview answer would" —
not this exact key shape.

```typescript
// src/customize/emitters.ts (after) — preserve user-owned edges
export function buildOverlay(profile: RepoProfile, answers: Record<string, string> = {}, prior?: Overlay): Overlay {
  const integrations: Record<string, IntegrationBinding> = { ...(prior?.integrations ?? {}) };
  // synthesize from this run's answer only when the user has not already provided a binding
  if (answers["jira-server"] && !integrations.jira) integrations.jira = { serverId: answers["jira-server"], allowedRoles: [] };
  // ...same for other integrations
  return Overlay.parse({
    version: 1,
    defaultTrack: prior?.defaultTrack ?? suggestTrack(profile),
    standards: buildStandardsIndex(profile).standards.map((s) => s.statement),
    integrations,                              // prior bindings preserved
    roleModels: prior?.roleModels ?? {},       // prior overrides preserved
    interviewAnswers: answers,
  });
}
```

```typescript
// src/cli/index.ts — downstream auto-discovery
const DEFAULT_OVERLAY = join(".sdlc", "overlay", ".customize.yaml");
function resolveOverlay(explicit: string | undefined): string | undefined {
  if (explicit) return explicit;            // an explicit --overlay always wins
  return existsSync(DEFAULT_OVERLAY) ? DEFAULT_OVERLAY : undefined;
}
// compile + smoke now call: overlayPath: resolveOverlay(options.get("overlay"))
```

## Why This Matters

- **Convergence.** An "edit the file, then re-run" UX only works if re-running reads what the
  user wrote. Without round-tripping, the `ready` gate is permanently unreachable after any
  hand-edit — the tool keeps asking the same questions while deleting the answers.
- **No silent data loss.** Integration bindings and role-model overrides are high-value,
  low-frequency edits. Wiping them on every re-run makes the artifact feel like a throwaway
  scaffold rather than durable project config, and erodes trust in the tool.
- **The trap.** "Regenerate from source" is correct for lockfiles or `.gitignore`, and wrong
  for any file the docs tell users to tweak. When the source includes a human edit surface, the
  mental model must be **merge**, not **replace**.
- **End-to-end consistency.** A perfect customize round-trip is still useless if `compile` and
  `smoke` ignore the artifact. Canonical-path auto-discovery closes the loop so the pipeline
  works without users memorizing `--overlay`.

## When to Apply

- Codegen / scaffolding that emits config a human then tweaks (e.g. Terraform `tfvars`,
  Kubernetes overlays, editor rule files).
- Compilers with overlays where a base template is merged with project-specific deltas.
- Any "edit the generated file and re-run" UX — if the docs say "edit X and re-run", the tool
  must load X first.
- Interview / wizard flows that emit partial state — later runs must seed from prior answers.
- Multi-command pipelines where one command writes an artifact a later one consumes — define
  and auto-resolve the canonical path.

Do **not** apply to truly ephemeral outputs (build caches, temp files) or files where
regeneration is intentionally destructive (formatters rewriting source).

## Examples

**A hand-edited binding survives the re-run.** A user runs `/customize`, hand-adds
`integrations.jira` with `serverId: jira-mcp`, and sets `roleModels.engineer: opus`. Before the
fix, the next `/customize` rebuilt from scratch — both edits gone, `ready: false`. After the
fix, `mergeAnswers` derives the `jira-server` answer from the existing binding, `buildOverlay`
copies the prior `integrations` and `roleModels`, the gap closes, and `ready: true`. (Regression
test: *"preserves prior overlay edits on re-run and closes the gap from them"* in
`tests/customize/customize.test.ts`.)

**Derived fields still refresh.** User-owned fields are preserved, but mined `standards` are
always regenerated. If the repo changes between runs, `diffStandardsIndex` reports
`drift.changed: true` with added/removed counts — a reviewable delta, not a silent rewrite.

**Compile picks up the overlay automatically.** After the fix, `aisdlc compile --out .`
following an `aisdlc customize` prints `Using project overlay .sdlc/overlay/.customize.yaml.` and
includes the standards, integrations, and track without an explicit `--overlay`.

## Related

- `docs/ideation/2026-06-14-setup-customize-command-ideation.md` — idea #4 named this exact
  failure mode. This learning covers the read-merge-write round-trip fix; the fuller
  `--dry-run` / `--apply` preview-before-write split proposed there is still **deferred**.
- `docs/plans/2026-06-14-001-feat-internal-ai-sdlc-framework-plan.md` — U5 (overlay never
  overwritten by base upgrade) and U6 (drift-aware `/customize` re-run).
- `templates/overlay/README.md` and `sdlc-base/skills/customize/SKILL.md` — the user-facing
  "edit `.customize.yaml`, then re-run" contract this pattern makes safe.
- Implementation: `src/cli/customize.ts` (`runCustomize`, `mergeAnswers`),
  `src/customize/emitters.ts` (`buildOverlay(..., prior?)`), `src/cli/index.ts` (`resolveOverlay`).
