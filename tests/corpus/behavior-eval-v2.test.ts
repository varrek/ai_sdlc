import { afterEach, describe, expect, it } from "vitest";
import {
  READ_ONLY_LOCALIZATION_SCENARIOS,
  evaluateReadOnlyLocalizationScenario,
  guidanceFromSetup,
} from "./behavior-eval-v2.js";
import {
  cleanupCorpusTempDirs,
  copyFixture,
  runGenericSetup,
  runSetup,
} from "./corpus-harness.js";

afterEach(() => cleanupCorpusTempDirs());

describe("behavior eval v2 read-only localization", () => {
  it.each(READ_ONLY_LOCALIZATION_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s improves module and test-command selection over generic Cursor guidance",
    (scenarioId, scenario) => {
      const root = copyFixture(scenario.fixture);
      const generic = guidanceFromSetup(runGenericSetup(root));

      const personalizedRoot = copyFixture(scenario.fixture);
      const personalized = guidanceFromSetup(runSetup(personalizedRoot));

      const result = evaluateReadOnlyLocalizationScenario(scenario, generic, personalized);

      expect(result.scenarioId).toBe(scenarioId);
      expect(result.host).toBe("cursor");
      expect(result.personalizedPass, result.notes.join("; ")).toBe(true);
      expect(result.personalized.selectedModule).toBe(scenario.expectedModule);
      expect(result.personalized.selectedTestCommand).toBe(scenario.expectedTestCommand);
      expect(result.genericPass).toBe(false);
      expect(result.improvement).toBe(true);
    },
  );

  it("generic baseline lacks mined map and repo-specific standards", () => {
    const root = copyFixture("python-rags");
    const generic = guidanceFromSetup(runGenericSetup(root));

    expect(generic.projectContext.map).toEqual([]);
    expect(generic.standardsIndex).not.toContain("pytest");
    expect(generic.constitution).not.toContain("## Codebase map");
  });
});
