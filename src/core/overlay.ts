import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml, stringify } from "yaml";
import type { Overlay } from "../schema/index.js";
import type { LoadedBase } from "./loader.js";

export interface ProjectLock {
  version: 1;
  /** Pinned base version (git ref or npm version). */
  baseVersion: string;
}

export function readProjectLock(lockPath: string): ProjectLock | undefined {
  if (!existsSync(lockPath)) return undefined;
  const parsed = parseYaml(readFileSync(lockPath, "utf8")) as Partial<ProjectLock> | null;
  if (!parsed || typeof parsed.baseVersion !== "string") return undefined;
  return { version: 1, baseVersion: parsed.baseVersion };
}

export function serializeProjectLock(lock: ProjectLock): string {
  return stringify({ version: lock.version, baseVersion: lock.baseVersion }, { sortMapEntries: false });
}

export interface OverlayConflict {
  /** Stable edge key, e.g. `role.architect.model`. */
  edge: string;
  overlayValue: string;
  oldBaseValue: string | null;
  newBaseValue: string | null;
}

/**
 * Flatten the base's *overridable edges* into a stable key→value map. Only edges
 * an overlay can override participate in conflict detection. Today that is role
 * model defaults; more edges can be added here as the overlay schema grows.
 */
export function baseEdges(base: LoadedBase): Record<string, string | null> {
  const edges: Record<string, string | null> = {};
  for (const role of base.roles) {
    edges[`role.${role.frontmatter.name}.model`] = role.frontmatter.model ?? null;
  }
  return edges;
}

/** The edges an overlay explicitly overrides, as a key→value map. */
export function overlayOverrides(overlay: Overlay): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const [roleName, model] of Object.entries(overlay.roleModels)) {
    overrides[`role.${roleName}.model`] = model;
  }
  return overrides;
}

/**
 * Three-way conflict detection. A conflict exists when the overlay overrides an
 * edge AND the base author changed that same edge between the old and new base
 * (i.e. the central push touches something a team customized). Per the
 * 2026-06-14 policy, these BLOCK — the caller never auto-merges.
 */
export function detectConflicts(
  oldBase: LoadedBase,
  newBase: LoadedBase,
  overlay: Overlay,
): OverlayConflict[] {
  const oldEdges = baseEdges(oldBase);
  const newEdges = baseEdges(newBase);
  const overrides = overlayOverrides(overlay);

  const conflicts: OverlayConflict[] = [];
  for (const [edge, overlayValue] of Object.entries(overrides)) {
    const oldValue = edge in oldEdges ? oldEdges[edge]! : null;
    const newValue = edge in newEdges ? newEdges[edge]! : null;
    if (oldValue !== newValue) {
      conflicts.push({ edge, overlayValue, oldBaseValue: oldValue, newBaseValue: newValue });
    }
  }
  return conflicts.sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
}

export function serializeConflictReport(conflicts: OverlayConflict[]): string {
  return stringify(
    {
      version: 1,
      resolution: "manual",
      note: "Base upgrade collided with overlay edits. Resolve each edge, then re-run upgrade. Nothing was overwritten.",
      conflicts,
    },
    { sortMapEntries: false },
  );
}
