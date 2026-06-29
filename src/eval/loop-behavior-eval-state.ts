import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify } from "yaml";
import type { LoopScore } from "./loop-score.js";

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

function evalStatePath(sdlcDir: string): string {
  return join(sdlcDir, BEHAVIOR_EVAL_FILE);
}

function isEvalResult(value: unknown): value is LoopBehaviorEvalResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoopBehaviorEvalResult>;
  const score = candidate.score as Partial<LoopScore> | undefined;
  return (
    typeof candidate.scenarioId === "string" &&
    typeof candidate.passed === "boolean" &&
    typeof candidate.evaluatedAt === "string" &&
    score !== undefined &&
    typeof score.passed === "boolean" &&
    typeof score.metrics === "object" &&
    score.metrics !== null &&
    Array.isArray(score.violations)
  );
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
    return undefined;
  }
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
