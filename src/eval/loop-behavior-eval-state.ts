import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify } from "yaml";
import type { LoopScore, LoopScoreMetrics, LoopViolationKind } from "./loop-score.js";

export interface LoopBehaviorEvalResult {
  scenarioId: string;
  passed: boolean;
  score: LoopScore;
  evaluatedAt: string;
}

export interface LoopBehaviorEvalState {
  version: 1;
  results: LoopBehaviorEvalResult[];
  updatedAt: string;
}

const BEHAVIOR_EVAL_FILE = "loop-behavior-eval.yaml";
const LOOP_TERMINAL_STATUSES = new Set<LoopScoreMetrics["terminalStatus"]>(["done", "stuck", "missing"]);
const LOOP_VIOLATION_KINDS = new Set<LoopViolationKind>([
  "missing-stage",
  "stage-order",
  "role-ownership",
  "approval-gate",
  "tester-before-reviewer",
  "missing-evaluator-verdict",
  "evaluator-handback",
  "replan-budget",
  "terminal",
]);

function evalStatePath(sdlcDir: string): string {
  return join(sdlcDir, BEHAVIOR_EVAL_FILE);
}

function isEvalResult(value: unknown): value is LoopBehaviorEvalResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoopBehaviorEvalResult>;
  return (
    typeof candidate.scenarioId === "string" &&
    typeof candidate.passed === "boolean" &&
    typeof candidate.evaluatedAt === "string" &&
    isLoopScore(candidate.score)
  );
}

function isLoopScore(value: unknown): value is LoopScore {
  if (!value || typeof value !== "object") return false;
  const score = value as Partial<LoopScore>;
  return typeof score.passed === "boolean" && isLoopScoreMetrics(score.metrics) && isLoopViolations(score.violations);
}

function isLoopScoreMetrics(value: unknown): value is LoopScoreMetrics {
  if (!value || typeof value !== "object") return false;
  const metrics = value as Partial<LoopScoreMetrics>;
  return (
    typeof metrics.expectedStages === "number" &&
    typeof metrics.observedStages === "number" &&
    Array.isArray(metrics.missingStages) &&
    metrics.missingStages.every((stage) => typeof stage === "string") &&
    typeof metrics.replanCount === "number" &&
    typeof metrics.approvalGateCount === "number" &&
    LOOP_TERMINAL_STATUSES.has(metrics.terminalStatus as LoopScoreMetrics["terminalStatus"])
  );
}

function isLoopViolations(value: unknown): value is LoopScore["violations"] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const violation = item as { kind?: unknown; message?: unknown; stage?: unknown; eventIndex?: unknown };
    return (
      typeof violation.kind === "string" &&
      LOOP_VIOLATION_KINDS.has(violation.kind as LoopViolationKind) &&
      typeof violation.message === "string" &&
      (violation.stage === undefined || typeof violation.stage === "string") &&
      (violation.eventIndex === undefined || typeof violation.eventIndex === "number")
    );
  });
}

export function readLoopBehaviorEvalState(sdlcDir: string): LoopBehaviorEvalState | undefined {
  const path = evalStatePath(sdlcDir);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = parseYaml(readFileSync(path, "utf8")) as Partial<LoopBehaviorEvalState> | null;
    if (
      parsed &&
      parsed.version === 1 &&
      Array.isArray(parsed.results) &&
      typeof parsed.updatedAt === "string" &&
      parsed.results.every(isEvalResult)
    ) {
      return parsed as LoopBehaviorEvalState;
    }
  } catch {
    process.stderr.write(`Warning: ${path} is unreadable; treating behavior eval as not yet run.\n`);
    return undefined;
  }
  process.stderr.write(`Warning: ${path} is invalid; treating behavior eval as not yet run.\n`);
  return undefined;
}

export function writeLoopBehaviorEvalState(
  sdlcDir: string,
  results: LoopBehaviorEvalResult[],
): LoopBehaviorEvalState {
  if (!results.every(isEvalResult)) {
    throw new Error("loop behavior eval results must match the persisted result schema");
  }
  const state: LoopBehaviorEvalState = {
    version: 1,
    results,
    updatedAt: new Date().toISOString(),
  };
  const path = evalStatePath(sdlcDir);
  mkdirSync(sdlcDir, { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, stringify(state, { sortMapEntries: false }), "utf8");
    renameSync(tmp, path);
  } finally {
    if (existsSync(tmp)) {
      try {
        rmSync(tmp);
      } catch {
        // Best effort cleanup; ignore if removal fails
      }
    }
  }
  return state;
}

export interface BehaviorEvalSummary {
  state: "not-run" | "passed" | "failed" | "partial";
  passed: number;
  total: number;
}

export function summarizeBehaviorEval(
  evalState: LoopBehaviorEvalState | undefined,
): BehaviorEvalSummary {
  if (!evalState || evalState.results.length === 0) {
    return { state: "not-run", passed: 0, total: 0 };
  }
  const total = evalState.results.length;
  const passed = evalState.results.filter((r) => r.score.passed).length;
  if (passed === total) {
    return { state: "passed", passed, total };
  }
  if (passed === 0) {
    return { state: "failed", passed, total };
  }
  return { state: "partial", passed, total };
}
