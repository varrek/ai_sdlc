import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MINER_IGNORE_DIR_SET } from "../core/miner-exclusions.js";
import { fingerprint } from "./setup-state.js";

/** Directories never mined — see `MINER_IGNORE_DIR_SET` in core/miner-exclusions. */
const IGNORE_DIRS = MINER_IGNORE_DIR_SET;

export const WALK_DEPTH = 8;

/** Repo-relative paths under `root`, excluding generated and emitted artifacts. */
export function walk(root: string, excluded: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (IGNORE_DIRS.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (depth < WALK_DEPTH) visit(abs, depth + 1);
      } else {
        const rel = relative(root, abs);
        if (excluded.has(rel) || isGeneratedArtifact(rel)) continue;
        out.push(rel);
      }
    }
  };
  visit(root, 0);
  return out.sort();
}

/** True when `rel` names ai-sdlc emitted config rather than user source. */
export function isGeneratedArtifact(rel: string): boolean {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (base === "AGENTS.md" || base === "CLAUDE.md") return true;
  if (rel === ".mcp.json" || rel === ".vscode/mcp.json" || rel === "portability.gap.yml")
    return true;
  if (rel === ".github/copilot-instructions.md") return true;
  if (rel === ".github/workflows/sdlc-gate.yml") return true;
  return (
    rel.startsWith(".cursor/rules/") ||
    rel.startsWith(".github/agents/") ||
    rel.startsWith(".github/skills/") ||
    rel.startsWith(".github/hooks/") ||
    rel.startsWith(".github/instructions/") ||
    rel.startsWith(".kiro/")
  );
}

/** Paths recorded in `.sdlc/emitted.json` from a prior compile. */
export function readEmittedPaths(root: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(join(root, ".sdlc", "emitted.json"), "utf8")) as {
      files?: unknown;
    };
    if (Array.isArray(parsed.files)) {
      return new Set(parsed.files.filter((p): p is string => typeof p === "string"));
    }
  } catch {
    /* no manifest yet */
  }
  return new Set();
}

/** Fingerprint of the walked inventory — invalidates mined snapshots when files change. */
export function repoInventoryFingerprint(root: string): string {
  return fingerprint([walk(root, readEmittedPaths(root)).join("\n")]);
}
