# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Compilation pipeline

### Base
The shared source of SDLC capabilities — the Constitution, roles, skills, and integration contracts — that every project starts from before any project-specific customization. In Plugin Mode it is a baseline for LLM-personalized policy, not the final authority on every workflow choice.

### Constitution
The Base's governing document: the default gates and workflow posture a project starts from, plus the configurable edges an Overlay is allowed to tune. In deterministic mode its hard gates are non-negotiable; in Plugin Mode, accepted LLM-personalized policy may adapt them when project context justifies the change.

### Overlay
The project-specific layer that records accepted customization — standards, Integration Bindings, role-model overrides, Ceremony Track, role guidance, and Plugin Mode policy changes. In deterministic mode it cannot weaken hard gates; in Plugin Mode it can carry accepted Project-Adaptable Workflow Policy.

### Neutral Model
The resolved model produced from the Base plus accepted project customization. In deterministic mode it is produced by a pure merge; in Plugin Mode it may include accepted host-LLM personalization before Adapters emit host-native config.

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

### Setup-ready
The state where a target repo has closed blocking Interview Gaps, compiled host-native config, and passed the smoke gate. It is stronger than Customize being ready because emitted files and validation must also be current.

### Hands-off Setup
A setup run that reaches setup-ready without requiring human-owned Overlay answers or edits for blocking setup concerns. Miner-closed gaps count as hands-off; interview answers and manual overlay edits do not.

### Corpus
The representative set of target repositories used to validate ai-sdlc mining, compile, smoke, and status behavior across real project shapes. Corpus checks are regression signals for setup quality, not product source code.

### Plugin Mode
The ai-sdlc operating mode where a supported coding tool supplies the host LLM and interaction surface. In this mode, model invocation is an expected customization capability rather than an optional follow-up.

### LLM-Personalized Setup
A setup run where `/customize` and compile use the host LLM to generate project-specific role guidance or workflow policy, and setup readiness depends on the generated personalization being accepted.

### Project-Adaptable Workflow Policy
The generated, project-specific treatment of gates, role postures, and review flow. Unlike the Base's original hard gates, these policies may change when repo evidence or project intent justifies the change.

### Behavior-Level Eval
An evaluation that checks whether generated guidance changes an agent's decisions on pinned tasks, such as choosing the right module, test command, risk surface, or review flow. It sits above structural compile and smoke checks.

### Loop Trace
A structured record of an SDLC role-loop run or synthetic run: stage handoffs, tool attempts, test results, approval gates, review verdicts, replans, and terminal status. In the first implementation it is an offline eval artifact, not a custom runtime orchestrator.

### Loop-Quality Score
A deterministic score over a Loop Trace that checks role ownership, stage order, approval-gate placement, tester-before-reviewer sequencing, retry budget, and terminal status. It makes loop compliance visible without calling a host LLM.

### Accepted Learning Ledger
A derived, typed record of setup facts the project has accepted — test-command corrections, demoted architecture roots, and newly mined standards — stored under `.sdlc/memory/` and surfaced in status and role guidance. It is evidence-linked and reviewable, not free-form chat memory.

### Ceremony Track
The level of process formality chosen for a project — Quick (the minimal single-writer slice), Standard (adds up-front planning), or Full (adds the integration wrap-up) — which selects how many loop stages run.

### Integration Binding
The Overlay entry that binds a host-neutral integration contract to a concrete MCP server and scopes which roles may reach it (least-privilege).

## Process gates

### Approved? Gate
The human-in-the-loop checkpoint that must pass before mutating actions or shipping. It is enforced natively where a Host supports pre-tool hooks and degraded to an instruction checklist plus CI where it is not.
