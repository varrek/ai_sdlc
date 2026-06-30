import { describe, expect, it } from "vitest";
import { buildMaintenanceHandoffs } from "../../src/core/maintenance.js";
import type { Overlay } from "../../src/schema/index.js";

const emptyOverlay: Overlay = {
  version: 1,
  operatingMode: "plugin",
  standards: [],
  integrations: {},
  roleModels: {},
  roleAddenda: {},
  interviewAnswers: {},
  gapClosureProvenance: {},
};

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
      smokePassed: false,
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
      overlay: emptyOverlay,
      upgradeConflictsPresent: true,
      packDirs: ["packs/frontend"],
      gaps: [{ id: "test-command", question: "What command runs tests?" }],
      drift: { added: ["new standard"], removed: [], changed: true },
      deferredIntegrations: ["gitlab", "jira"],
    });

    expect(handoffs.map((h) => h.skill)).toEqual([
      "close-gaps",
      "resolve-upgrade",
      "setup-triage",
      "review-standards-drift",
      "bind-integrations",
      "compound-learnings",
      "pack-workflows",
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
      smokePassed: true,
      gardenReport: { findings: [], summary: { total: 0, warnings: 0, errors: 0 } },
      overlay: emptyOverlay,
      upgradeConflictsPresent: false,
      packDirs: [],
      gaps: [],
      drift: { added: [], removed: [], changed: false },
      deferredIntegrations: [],
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
      smokePassed: true,
      gardenReport: { findings: [], summary: { total: 0, warnings: 0, errors: 0 } },
      overlay: emptyOverlay,
      upgradeConflictsPresent: false,
      packDirs: [],
      gaps: [],
      drift: { added: [], removed: [], changed: false },
      deferredIntegrations: [],
    });

    expect(handoffs.some((h) => h.skill === "architecture-grounding")).toBe(true);
  });
});
