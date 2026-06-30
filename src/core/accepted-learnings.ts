import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GapClosureProvenance } from "../schema/index.js";
import { readJsonlFile } from "./jsonl.js";
import type { GateOutcome } from "./memory.js";

export const ACCEPTED_LEARNINGS_DIR = "memory";
export const ACCEPTED_LEARNINGS_FILE = "accepted-learnings.jsonl";

export type AcceptedLearningKind =
  | "test-command"
  | "architecture-demotion"
  | "standard-added"
  | "gate-approval"
  | "review-finding"
  | "test-correction"
  | "bench-residual";

export const LOOP_DERIVED_LEARNING_KINDS = [
  "review-finding",
  "test-correction",
  "bench-residual",
  "gate-approval",
] as const satisfies readonly AcceptedLearningKind[];

const MAX_GATE_LEARNING_CLAIM_CHARS = 240;

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
  const raw = readJsonlFile(path, (value) =>
    isAcceptedLearningEntry(value as AcceptedLearningEntry)
      ? (value as AcceptedLearningEntry)
      : undefined,
  );
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
  writeFileSync(
    path,
    next.map((item) => JSON.stringify(item)).join("\n") + (next.length > 0 ? "\n" : ""),
    "utf8",
  );
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

export function filterAcceptedLearningsByKinds(
  entries: AcceptedLearningEntry[],
  kinds: readonly AcceptedLearningKind[],
): AcceptedLearningEntry[] {
  return entries.filter((entry) => kinds.includes(entry.kind));
}

export function acceptedLearningFromGateOutcome(outcome: GateOutcome): AcceptedLearningEntry {
  const kindByVerdict = {
    approved: "gate-approval",
    blocked: "bench-residual",
    "changes-requested": "review-finding",
  } as const satisfies Record<GateOutcome["verdict"], AcceptedLearningKind>;
  const labelByVerdict = {
    approved: "Approved? gate approved",
    blocked: "Approved? gate blocked",
    "changes-requested": "Approved? gate requested changes",
  } as const satisfies Record<GateOutcome["verdict"], string>;
  const claim = `${labelByVerdict[outcome.verdict]} for ${outcome.scope}: ${outcome.reason}`.slice(
    0,
    MAX_GATE_LEARNING_CLAIM_CHARS,
  );
  return {
    key: `gate:${outcome.taskId}:${outcome.verdict}:${slug(outcome.scope)}`,
    kind: kindByVerdict[outcome.verdict],
    claim,
    sources: [outcome.scope],
    provenance: "gate",
  };
}

export function upsertGateOutcomeLearning(sdlcDir: string, outcome: GateOutcome): string {
  return upsertAcceptedLearning(sdlcDir, acceptedLearningFromGateOutcome(outcome));
}

export function acceptedLearningFromTestCorrection(options: {
  taskId: string;
  scope: string;
  reason: string;
  sources?: string[];
}): AcceptedLearningEntry {
  const claim = `Tester correction for ${options.scope}: ${options.reason}`.slice(
    0,
    MAX_GATE_LEARNING_CLAIM_CHARS,
  );
  return {
    key: `test-correction:${options.taskId}:${slug(options.scope)}`,
    kind: "test-correction",
    claim,
    sources: options.sources ?? [options.scope],
    provenance: "gate",
  };
}

export function upsertTestCorrectionLearning(
  sdlcDir: string,
  options: Parameters<typeof acceptedLearningFromTestCorrection>[0],
): string {
  return upsertAcceptedLearning(sdlcDir, acceptedLearningFromTestCorrection(options));
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

function slug(value: string): string {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return out.length > 0 ? out : "unknown-scope";
}
