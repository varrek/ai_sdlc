import { expect } from "vitest";
import { architectPrimaryGuidance, type SetupArtifacts } from "./corpus-harness.js";

export interface PackageExpectation {
  path: string;
  testCommand?: string;
}

export interface CorpusExpectation {
  fixture: string;
  description: string;
  setupReady: boolean;
  alignmentReady: boolean;
  architectureConfidence?: "high" | "low";
  validButNeedsAttention?: boolean;
  blockingGaps: number;
  handsOff?: boolean;
  testCommand?: string;
  testCommandProvenance?: "miner" | "ci" | "interview" | "unknown";
  mapPaths?: string[];
  mapMustNotInclude?: string[];
  packageExpectations?: PackageExpectation[];
  workspacePackageCount?: number;
  architectHasGrounding?: boolean;
  testerHasGrounding?: boolean;
  architectMustInclude?: string[];
  architectMustNotInclude?: string[];
  testerMustInclude?: string[];
  testerMustNotInclude?: string[];
  constitutionMustInclude?: string[];
  constitutionMustNotInclude?: string[];
  standardsMustInclude?: string[];
  standardsMustNotInclude?: string[];
}

export const CORPUS_EXPECTATIONS: CorpusExpectation[] = [
  {
    fixture: "python-rags",
    description: "Python app with Makefile/pyproject test mining and high-confidence src map",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "pytest",
    testCommandProvenance: "miner",
    mapPaths: ["src"],
    architectHasGrounding: true,
    testerHasGrounding: true,
    architectMustInclude: ["src"],
    testerMustInclude: ["pytest", "provenance: miner"],
    constitutionMustInclude: ["pytest", "src"],
    standardsMustInclude: ["pytest", "Project architecture"],
  },
  {
    fixture: "ts-app",
    description: "TypeScript app with package.json test script and src map",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "vitest run",
    testCommandProvenance: "miner",
    mapPaths: ["src"],
    architectHasGrounding: true,
    testerHasGrounding: true,
    architectMustInclude: ["src"],
    testerMustInclude: ["vitest run", "provenance: miner"],
    constitutionMustInclude: ["vitest run"],
    standardsMustInclude: ["vitest run"],
  },
  {
    fixture: "ts-playwright-e2e",
    description: "TypeScript app with vitest unit tests and evidenced Playwright E2E",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "vitest run",
    testCommandProvenance: "miner",
    mapPaths: ["src"],
    architectHasGrounding: true,
    architectMustInclude: ["src"],
    constitutionMustInclude: ["vitest run", "playwright"],
    standardsMustInclude: ["vitest run", "playwright", "playwright test"],
  },
  {
    fixture: "monorepo",
    description: "Workspace repo with per-package test commands but open root test-command gap",
    setupReady: false,
    alignmentReady: false,
    architectureConfidence: "high",
    blockingGaps: 1,
    handsOff: false,
    mapPaths: ["packages/api", "packages/web"],
    workspacePackageCount: 2,
    packageExpectations: [
      { path: "packages/api", testCommand: "pytest" },
      { path: "packages/web", testCommand: "vitest run" },
    ],
    architectHasGrounding: true,
    testerHasGrounding: true,
    architectMustInclude: ["packages/api", "pytest", "packages/web", "vitest run"],
    testerMustInclude: ["packages/api", "pytest", "packages/web", "vitest run"],
    standardsMustInclude: ["packages/api", "packages/web", "pytest", "vitest run"],
  },
  {
    fixture: "ci-repo",
    description: "CI-mined npm test with low-confidence architecture (demoted .github root)",
    setupReady: true,
    alignmentReady: false,
    architectureConfidence: "low",
    validButNeedsAttention: true,
    blockingGaps: 0,
    handsOff: true,
    testCommand: "npm test",
    testCommandProvenance: "ci",
    mapPaths: [],
    architectHasGrounding: false,
    testerHasGrounding: true,
    testerMustInclude: ["npm test", "provenance: ci"],
    constitutionMustInclude: ["npm test"],
    standardsMustInclude: ["npm test", "confidence is low"],
    standardsMustNotInclude: ["Project architecture: modules"],
  },
  {
    fixture: "streamlit-venv",
    description: "Thin Python app without test signal keeps test-command gap open",
    setupReady: false,
    alignmentReady: false,
    blockingGaps: 1,
    handsOff: false,
    mapPaths: [],
    architectHasGrounding: false,
    testerHasGrounding: false,
    testerMustNotInclude: ["## Deterministic project grounding"],
    standardsMustInclude: ["streamlit"],
  },
  {
    fixture: "thin-poc",
    description: "Minimal POC without manifests or tests stays not setup-ready",
    setupReady: false,
    alignmentReady: false,
    blockingGaps: 1,
    handsOff: false,
    mapPaths: [],
    architectHasGrounding: false,
    testerHasGrounding: false,
    testerMustNotInclude: ["## Deterministic project grounding"],
  },
  {
    fixture: "fastapi-like",
    description: "FastAPI tutorial docs stay out of confident architecture surfaces",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "pytest",
    testCommandProvenance: "miner",
    mapMustNotInclude: ["docs_src"],
    architectHasGrounding: true,
    testerHasGrounding: true,
    architectMustInclude: ["fastapi"],
    testerMustInclude: ["pytest"],
    architectMustNotInclude: ["docs_src"],
    constitutionMustNotInclude: ["docs_src"],
  },
  {
    fixture: "vite-like",
    description: "Vite playground packages stay out of primary map context",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "vitest run",
    testCommandProvenance: "miner",
    mapPaths: ["packages/vite"],
    architectHasGrounding: true,
    testerHasGrounding: true,
    architectMustInclude: ["packages/vite"],
    testerMustInclude: ["vitest run"],
    constitutionMustNotInclude: ["playground"],
  },
  {
    fixture: "ambiguous-architecture",
    description: "Ambiguous roots surface low-confidence architecture instead of a wrong map",
    setupReady: false,
    alignmentReady: false,
    architectureConfidence: "low",
    validButNeedsAttention: true,
    blockingGaps: 1,
    handsOff: false,
    mapPaths: [],
    architectHasGrounding: false,
    testerHasGrounding: false,
    standardsMustInclude: ["confidence is low"],
    standardsMustNotInclude: ["Project architecture: modules"],
    architectMustNotInclude: ["## Deterministic project grounding"],
    testerMustNotInclude: ["## Deterministic project grounding"],
  },
  {
    fixture: "go-app",
    description: "Go module with go test evidence and golangci-lint is setup-ready with miner provenance",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "go test ./...",
    testCommandProvenance: "miner",
    mapPaths: ["internal", "pkg"],
    architectHasGrounding: true,
    architectMustInclude: ["internal", "pkg"],
    constitutionMustInclude: ["go test", "internal", "pkg"],
    standardsMustInclude: ["go test", "golangci-lint", "Project architecture"],
  },
  {
    fixture: "rust-cargo",
    description: "Rust/Cargo with integration tests, axum, and high-confidence src map",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "cargo test",
    testCommandProvenance: "miner",
    mapPaths: ["src"],
    architectHasGrounding: true,
    architectMustInclude: ["src"],
    constitutionMustInclude: ["cargo test"],
    standardsMustInclude: ["cargo test", "axum", "Project architecture"],
  },
  {
    fixture: "java-maven",
    description: "Java/Maven with spring-boot and mvn test default",
    setupReady: true,
    alignmentReady: true,
    architectureConfidence: "high",
    blockingGaps: 0,
    handsOff: true,
    testCommand: "mvn test",
    testCommandProvenance: "miner",
    mapPaths: ["src/main/java/com/example/owner", "src/main/java/com/example/vet"],
    architectHasGrounding: true,
    architectMustInclude: ["src/main/java/com/example/owner", "src/main/java/com/example/vet"],
    constitutionMustInclude: ["mvn test", "src/main/java/com/example/owner"],
    standardsMustInclude: ["mvn test", "spring-boot", "Project architecture"],
  },
  {
    fixture: "kotlin-gradle",
    description: "Kotlin/Gradle with gradlew test but low-confidence architecture",
    setupReady: true,
    alignmentReady: false,
    architectureConfidence: "low",
    validButNeedsAttention: true,
    blockingGaps: 0,
    handsOff: true,
    testCommand: "./gradlew test",
    testCommandProvenance: "miner",
    mapPaths: [],
    architectHasGrounding: false,
    constitutionMustInclude: ["./gradlew test"],
    standardsMustInclude: ["./gradlew test", "confidence is low"],
    standardsMustNotInclude: ["Project architecture: modules"],
  },
  {
    fixture: "ruby-rails",
    description: "Ruby/Rails with rspec, rubocop, and low-confidence architecture",
    setupReady: true,
    alignmentReady: false,
    architectureConfidence: "low",
    validButNeedsAttention: true,
    blockingGaps: 0,
    handsOff: true,
    testCommand: "bundle exec rspec",
    testCommandProvenance: "miner",
    mapPaths: [],
    architectHasGrounding: false,
    constitutionMustInclude: ["bundle exec rspec"],
    standardsMustInclude: ["bundle exec rspec", "rails", "confidence is low"],
    standardsMustNotInclude: ["Project architecture: modules"],
  },
  {
    fixture: "dotnet-app",
    description: ".NET app with dotnet test from test SDK evidence",
    setupReady: true,
    alignmentReady: true,
    blockingGaps: 0,
    handsOff: true,
    testCommand: "dotnet test",
    testCommandProvenance: "miner",
    mapPaths: [],
    architectHasGrounding: false,
    constitutionMustInclude: ["dotnet test"],
    standardsMustInclude: ["dotnet test"],
  },
];

export function assertCorpusExpectation(artifacts: SetupArtifacts, expected: CorpusExpectation): void {
  const { smoke, status, projectContext, standardsIndex, architect, tester, constitution, overlay } = artifacts;
  const mapPaths = projectContext.map.map((entry) => entry.path);

  expect(smoke.setupReady, `${expected.fixture} smoke.setupReady`).toBe(expected.setupReady);
  expect(status.setupReady, `${expected.fixture} status.setupReady`).toBe(expected.setupReady);
  expect(status.alignmentReady, `${expected.fixture} alignmentReady`).toBe(expected.alignmentReady);
  expect(status.blockingGaps, `${expected.fixture} blockingGaps`).toBe(expected.blockingGaps);

  if (expected.architectureConfidence !== undefined) {
    expect(status.architectureConfidence, `${expected.fixture} architectureConfidence`).toBe(
      expected.architectureConfidence,
    );
  }
  if (expected.validButNeedsAttention !== undefined) {
    expect(status.validButNeedsAttention, `${expected.fixture} validButNeedsAttention`).toBe(
      expected.validButNeedsAttention,
    );
  }
  if (expected.handsOff !== undefined) {
    expect(status.handsOff, `${expected.fixture} handsOff`).toBe(expected.handsOff);
  }
  if (expected.testCommand !== undefined) {
    expect(overlay.interviewAnswers["test-command"], `${expected.fixture} testCommand`).toBe(
      expected.testCommand,
    );
  }
  if (expected.testCommandProvenance !== undefined) {
    expect(overlay.gapClosureProvenance["test-command"], `${expected.fixture} provenance`).toBe(
      expected.testCommandProvenance,
    );
  }
  if (expected.mapPaths !== undefined) {
    expect(mapPaths, `${expected.fixture} mapPaths`).toEqual(expected.mapPaths);
  }
  if (expected.mapMustNotInclude) {
    for (const forbidden of expected.mapMustNotInclude) {
      expect(mapPaths.join("\n"), `${expected.fixture} map must not include ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  }
  if (expected.workspacePackageCount !== undefined) {
    expect(status.packages, `${expected.fixture} workspace packages`).toBe(expected.workspacePackageCount);
  }
  if (expected.packageExpectations) {
    for (const pkg of expected.packageExpectations) {
      const ctx = projectContext.packages.find((entry) => entry.path === pkg.path);
      expect(ctx, `${expected.fixture} package context ${pkg.path}`).toBeDefined();
      if (pkg.testCommand !== undefined) {
        expect(ctx!.testCommand, `${expected.fixture} ${pkg.path} testCommand`).toBe(pkg.testCommand);
      }
    }
  }
  const architectPrimary = architectPrimaryGuidance(architect);
  const hasGrounding = architect.includes("## Deterministic project grounding");
  if (expected.architectHasGrounding !== undefined) {
    expect(hasGrounding, `${expected.fixture} architect grounding`).toBe(expected.architectHasGrounding);
  }
  const testerHasGroundingSection = tester.includes("## Deterministic project grounding");
  if (expected.testerHasGrounding !== undefined) {
    expect(testerHasGroundingSection, `${expected.fixture} tester grounding`).toBe(expected.testerHasGrounding);
  }
  if (expected.testerMustInclude) {
    for (const text of expected.testerMustInclude) {
      expect(tester, `${expected.fixture} tester includes ${text}`).toContain(text);
    }
  }
  for (const text of expected.testerMustNotInclude ?? []) {
    expect(tester, `${expected.fixture} tester excludes ${text}`).not.toContain(text);
  }
  for (const text of expected.architectMustInclude ?? []) {
    expect(architect, `${expected.fixture} architect includes ${text}`).toContain(text);
  }
  for (const text of expected.architectMustNotInclude ?? []) {
    expect(architectPrimary, `${expected.fixture} architect excludes ${text}`).not.toContain(text);
  }
  for (const text of expected.constitutionMustInclude ?? []) {
    expect(constitution, `${expected.fixture} constitution includes ${text}`).toContain(text);
  }
  for (const text of expected.constitutionMustNotInclude ?? []) {
    expect(constitution, `${expected.fixture} constitution excludes ${text}`).not.toContain(text);
  }
  for (const text of expected.standardsMustInclude ?? []) {
    expect(standardsIndex, `${expected.fixture} standards include ${text}`).toContain(text);
  }
  for (const text of expected.standardsMustNotInclude ?? []) {
    expect(standardsIndex, `${expected.fixture} standards exclude ${text}`).not.toContain(text);
  }
}
