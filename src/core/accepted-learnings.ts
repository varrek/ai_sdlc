import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GapClosureProvenance } from "../schema/index.js";

export const ACCEPTED_LEARNINGS_DIR = "memory";
export const ACCEPTED_LEARNINGS_FILE = "accepted-learnings.jsonl";

export type AcceptedLearningKind =
  | "test-command"
  | "architecture-demotion"
  | "standard-added";

export interface AcceptedLearningEntry {
  /** Stable dedupe key, e.g. `test-command` or `architecture:docs`. */
  key: string;
  kind: AcceptedLearningKind;
  /** Deterministic one-line claim agents can rely on. */
  claim: string;
  /** Evidence paths or structured source refs. */
  sources: string[];
  provenance: GapClosureProvenance | "gate";
}

export function acceptedLearningsPath(sdlcDir: string): string {
  return join(sdlcDir, ACCEPTED_LEARNINGS_DIR, ACCEPTED_LEARNINGS_FILE);
}

export function readAcceptedLearnings(sdlcDir: string): AcceptedLearningEntry[] {
  const path = acceptedLearningsPath(sdlcDir);
  const raw = readJsonl<AcceptedLearningEntry>(path);
  const byKey = new Map<string, AcceptedLearningEntry>();
  for (const entry of raw) {
    if (isAcceptedLearningEntry(entry)) {
      byKey.set(entry.key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Upsert one entry by key; returns the path written. */
export function upsertAcceptedLearning(sdlcDir: string, entry: AcceptedLearningEntry): string {
  const path = acceptedLearningsPath(sdlcDir);
  const existing = readAcceptedLearnings(sdlcDir);
  const next = existing.filter((item) => item.key !== entry.key);
  next.push(entry);
  next.sort((a, b) => a.key.localeCompare(b.key));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next.map((item) => JSON.stringify(item)).join("\n") + (next.length > 0 ? "\n" : ""), "utf8");
  return path;
}

/** Replace the ledger with the provided entries (sorted, keyed). */
export function writeAcceptedLearnings(sdlcDir: string, entries: AcceptedLearningEntry[]): string {
  const path = acceptedLearningsPath(sdlcDir);
  const byKey = new Map<string, AcceptedLearningEntry>();
  for (const entry of entries) {
    byKey.set(entry.key, entry);
  }
  const sorted = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    sorted.map((item) => JSON.stringify(item)).join("\n") + (sorted.length > 0 ? "\n" : ""),
    "utf8",
  );
  return path;
}

export function summarizeAcceptedLearnings(entries: AcceptedLearningEntry[], limit = 5): string[] {
  return entries.slice(0, limit).map((entry) => entry.claim);
}

function isAcceptedLearningEntry(value: AcceptedLearningEntry): value is AcceptedLearningEntry {
  return (
    typeof value.key === "string" &&
    typeof value.claim === "string" &&
    typeof value.kind === "string" &&
    Array.isArray(value.sources) &&
    typeof value.provenance === "string"
  );
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Skip a corrupt/partial line rather than throwing on the whole log.
    }
  }
  return out;
}