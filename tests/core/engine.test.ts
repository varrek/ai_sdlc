import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { buildRegistry } from "../../src/adapters/registry.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { AdapterRegistry } from "../../src/core/adapter-registry.js";
import { compile, EMITTED_MANIFEST_PATH, GAP_REPORT_PATH } from "../../src/core/engine.js";
import { loadBase, loadOverlay } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";
import { rmSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const baseDir = join(repoRoot, "sdlc-base");

const tmpDirs: string[] = [];
function freshOut(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function model() {
  return mergeOverlay(loadBase(baseDir), loadOverlay(undefined));
}

describe("compile engine", () => {
  it("is idempotent — two compiles produce byte-identical output", () => {
    const out = freshOut();
    const registry = buildRegistry();

    compile(model(), registry, { outDir: out });
    const first = readFileSync(join(out, "AGENTS.md"));
    const firstGap = readFileSync(join(out, GAP_REPORT_PATH));

    compile(model(), registry, { outDir: out });
    const second = readFileSync(join(out, "AGENTS.md"));
    const secondGap = readFileSync(join(out, GAP_REPORT_PATH));

    expect(second.equals(first)).toBe(true);
    expect(secondGap.equals(firstGap)).toBe(true);
  });

  it("records a host capability gap with reason + host", () => {
    const out = freshOut();
    compile(model(), buildRegistry(), { outDir: out });
    const report = parseYaml(readFileSync(join(out, GAP_REPORT_PATH), "utf8")) as {
      gaps: { host: string; capability: string; reason: string }[];
    };
    const copilotGaps = report.gaps.filter((g) => g.host === "copilot");
    expect(copilotGaps.length).toBeGreaterThanOrEqual(2);
    const gateGap = copilotGaps.find((g) => g.capability === "approved-gate-hook");
    expect(gateGap).toBeDefined();
    expect(gateGap!.reason).toMatch(/no PreToolUse hook/i);
    const mcpGap = copilotGaps.find((g) => g.capability === "per-role-mcp-hook");
    expect(mcpGap).toBeDefined();
    expect(mcpGap!.reason).toMatch(/partial enforcement/i);
  });

  it("dispatches only to hosts requested", () => {
    const out = freshOut();
    const result = compile(model(), buildRegistry(), { outDir: out, hosts: ["cursor"] });
    // Cursor emits no gaps, so only the (empty) gap report should exist beyond AGENTS.md.
    expect(result.gaps).toHaveLength(0);
  });

  it("emits a gap when a requested host has no adapter", () => {
    const out = freshOut();
    const partial = new AdapterRegistry().register(new CursorAdapter());
    const result = compile(model(), partial, { outDir: out, hosts: ["cursor", "claude-code"] });
    const missing = result.gaps.find((g) => g.capability === "adapter");
    expect(missing).toBeDefined();
    expect(missing!.host).toBe("claude-code");
  });

  it("prunes orphaned files left by a previous compile", () => {
    const out = freshOut();
    // Seed a stale emitted file + manifest claiming it was produced last time.
    const stalePath = join(out, "stale", "old.txt");
    mkdirSync(dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, "stale");
    mkdirSync(join(out, ".sdlc"), { recursive: true });
    writeFileSync(
      join(out, EMITTED_MANIFEST_PATH),
      JSON.stringify({ version: 1, files: ["stale/old.txt", "AGENTS.md"] }),
    );

    const result = compile(model(), buildRegistry(), { outDir: out });

    expect(existsSync(stalePath)).toBe(false);
    expect(result.pruned).toContain("stale/old.txt");
  });
});
