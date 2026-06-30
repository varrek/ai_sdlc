import { describe, expect, it } from "vitest";
import { buildMaintenanceHandoffs } from "../../src/core/maintenance.js";

describe("maintenance handoffs", () => {
  it("orders skills and includes close-gaps and garden-docs when needed", () => {
    const handoffs = buildMaintenanceHandoffs({
      status: {
        architectureConfidence: "high",
        architectureReasons: [],
        roleStates: {
          architect: "deterministic",
          reviewer: "deterministic",
          debugger: "deterministic",
        },
      },
      setupReady: false,
      gardenReport: {
        findings: [
          {
            id: "broken-local-link",
            severity: "error",
            path: "docs/x.md",
            message: "missing",
            suggestion: "fix",
          },
        ],
        summary: { total: 1, warnings: 0, errors: 1 },
      },
      upgradeConflictsPresent: true,
      gaps: [{ id: "test-command", question: "What command runs tests?" }],
      drift: { added: ["new standard"], removed: [], changed: true },
    });

    expect(handoffs.map((h) => h.skill)).toEqual([
      "close-gaps",
      "resolve-upgrade",
      "setup-triage",
      "review-standards-drift",
      "compound-learnings",
      "garden-docs",
    ]);
  });

  it("returns empty handoffs when maintenance is clean", () => {
    const handoffs = buildMaintenanceHandoffs({
      status: {
        architectureConfidence: "high",
        architectureReasons: [],
        roleStates: {
          architect: "deterministic",
          reviewer: "deterministic",
          debugger: "deterministic",
        },
      },
      setupReady: true,
      gardenReport: { findings: [], summary: { total: 0, warnings: 0, errors: 0 } },
      upgradeConflictsPresent: false,
      gaps: [],
      drift: { added: [], removed: [], changed: false },
    });

    expect(handoffs).toEqual([]);
  });

  it("includes architecture-grounding for low confidence repos", () => {
    const handoffs = buildMaintenanceHandoffs({
      status: {
        architectureConfidence: "low",
        architectureReasons: ["flat repo"],
        roleStates: { architect: "generic", reviewer: "generic", debugger: "generic" },
      },
      setupReady: true,
      gardenReport: { findings: [], summary: { total: 0, warnings: 0, errors: 0 } },
      upgradeConflictsPresent: false,
      gaps: [],
      drift: { added: [], removed: [], changed: false },
    });

    expect(handoffs.some((h) => h.skill === "architecture-grounding")).toBe(true);
  });
});
