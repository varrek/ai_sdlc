---
date: 2026-06-14
topic: deeper-mining-and-metrics
origin_ideation: docs/ideation/2026-06-14-strategy-aligned-improvements-ideation.md
actors: [A1]
flows: [F1, F2, F3, F4]
acceptance_examples: [AE1, AE2, AE3, AE4, AE5, AE6, AE7]
---

# Requirements - Quality-Depth Setup Hardening

## Summary

Harden the now-built mining, status, explain, and role-personalization loop so setup-readiness reflects useful repo alignment, not just valid emitted files. The scope centers on confidence-gated architecture claims, semantic corpus regression, honest hands-off metrics, and deterministic role grounding before optional LLM-authored addenda.

---

## Problem Frame

The first strategy-aligned pass added the missing surfaces: architecture/convention mining, `aisdlc status`, `aisdlc explain`, freshness-aware setup phases, workspace detection, and quarantined `roleAddenda`. That moved the product from feature absence to quality risk.

The corpus now shows the sharper failure mode: generated config can be schema-valid and evidence-cited while still pointing agents at low-value context. FastAPI can surface tutorial trees such as `docs_src/` as architecture, Vite can overrepresent playground/demo packages, and all corpus overlays can carry `interviewAnswers.test-command`, making the true hands-off setup rate unclear. For a product whose promise is repo-derived agent alignment, a green setup that teaches the Architect the wrong map is worse than an honest gap.

---

## Key Decisions

- **Deterministic path remains primary.** Compile and default setup must stay deterministic; any LLM-assisted role prose remains optional, reviewable, and quarantined in the Overlay.
- **Quality beats breadth for this slice.** Architecture/root confidence and corpus-readiness gates are higher priority than adding new language ecosystems or CI formats.
- **Visibility extends existing commands.** `status`, `explain`, `customize`, and `smoke` absorb readiness and evidence visibility; this work does not introduce `doctor`, `watch`, or a TTY setup flow.
- **Wrong architecture is a reportable failure.** When architecture signals conflict, the system should prefer an explicit low-confidence state over an over-specific standard.

---

## Actors

- A1. **Individual developer** setting up or re-aligning AI agents on a repo and expecting generated context to reflect the real project.

---

## Requirements

**Architecture confidence**

- R1. Architecture mining must classify candidate roots with confidence signals instead of relying on file-count dominance alone.
- R2. Architecture mining must demote tutorial, documentation, fixture, demo, and playground trees unless repo evidence shows they are primary product surfaces.
- R3. When architecture confidence is below the chosen threshold, Customize must emit an explicit low-confidence architecture state rather than a detailed architecture standard.
- R4. High-confidence architecture output must stay bounded enough for agents to use, with overflow details available through evidence or codebase-map surfaces instead of a giant constitution bullet.

**Corpus and readiness**

- R5. The corpus validation flow must exercise `customize -> compile -> smoke -> status` for selected fixtures, not only customize or structural smoke.
- R6. Corpus assertions must include semantic invariants for known repos, including setup-ready state, evidence coverage, architecture root sanity, and absence of known false-positive roots.
- R7. Negative or adversarial fixtures must prove that ambiguous repos fail honestly or surface low-confidence states instead of silently reaching setup-ready.
- R8. Readiness reporting must distinguish structural validity from alignment quality so a repo can be valid-but-needs-attention when mined context is suspect.

**Hands-off and freshness metrics**

- R9. `status` must report a hands-off setup signal that distinguishes miner-closed gaps from human/interview/seeded answers.
- R10. `status` must show the setup chain ledger: mined, overlay-written, compiled, smoke-passed, setup-ready, stale phases, and the next action needed.
- R11. Freshness reporting must explain which phase is stale and why at a user-actionable level, without requiring users to inspect fingerprints.
- R12. Evidence reporting must distinguish cited evidence from useful evidence when citations come only from low-value roots such as tutorials or demos.

**Role grounding**

- R13. Architect must receive deterministic grounding from mined repo facts when those facts are high-confidence.
- R14. Deterministic role grounding must be bounded and additive, preserving hard gates and avoiding contradiction with the Constitution.
- R15. Optional LLM-authored addenda must remain outside the deterministic compile path and must not be required for baseline Architect usefulness.
- R16. Role-personalization status must make generic, deterministically grounded, and LLM-authored role states visible.

---

## Key Flows

- F1. **Confidence-gated customize**
  - **Trigger:** The developer runs Customize on a repo with mixed source, docs, demo, and test fixture directories.
  - **Actors:** A1.
  - **Steps:** Customize mines stack and architecture signals, scores candidate roots, emits high-confidence architecture or an explicit low-confidence state, and records evidence for the decision.
  - **Outcome:** Generated standards avoid misleading architecture claims when the source-root signal is ambiguous.

- F2. **Corpus readiness regression**
  - **Trigger:** A developer or CI run validates ai-sdlc against the selected corpus fixtures.
  - **Actors:** A1.
  - **Steps:** The harness runs the full setup chain, collects status output, and checks semantic invariants for each fixture.
  - **Outcome:** Regressions in architecture quality, setup-ready, evidence coverage, or known portability gaps fail with targeted diagnostics.

- F3. **Status as setup ledger**
  - **Trigger:** The developer runs `aisdlc status` after setup or after repo changes.
  - **Actors:** A1.
  - **Steps:** Status reports phase freshness, setup-ready, hands-off provenance, evidence quality, and the next action.
  - **Outcome:** The developer can tell whether the repo is done, stale, or valid-but-needs-attention from one read-only command.

- F4. **Deterministic Architect grounding**
  - **Trigger:** Compile emits role files for a repo with high-confidence architecture or related mined facts.
  - **Actors:** A1.
  - **Steps:** Compile includes bounded Architect grounding derived from mined facts and reports whether each role is generic, deterministic, or LLM-authored.
  - **Outcome:** Architect receives project-specific guidance even when `tune-roles` has not run.

---

## Acceptance Examples

- AE1. **Covers R1-R4, F1.** Given a FastAPI-like repo where tutorial files outnumber library files, when Customize runs, then architecture mining does not emit a detailed standard rooted only in tutorial directories.
- AE2. **Covers R1-R4, F1.** Given a Vite-like repo with many playground packages and primary product packages, when Customize runs, then playground/demo roots are demoted or scoped so the root architecture summary does not present them as the primary project architecture.
- AE3. **Covers R5-R8, F2.** Given the selected corpus fixtures, when the corpus harness runs, then each fixture completes the full setup chain and reports semantic pass/fail checks beyond structural smoke.
- AE4. **Covers R7, F2.** Given an adversarial fixture with ambiguous roots and no reliable product source signal, when the corpus harness runs, then the fixture fails honestly or reports low architecture confidence instead of producing a confident wrong standard.
- AE5. **Covers R9-R12, F3.** Given a repo whose test command was mined from CI, when `status` runs, then hands-off setup does not count that command as a human interview answer.
- AE6. **Covers R10-R11, F3.** Given a repo whose overlay is current but compiled output is stale, when `status` runs, then it names compile as the stale phase and points to compile as the next action.
- AE7. **Covers R13-R16, F4.** Given a repo with high-confidence architecture facts and no LLM-authored addenda, when compile emits roles, then Architect has deterministic repo grounding and status shows that it is deterministic rather than LLM-authored.

---

## Success Criteria

- Corpus validation catches the known FastAPI/Vite architecture-quality failures that structural smoke previously allowed.
- `status` reports setup-ready, hands-off provenance, phase freshness, and evidence quality without mutating `.sdlc`.
- Architect receives useful deterministic repo grounding when architecture confidence is high.
- Optional LLM addenda remain additive, reviewable, and unnecessary for baseline setup-readiness.
- Re-running setup with unchanged inputs remains a no-op except when confidence or semantic corpus assertions intentionally change.

---

## Scope Boundaries

### In scope

- Confidence-gated architecture mining and bounded architecture output.
- Semantic corpus regression for setup-readiness and architecture quality.
- Hands-off provenance and setup-chain reporting in `status`.
- Deterministic Architect grounding from high-confidence mined facts.

### Deferred to follow-up work

- Behavior-level agent evals that ask an actual agent to choose the right module or test command.
- GitLab and generic CI test-command mining.
- Java, Ruby, Rust, and broader language/framework expansion.
- Full role-addenda pre-seeding for every role beyond the deterministic Architect baseline.
- Workspace-scoped package policy beyond what is needed to prevent root-level architecture noise.

### Out of scope

- New `doctor`, `watch`, `init`, or TTY interview commands.
- LLM execution in the deterministic compile path.
- New host adapters or a single-host default compile mode.
- Rewriting the Base role system or weakening hard gates.

---

## Sources / Research

- `STRATEGY.md` defines the product promise and strategy metrics.
- `docs/ideation/2026-06-14-strategy-aligned-improvements-ideation.md` ranks the updated quality-depth idea cluster.
- `docs/plans/2026-06-14-003-feat-deeper-mining-and-metrics-plan.md` and prior implementation work establish the now-shipped mining/status/explain baseline.
- `docs/plans/2026-06-14-005-feat-llm-authored-role-addenda-plan.md` defines the LLM addenda quarantine model.
- `/tmp/aisdlc-corpus` provides the FastAPI, Vite, and multi-framework validation signals used to sharpen this scope.

---

## Outstanding Questions

- None blocking for planning. The architecture-confidence threshold, corpus fixture list, and exact hands-off provenance schema are planning-owned decisions.
