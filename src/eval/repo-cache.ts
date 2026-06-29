import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { ExternalRepoEntry } from "./catalog.js";
import { redactUntrustedText } from "./redact.js";
import type { EvalFailureClass } from "./report.js";

export type RepoCacheFailureClass = Extract<
  EvalFailureClass,
  "network" | "upstream-drift" | "workflow-error" | "scale-timeout"
>;

export interface GitRunner {
  run(args: string[], options?: { cwd?: string; timeoutMs?: number }): void;
}

export interface RepoCacheOptions {
  cacheDir: string;
  entry: ExternalRepoEntry;
  catalogEntryHash: string;
  baseFingerprint: string;
  skipClone?: boolean;
  force?: boolean;
  timeoutMs?: number;
  symlinkScanLimit?: number;
  git?: GitRunner;
}

export interface RepoCacheHit {
  ok: true;
  root: string;
  reused: boolean;
}

export interface RepoCacheMiss {
  ok: false;
  failureClass: RepoCacheFailureClass;
  message: string;
}

export type RepoCacheResult = RepoCacheHit | RepoCacheMiss;

interface CacheMetadata {
  entryId: string;
  commit: string;
  catalogEntryHash: string;
  baseFingerprint: string;
}

const metadataFile = ".aisdlc-eval-cache.json";
const DEFAULT_SYMLINK_SCAN_LIMIT = 500_000;
const defaultGitRunner: GitRunner = {
  run(args, options) {
    execFileSync("git", args, {
      cwd: options?.cwd,
      timeout: options?.timeoutMs,
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });
  },
};

export function materializeRepo(options: RepoCacheOptions): RepoCacheResult {
  const cacheDir = resolve(options.cacheDir);
  const root = join(cacheDir, cacheKey(options.entry, options.catalogEntryHash));
  if (!isWithin(cacheDir, root)) {
    return {
      ok: false,
      failureClass: "workflow-error",
      message: "cache path escaped cache directory",
    };
  }

  mkdirSync(cacheDir, { recursive: true });
  const expected: CacheMetadata = {
    entryId: options.entry.id,
    commit: options.entry.commit,
    catalogEntryHash: options.catalogEntryHash,
    baseFingerprint: options.baseFingerprint,
  };

  if (!options.force && cacheMatches(root, expected)) {
    const symlinkFailure = firstOutboundSymlink(
      root,
      options.symlinkScanLimit ?? DEFAULT_SYMLINK_SCAN_LIMIT,
    );
    if (symlinkFailure) {
      rmSync(root, { recursive: true, force: true });
      return {
        ok: false,
        failureClass: classifySymlinkFailure(symlinkFailure),
        message: symlinkFailure,
      };
    }
    return { ok: true, root, reused: true };
  }

  if (options.skipClone) {
    return {
      ok: false,
      failureClass: "workflow-error",
      message: `cache miss for ${options.entry.id} with --skip-clone`,
    };
  }

  rmSync(root, { recursive: true, force: true });

  const git = options.git ?? defaultGitRunner;
  const url = `https://github.com/${options.entry.owner}/${options.entry.repo}.git`;
  try {
    git.run(["clone", "--no-checkout", "--filter=blob:none", url, root], {
      timeoutMs: options.timeoutMs,
    });
    git.run(["-C", root, "fetch", "--depth", "1", "origin", options.entry.commit], {
      timeoutMs: options.timeoutMs,
    });
    git.run(
      [
        "-C",
        root,
        "-c",
        "credential.helper=",
        "-c",
        "core.hooksPath=/dev/null",
        "checkout",
        "--detach",
        options.entry.commit,
      ],
      { timeoutMs: options.timeoutMs },
    );
    const symlinkFailure = firstOutboundSymlink(
      root,
      options.symlinkScanLimit ?? DEFAULT_SYMLINK_SCAN_LIMIT,
    );
    if (symlinkFailure) {
      rmSync(root, { recursive: true, force: true });
      return {
        ok: false,
        failureClass: classifySymlinkFailure(symlinkFailure),
        message: symlinkFailure,
      };
    }
    writeFileSync(join(root, metadataFile), `${JSON.stringify(expected, null, 2)}\n`, "utf8");
    return { ok: true, root, reused: false };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    return {
      ok: false,
      failureClass: classifyGitFailure(error),
      message: error instanceof Error ? redactUntrustedText(error.message) : "git clone failed",
    };
  }
}

export function cacheEntryHash(entry: ExternalRepoEntry): string {
  return hashJson(entry);
}

export function cacheKey(entry: ExternalRepoEntry, catalogEntryHash: string): string {
  return `${safeSegment(basename(entry.owner))}-${safeSegment(basename(entry.repo))}-${entry.commit.slice(0, 12)}-${catalogEntryHash.slice(0, 12)}`;
}

export function assertContainedPath(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  if (!isWithin(resolvedRoot, resolvedCandidate)) {
    throw new Error(`path '${candidate}' must stay under '${root}'`);
  }
  return resolvedCandidate;
}

export function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cacheMatches(root: string, expected: CacheMetadata): boolean {
  const metadataPath = join(root, metadataFile);
  if (!existsSync(metadataPath)) return false;
  try {
    const raw = JSON.parse(readFileSync(metadataPath, "utf8")) as CacheMetadata;
    return (
      raw.entryId === expected.entryId &&
      raw.commit === expected.commit &&
      raw.catalogEntryHash === expected.catalogEntryHash &&
      raw.baseFingerprint === expected.baseFingerprint
    );
  } catch {
    return false;
  }
}

function firstOutboundSymlink(root: string, maxEntries: number): string | undefined {
  let resolvedRoot: string;
  try {
    resolvedRoot = realpathSync(root);
  } catch (error) {
    return symlinkScanFailure(root, error);
  }
  const stack = [resolvedRoot];
  let visited = 0;
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (error) {
      return symlinkScanFailure(dir, error);
    }
    for (const name of names) {
      if (name === ".git") continue;
      const path = join(dir, name);
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(path);
      } catch (error) {
        return symlinkScanFailure(path, error);
      }
      visited++;
      if (visited > maxEntries) return `repo exceeded symlink scan entry limit (${maxEntries})`;
      if (stat.isSymbolicLink()) {
        let target: string;
        try {
          target = realpathSync(path);
        } catch (error) {
          return symlinkScanFailure(path, error);
        }
        if (!isWithin(resolvedRoot, target)) return `repo contains outbound symlink at ${path}`;
      } else if (stat.isDirectory()) {
        stack.push(path);
      }
    }
  }
  return undefined;
}

function symlinkScanFailure(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactUntrustedText(`repo symlink scan failed at ${path}: ${message}`);
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

function classifyGitFailure(error: unknown): RepoCacheFailureClass {
  const message = error instanceof Error ? error.message : "";
  if (/timed out|ETIMEDOUT|SIGTERM|timeout/i.test(message)) return "scale-timeout";
  if (/not our ref|reference is not a tree|couldn't find remote ref/i.test(message))
    return "upstream-drift";
  return "network";
}

function classifySymlinkFailure(message: string): RepoCacheFailureClass {
  return message.includes("symlink scan entry limit") ? "scale-timeout" : "workflow-error";
}
