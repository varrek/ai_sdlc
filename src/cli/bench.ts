import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  readExternalRepoCatalog,
  selectExternalRepos,
  type ExternalRepoCatalog,
  type ExternalRepoEntry,
} from "../eval/catalog.js";
import {
  EVAL_FAILURE_CLASSES,
  buildEvalRunReport,
  hasFailingClass,
  renderEvalSummary,
  resultFromCacheFailure,
  resultFromSetupError,
  resultFromSetup,
  type EvalFailureClass,
  type EvalRunReport,
  type RepoEvalResult,
} from "../eval/report.js";
import { assertContainedPath, cacheEntryHash, hashJson, materializeRepo, type GitRunner } from "../eval/repo-cache.js";
import { runSetupChain } from "../eval/setup-chain.js";
import type { SetupChainResult } from "../eval/setup-chain.js";
import { baseFingerprint } from "./phase-fingerprints.js";
import type { OperatingMode } from "../schema/index.js";

export interface BenchOptions {
  seed: number;
  count: number;
  catalogPath: string;
  cacheDir: string;
  reportDir: string;
  baseDir: string;
  mode: OperatingMode;
  skipClone?: boolean;
  dryRun?: boolean;
  force?: boolean;
  repoTimeoutMs?: number;
  failOnClasses?: EvalFailureClass[];
  setupRunner?: (root: string) => SetupChainResult;
  git?: GitRunner;
  now?: Date;
}

export interface BenchResult {
  report?: EvalRunReport;
  reportPath?: string;
  output: string;
  exitCode: number;
}

export const DEFAULT_CATALOG = "eval-corpus/external-repos.json";
export const DEFAULT_CACHE_DIR = ".verify/repos";
export const DEFAULT_REPORT_DIR = ".verify/reports";

export function runBench(options: BenchOptions): BenchResult {
  const catalog = readExternalRepoCatalog(options.catalogPath);
  const selection = selectExternalRepos(catalog, options.seed, options.count);

  if (options.dryRun) {
    return {
      output: [
        "aisdlc bench dry-run",
        `Selected: ${selection.selected.map((repo) => repo.id).join(", ")}`,
        selection.diversityGaps.length ? `Diversity gaps: ${selection.diversityGaps.join("; ")}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
      exitCode: 0,
    };
  }

  const cacheDir = assertContainedPath(resolve(".verify"), options.cacheDir);
  const reportDir = assertContainedPath(resolve(".verify"), options.reportDir);
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });

  const baseFp = baseFingerprint(options.baseDir, join(reportDir, ".sdlc-cache"));
  const runId = buildRunId(catalog, selection.selected, options.seed, options.count, baseFp);
  const runDir = join(reportDir, runId);
  mkdirSync(runDir, { recursive: true });

  const startedAt = (options.now ?? new Date()).toISOString();
  const results: RepoEvalResult[] = [];

  for (const repo of selection.selected) {
    const checkpointPath = join(runDir, `${hashJson(repo.id).slice(0, 16)}.json`);
    if (!options.force && existsSync(checkpointPath)) {
      const checkpoint = readCheckpoint(checkpointPath, repo, baseFp);
      if (checkpoint) {
        results.push(checkpoint);
        continue;
      }
    }

    const materialized = materializeRepo({
      cacheDir,
      entry: repo,
      catalogEntryHash: cacheEntryHash(repo),
      baseFingerprint: baseFp,
      skipClone: options.skipClone,
      force: options.force,
      timeoutMs: options.repoTimeoutMs,
      git: options.git,
    });
    let result: RepoEvalResult;
    if (materialized.ok) {
      try {
        const setup = options.setupRunner
          ? options.setupRunner(materialized.root)
          : runSetupChain(materialized.root, {
              baseDir: options.baseDir,
              operatingMode: options.mode,
              force: options.force,
              collectArtifacts: false,
            });
        result = {
          ...resultFromSetup(repo, setup, checkpointPath),
          cache: { reused: materialized.reused, root: materialized.root },
        };
      } catch (error) {
        result = {
          ...resultFromSetupError(repo, error, checkpointPath),
          cache: { reused: materialized.reused, root: materialized.root },
        };
      }
    } else {
      result = resultFromCacheFailure(repo, materialized, checkpointPath);
    }
    writeCheckpoint(checkpointPath, result, repo, baseFp);
    results.push(result);
  }

  const report = buildEvalRunReport({
    runId,
    seed: options.seed,
    count: options.count,
    catalogRevision: catalog.catalogRevision,
    startedAt,
    selectedRepoIds: selection.selected.map((repo) => repo.id),
    selectedRepos: selection.selected.map((repo) => ({
      id: repo.id,
      owner: repo.owner,
      repo: repo.repo,
      commit: repo.commit,
      primaryLanguage: repo.primaryLanguage,
      toolTags: repo.toolTags,
      sizeBand: repo.sizeBand,
    })),
    diversityGaps: selection.diversityGaps,
    results,
  });
  const reportPath = join(runDir, "eval-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const failOn = new Set(options.failOnClasses ?? []);
  return {
    report,
    reportPath,
    output: `${renderEvalSummary(report)}\nReport: ${reportPath}`,
    exitCode: hasFailingClass(report, failOn) ? 1 : 0,
  };
}

export function parseFailOnClasses(value: string | undefined): EvalFailureClass[] {
  if (!value) return [];
  const allowedSet = new Set<string>(EVAL_FAILURE_CLASSES);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      if (!allowedSet.has(item)) throw new Error(`unknown failure class '${item}'`);
      return item as EvalFailureClass;
    });
}

function buildRunId(
  catalog: ExternalRepoCatalog,
  repos: ExternalRepoEntry[],
  seed: number,
  count: number,
  baseFp: string,
): string {
  const digest = hashJson({
    baseFingerprint: baseFp,
    catalogRevision: catalog.catalogRevision,
    entries: repos.map((repo) => ({ id: repo.id, hash: cacheEntryHash(repo) })),
  }).slice(0, 12);
  return `seed-${seed}-count-${count}-${digest}`;
}

interface StoredCheckpoint {
  baseFingerprint: string;
  catalogEntryHash: string;
  result: RepoEvalResult;
}

function readCheckpoint(path: string, repo: ExternalRepoEntry, baseFingerprint: string): RepoEvalResult | undefined {
  try {
    const checkpoint = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredCheckpoint>;
    if (checkpoint.baseFingerprint !== baseFingerprint) return undefined;
    if (checkpoint.catalogEntryHash !== cacheEntryHash(repo)) return undefined;
    if (checkpoint.result?.repo?.id !== repo.id) return undefined;
    return checkpoint.result;
  } catch {
    return undefined;
  }
}

function writeCheckpoint(path: string, result: RepoEvalResult, repo: ExternalRepoEntry, baseFingerprint: string): void {
  const checkpoint: StoredCheckpoint = {
    baseFingerprint,
    catalogEntryHash: cacheEntryHash(repo),
    result,
  };
  writeFileSync(path, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}
