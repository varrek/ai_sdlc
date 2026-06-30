import type { StandardsDrift } from "../customize/emitters.js";
import type { GapQuestion } from "../customize/gap-interview.js";
import { handoffFindings } from "../garden/doc-gardener.js";
import type { DocGardenReport } from "../garden/types.js";
import type { Overlay } from "../schema/index.js";

export const MAINTENANCE_SKILL_IDS = [
  "close-gaps",
  "resolve-upgrade",
  "setup-triage",
  "review-standards-drift",
  "bind-integrations",
  "compound-learnings",
  "pack-workflows",
  "bench-triage",
  "architecture-grounding",
  "garden-docs",
] as const;

export type MaintenanceSkillId = (typeof MAINTENANCE_SKILL_IDS)[number];

export const MAINTENANCE_REPORT_BASENAME = "maintenance-report.json";

export interface MaintenanceSkillHandoff {
  skill: MaintenanceSkillId;
  reason: string;
  reportPath?: string;
}

export interface MaintenanceReport {
  setupReady: boolean;
  phases: {
    customizeFresh: boolean;
    compileFresh: boolean;
    smokePassed: boolean;
    gardenFindings: number;
  };
  handoffs: MaintenanceSkillHandoff[];
}

export interface MaintenanceStatusSnapshot {
  architectureConfidence?: "high" | "low";
  architectureReasons: string[];
  roleStates: Record<string, "generic" | "deterministic" | "llm-authored" | "deterministic+llm">;
}

export interface MaintenanceHandoffInput {
  status: MaintenanceStatusSnapshot;
  setupReady: boolean;
  smokePassed: boolean;
  gardenReport: DocGardenReport;
  overlay: Overlay;
  upgradeConflictsPresent: boolean;
  benchExitCode?: number;
  benchReportPath?: string;
  packDirs: string[];
  gaps: GapQuestion[];
  drift: StandardsDrift;
  deferredIntegrations: string[];
}

export function buildMaintenanceHandoffs(
  input: MaintenanceHandoffInput,
): MaintenanceSkillHandoff[] {
  const handoffs: MaintenanceSkillHandoff[] = [];

  if (input.gaps.length > 0) {
    handoffs.push({
      skill: "close-gaps",
      reason: `${input.gaps.length} blocking gap(s) remain: ${input.gaps.map((g) => g.id).join(", ")}`,
    });
  }

  if (input.upgradeConflictsPresent) {
    handoffs.push({
      skill: "resolve-upgrade",
      reason: "upgrade-conflicts.yml is present from a blocked base upgrade",
      reportPath: ".sdlc/upgrade-conflicts.yml",
    });
  }

  if (!input.setupReady) {
    handoffs.push({
      skill: "setup-triage",
      reason: "repo is not setup-ready after maintain's compile/smoke chain",
    });
  }

  if (hasStandardsDrift(input.drift)) {
    handoffs.push({
      skill: "review-standards-drift",
      reason: "standards index drift detected on customize re-run",
    });
  }

  const unbound = input.deferredIntegrations.filter(
    (id) => !input.overlay.integrations[id]?.serverId,
  );
  if (unbound.length > 0) {
    handoffs.push({
      skill: "bind-integrations",
      reason: `deferred integrations need bindings before wrap-up: ${unbound.join(", ")}`,
    });
  }

  if (input.drift.added.length > 0 || input.drift.removed.length > 0) {
    handoffs.push({
      skill: "compound-learnings",
      reason: "standards drift may produce accepted learnings to review",
    });
  }

  if (input.packDirs.length > 0) {
    handoffs.push({
      skill: "pack-workflows",
      reason: `reference pack(s) enabled: ${input.packDirs.join(", ")}`,
    });
  }

  if (input.benchExitCode !== undefined && input.benchExitCode !== 0) {
    handoffs.push({
      skill: "bench-triage",
      reason: "external bench run reported failures",
      reportPath: input.benchReportPath,
    });
  }

  if (needsArchitectureGrounding(input.status)) {
    handoffs.push({
      skill: "architecture-grounding",
      reason: architectureGroundingReason(input.status),
    });
  }

  const gardenHandoffs = handoffFindings(input.gardenReport);
  if (gardenHandoffs.length > 0) {
    handoffs.push({
      skill: "garden-docs",
      reason: `${gardenHandoffs.length} doc-garden finding(s) need host-agent judgment`,
      reportPath: ".sdlc/doc-gardening-report.json",
    });
  }

  return sortHandoffs(handoffs);
}

export function renderMaintenanceText(report: MaintenanceReport): string {
  const lines = [
    `Maintenance: setup-ready=${report.setupReady ? "yes" : "no"}.`,
    `Phases: customize ${report.phases.customizeFresh ? "fresh" : "ran"}, compile ${report.phases.compileFresh ? "fresh" : "ran"}, smoke ${report.phases.smokePassed ? "pass" : "fail"}, garden ${report.phases.gardenFindings} finding(s).`,
  ];
  if (report.handoffs.length === 0) {
    lines.push("No skill handoffs — maintenance clean.");
  } else {
    lines.push(`${report.handoffs.length} skill handoff(s):`);
    for (const handoff of report.handoffs) {
      const path = handoff.reportPath ? ` (${handoff.reportPath})` : "";
      lines.push(`  - ${handoff.skill}: ${handoff.reason}${path}`);
    }
    lines.push("Invoke listed skills in order, then re-run `aisdlc maintain`.");
  }
  return lines.join("\n");
}

export function serializeMaintenanceReport(report: MaintenanceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function hasStandardsDrift(drift: StandardsDrift): boolean {
  return drift.changed || drift.added.length > 0 || drift.removed.length > 0;
}

function needsArchitectureGrounding(status: MaintenanceStatusSnapshot): boolean {
  if (status.architectureConfidence === "low") return true;
  const genericRoles = ["architect", "reviewer", "debugger"] as const;
  return genericRoles.some((role) => status.roleStates[role] === "generic");
}

function architectureGroundingReason(status: MaintenanceStatusSnapshot): string {
  if (status.architectureConfidence === "low") {
    return `architecture confidence is low (${status.architectureReasons.join("; ") || "see status"})`;
  }
  return "one or more groundable roles still have generic guidance";
}

function sortHandoffs(handoffs: MaintenanceSkillHandoff[]): MaintenanceSkillHandoff[] {
  const order = new Map(MAINTENANCE_SKILL_IDS.map((skill, index) => [skill, index]));
  return [...handoffs].sort((a, b) => (order.get(a.skill) ?? 999) - (order.get(b.skill) ?? 999));
}
