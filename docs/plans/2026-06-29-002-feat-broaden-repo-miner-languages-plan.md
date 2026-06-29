---
title: "feat: Broaden repo miner language and toolchain support"
type: feat
status: active
date: 2026-06-29
origin: docs/brainstorms/2026-06-14-deeper-mining-and-metrics-requirements.md (deferred follow-up)
---

# feat: Broaden repo miner language and toolchain support

## Summary

Extend `src/customize/repo-miner.ts` with evidence-backed detection for Rust/Cargo, Java/Kotlin (Maven/Gradle), Ruby/Bundler/Rails, .NET, and richer Go defaults. Every claim records manifest or config paths; bare `tests/` directories alone never infer a runner.

---

## Problem Frame

The miner first-class supports Python, TypeScript, JavaScript, and Go file extensions. `Cargo.toml` is listed as a known manifest but Rust is not mined. Test-runner defaults cover pytest/vitest/jest only; CI parsing recognizes `go test` but Go lacks a runner default. Java, Ruby, and .NET were explicitly deferred in the deeper-mining plan.

---

## Requirements

| ID | Requirement | Verification |
|----|-------------|--------------|
| R1 | Rust: assert `rust` language and `cargo` package manager from `Cargo.toml`; detect `clippy`/`rustfmt` linters from manifest or config files. | Fixture + unit test |
| R2 | Rust: assert `cargo test` runner only on explicit signals (`[[test]]`, integration tests under `tests/*.rs`, CI/Makefile, or dev-deps naming common test crates). | Fixture + negative test (bare tests dir) |
| R3 | Java/Kotlin: assert from `pom.xml` / Gradle manifests; detect Spring Boot from runtime deps; `mvn test` / `./gradlew test` commands when evidenced. | Fixtures |
| R4 | Ruby: assert from `Gemfile`; detect Rails from runtime gem; `rspec`/`minitest` runner from Gemfile or CI; never from bare `test/` dir. | Fixtures |
| R5 | .NET: assert from `.csproj`/`.sln`; `dotnet test` from CI/Makefile or test SDK reference in project file. | Fixtures |
| R6 | Go: default `go test ./...` when `go test` runner is evidenced via `_test.go`, CI, Makefile, or golangci-lint config. | Fixture + test |
| R7 | Extend `TEST_TOOL`, `commandEcosystem`, and `runnerDefaultCommand` for new runners without breaking existing Python/JS heuristics. | Existing + new tests |
| R8 | Add workspace package manifests (`pom.xml`, `build.gradle.kts`, `Gemfile`, `*.csproj`) where applicable. | Monorepo scan unchanged |

---

## Key Technical Decisions

- **Same fall-open contract as pytest:** a `tests/` directory without toolchain-specific evidence leaves `testCommand` undefined.
- **Manifest asserts language regardless of file count** (existing rule for Python/JS).
- **Gradle wrapper:** prefer `./gradlew test` only when `gradlew` exists; otherwise `gradle test` from CI only.
- **Kotlin:** classified as `kotlin` when `.kt`/`.kts` files meet share threshold or Gradle Kotlin plugin is declared; Java remains primary for pure Java Maven repos.
- **Ecosystem gating:** extend `commandEcosystem` with `rust`, `jvm`, `ruby`, `dotnet` shares using the existing 15% primary floor.

---

## Implementation Steps

1. Extension map: `.rs`, `.java`, `.kt`, `.kts`, `.rb`, `.cs`, `.fs`, `.vb`.
2. Expand `KNOWN_MANIFESTS`, `PACKAGE_MANIFESTS`.
3. Per-ecosystem mining blocks (mirroring Python/JS structure).
4. Update test-command resolution helpers.
5. Sample-repo fixtures under `tests/fixtures/sample-repos/`.
6. Focused tests in `tests/customize/customize.test.ts` (language mining section).

---

## Out of Scope

- GitLab/CircleCI-specific parsers beyond existing YAML step scan.
- Inferring frameworks from comments or README.
- Behavior-level agent evals.
