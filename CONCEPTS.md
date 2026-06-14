# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Compilation pipeline

### Base
The host-neutral, company-shared source of SDLC capabilities — the Constitution, roles, skills, and integration contracts — that every project starts from before any project-specific customization.

### Constitution
The Base's governing document: the non-negotiable gates that always hold (review required, tests pass, the Approved? Gate, least-privilege MCP) plus the configurable edges an Overlay is allowed to tune.

### Overlay
The project-specific layer that edits only the configurable edges of the Base — added standards, Integration Bindings, role-model overrides, and the chosen Ceremony Track. It is merged onto the Base to produce the Neutral Model and can never weaken a hard gate.

### Neutral Model
The fully resolved, host-agnostic model produced by merging an Overlay onto the Base. It is the single source of truth every Adapter reads, and nothing else.

### Adapter
A pluggable, per-Host emitter that turns the Neutral Model into one Host's native configuration. Adapters are pure: they return files and capability gaps and never write to disk themselves.

### Host
A target agent environment the framework compiles to (an IDE or agent runtime). Hosts differ in capability, so an Adapter declares honest degradation where its Host cannot satisfy a capability.

## Customize

### Customize
The process that adapts the Base to a specific repository: it mines the repo for evidence, interviews the user for what mining cannot resolve, and emits the project Overlay.

### Standards Index
The evidence-backed list of project standards derived by mining the repository, each statement linked to the source files that justify it. It is the machine-owned, regenerated part of Customize output — distinct from the user-owned edges of the Overlay.

### Drift
The reviewable delta between a freshly mined Standards Index and the prior one on a re-run — what was added or removed, surfaced rather than silently rewritten.

### Interview Gap
A question Customize must ask because neither repo mining nor prior answers resolve it — for example, which MCP server backs a given integration.

### Ceremony Track
The level of process formality chosen for a project — Quick (the minimal single-writer slice), Standard (adds up-front planning), or Full (adds the integration wrap-up) — which selects how many loop stages run.

### Integration Binding
The Overlay entry that binds a host-neutral integration contract to a concrete MCP server and scopes which roles may reach it (least-privilege).

## Process gates

### Approved? Gate
The human-in-the-loop checkpoint that must pass before mutating actions or shipping. It is enforced natively where a Host supports pre-tool hooks and degraded to an instruction checklist plus CI where it is not.
