import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AcceptedLearningEntry } from "./accepted-learnings.js";
import { upsertAcceptedLearning } from "./accepted-learnings.js";

export const PENDING_LEARNINGS_FILE = "pending-learnings.jsonl";

export type CompoundLearningSurface = "global" | "role" | "domain";

export interface PendingLearningEntry {
  key: string;
  surface: CompoundLearningSurface;
  /** Target path or role name depending on surface. */
  target: string;
  claim: string;
  sources: string[];
  createdAt: string;
}

export function pendingLearningsPath(sdlcDir: string): string {
  return join(sdlcDir, "memory", PENDING_LEARNINGS_FILE);
}

function readPending(sdlcDir: string): PendingLearningEntry[] {
  const path = pendingLearningsPath(sdlcDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PendingLearningEntry);
}

function writePending(sdlcDir: string, entries: PendingLearningEntry[]): void {
  const path = pendingLearningsPath(sdlcDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : ""),
    "utf8",
  );
}

/** Heuristic router for correction → instruction surface (R6). */
export function routeCorrection(
  correction: string,
  opts: { role?: string; domainPath?: string; surface?: CompoundLearningSurface } = {},
): { surface: CompoundLearningSurface; target: string } {
  if (opts.surface) {
    const target =
      opts.surface === "role"
        ? (opts.role ?? "engineer")
        : opts.surface === "domain"
          ? (opts.domainPath ?? ".sdlc/domain-docs/general.md")
          : "standards";
    return { surface: opts.surface, target };
  }
  const lower = correction.toLowerCase();
  if (opts.role && (lower.includes("role") || lower.includes("agent"))) {
    return { surface: "role", target: opts.role };
  }
  if (opts.domainPath || lower.includes("domain") || lower.includes("module")) {
    return {
      surface: "domain",
      target: opts.domainPath ?? ".sdlc/overlay/domain-docs/general.md",
    };
  }
  return { surface: "global", target: "standards" };
}

export function proposeCompoundLearning(
  sdlcDir: string,
  correction: string,
  sources: string[],
  opts: { role?: string; domainPath?: string; surface?: CompoundLearningSurface } = {},
): PendingLearningEntry {
  if (sources.length === 0) {
    throw new Error("compound-learning requires at least one evidence source");
  }
  const { surface, target } = routeCorrection(correction, opts);
  const key = `compound:${surface}:${target}:${hashClaim(correction)}`;
  const entry: PendingLearningEntry = {
    key,
    surface,
    target,
    claim: correction.trim(),
    sources: [...sources].sort(),
    createdAt: new Date().toISOString(),
  };
  const existing = readPending(sdlcDir).filter((e) => e.key !== key);
  existing.push(entry);
  existing.sort((a, b) => a.key.localeCompare(b.key));
  writePending(sdlcDir, existing);
  return entry;
}

export function listPendingLearnings(sdlcDir: string): PendingLearningEntry[] {
  return readPending(sdlcDir);
}

export function acceptPendingLearning(
  sdlcDir: string,
  key: string,
): AcceptedLearningEntry | undefined {
  const pending = readPending(sdlcDir);
  const match = pending.find((e) => e.key === key);
  if (!match) return undefined;
  const accepted: AcceptedLearningEntry = {
    key: match.key,
    kind: "compound-correction",
    claim: match.claim,
    sources: match.sources,
    provenance: "manual",
  };
  upsertAcceptedLearning(sdlcDir, accepted);
  writePending(
    sdlcDir,
    pending.filter((e) => e.key !== key),
  );
  return accepted;
}

export function rejectPendingLearning(sdlcDir: string, key: string): boolean {
  const pending = readPending(sdlcDir);
  const next = pending.filter((e) => e.key !== key);
  if (next.length === pending.length) return false;
  writePending(sdlcDir, next);
  return true;
}

function hashClaim(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}
