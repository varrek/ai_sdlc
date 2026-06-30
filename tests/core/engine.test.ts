import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { buildRegistry } from "../../src/adapters/registry.js";
import { AdapterRegistry } from "../../src/core/adapter-registry.js";
import { compile, EMITTED_MANIFEST_PATH, GAP_REPORT_PATH } from "../../src/core/engine.js";
import { loadBase, loadOverlay } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";
import {
  GENERATED_INSTRUCTION_MARKER,
  type ProjectContext,
} from "../../src/core/project-context.js";
import { makeModel } from "../helpers/model.js";

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

  it("refuses to overwrite user-authored nested hierarchy files", () => {
    const out = freshOut();
    const userPath = join(out, "src/core/CLAUDE.md");
    mkdirSync(dirname(userPath), { recursive: true });
    writeFileSync(userPath, "# User-owned Claude guidance\n", "utf8");

    expect(() =>
      compile(hierarchyModel(), buildRegistry(), { outDir: out, hosts: ["claude-code"] }),
    ).toThrow(/Refusing to overwrite user-authored instruction file 'src\/core\/CLAUDE\.md'/);
  });

  it.each([
    ["copilot", ".github/instructions/src-core.instructions.md"],
    ["cursor", ".cursor/rules/src-core.mdc"],
  ] as const)("refuses to overwrite user-authored %s hierarchy files", (host, path) => {
    const out = freshOut();
    const userPath = join(out, path);
    mkdirSync(dirname(userPath), { recursive: true });
    writeFileSync(userPath, "# User-owned scoped guidance\n", "utf8");

    expect(() =>
      compile(hierarchyModel(), buildRegistry(), { outDir: out, hosts: [host] }),
    ).toThrow(
      new RegExp(`Refusing to overwrite user-authored instruction file '${escapeRegExp(path)}'`),
    );
  });

  it("refuses to overwrite a previously emitted hierarchy file after the marker is removed", () => {
    const out = freshOut();
    const registry = buildRegistry();
    compile(hierarchyModel(), registry, { outDir: out, hosts: ["cursor"] });
    const scopedAgents = join(out, "src/core/AGENTS.md");
    writeFileSync(scopedAgents, "# User replacement without generated marker\n", "utf8");

    expect(() => compile(hierarchyModel(), registry, { outDir: out, hosts: ["cursor"] })).toThrow(
      /Refusing to overwrite user-authored instruction file 'src\/core\/AGENTS\.md'/,
    );
  });
});

function hierarchyModel() {
  return makeModel({ projectContext: hierarchyContext() });
}

function hierarchyContext(): ProjectContext {
  const body = [
    GENERATED_INSTRUCTION_MARKER,
    "",
    "# `src/core` local guidance",
    "",
    "Role: Source module.",
    "",
  ].join("\n");
  return {
    packages: [],
    map: [{ path: "src/core", role: "Source module", sources: ["src/core"] }],
    exclusions: [],
    instructionHierarchy: {
      version: 1,
      scopes: [
        {
          path: "src/core",
          kind: "module",
          role: "Source module",
          sources: ["src/core"],
          instructionBody: body,
          hostTargets: [
            "src/core/CLAUDE.md",
            "src/core/AGENTS.md",
            ".cursor/rules/src-core.mdc",
            ".github/instructions/src-core.instructions.md",
          ],
          ownership: "generated",
          accepted: true,
        },
      ],
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
