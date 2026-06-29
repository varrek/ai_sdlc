import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

export function readLoopBehaviorEvalState(sdlcDir: string): LoopBehaviorEvalState | undefined {
  const path = evalStatePath(sdlcDir);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = parseYaml(readFileSync(path, "utf8")) as Partial<LoopBehaviorEvalState> | null;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.results)) {
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
  const state: LoopBehaviorEvalState = {
    version: 1,
    results,
    updatedAt: new Date().toISOString(),
  };
  const path = evalStatePath(sdlcDir);
  mkdirSync(sdlcDir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, stringify(state, { sortMapEntries: false }), "utf8");
  renameSync(tmp, path);
  return state;
}

export interface BehaviorEvalSummary {
  state: "not-run" | "passed" | "failed" | "partial";
  passed: number;
  total: number;
}

export function summarizeBehaviorEval(evalState: LoopBehaviorEvalState | undefined): BehaviorEvalSummary {
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
