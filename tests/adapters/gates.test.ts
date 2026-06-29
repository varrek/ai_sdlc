import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { HostManifest, Overlay } from "../../src/schema/index.js";
import { makeModel, makeRole } from "../helpers/model.js";

function byPath(files: { path: string; contents: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.contents]));
}

const model = makeModel({ roles: [makeRole("engineer", "write", [])] });

describe("gate emit", () => {
  it("cursor emits a beforeMCPExecution hook keyed to the active role", () => {
    const result = new CursorAdapter().emit(model);
    const files = byPath(result.files);
    const hooks = JSON.parse(files.get(".cursor/hooks.json")!) as {
      hooks: { beforeMCPExecution?: unknown[] };
    };
    expect(hooks.hooks.beforeMCPExecution).toBeDefined();
    expect(files.has(".cursor/sdlc/role-policy.json")).toBe(true);
    const policy = JSON.parse(files.get(".cursor/sdlc/role-policy.json")!) as Record<string, unknown>;
    expect(policy.engineer).toBeDefined();
  });

  it("claude emits a PreToolUse Approved? gate in settings.json", () => {
    const files = byPath(new ClaudeCodeAdapter().emit(model).files);
    const settings = JSON.parse(files.get(".claude/settings.json")!) as {
      hooks: { PreToolUse?: { matcher: string }[] };
    };
    expect(settings.hooks.PreToolUse?.[0]?.matcher).toMatch(/Write/);
  });

  it("copilot emits the instruction+CI fallback and records the IDE-gate gap", () => {
    const result = new CopilotAdapter().emit(model);
    const files = byPath(result.files);
    expect(files.has(".github/workflows/sdlc-gate.yml")).toBe(true);
    expect(files.has(".github/copilot-instructions.md")).toBe(true);
    const gateGap = result.gaps.find((g) => g.capability === "approved-gate-hook");
    expect(gateGap?.host).toBe("copilot");
    const mcpGap = result.gaps.find((g) => g.capability === "per-role-mcp-hook");
    expect(mcpGap?.host).toBe("copilot");
  });

  it("copilot CI runs the mined test command (not a placeholder echo)", () => {
    const m = makeModel({
      roles: [makeRole("engineer", "write", [])],
      overlay: Overlay.parse({
        version: 1,
        interviewAnswers: { "test-command": "pytest -q" },
      }),
    });
    const workflow = byPath(new CopilotAdapter().emit(m).files).get(
      ".github/workflows/sdlc-gate.yml",
    )!;
    expect(workflow).toContain("run: pytest -q");
    expect(workflow).not.toContain("Run the project test command here");
    // Python-flavored command pulls in the matching runtime setup.
    expect(workflow).toContain("actions/setup-python");
  });

  it("copilot CI uses a Node toolchain when the test command is Node-flavored", () => {
    const m = makeModel({
      roles: [makeRole("engineer", "write", [])],
      overlay: Overlay.parse({ version: 1, interviewAnswers: { "test-command": "npm test" } }),
    });
    const workflow = byPath(new CopilotAdapter().emit(m).files).get(
      ".github/workflows/sdlc-gate.yml",
    )!;
    expect(workflow).toContain("actions/setup-node");
    expect(workflow).toContain("run: npm test");
  });

  it("copilot CI keeps the placeholder when no test command was mined", () => {
    const workflow = byPath(new CopilotAdapter().emit(model).files).get(
      ".github/workflows/sdlc-gate.yml",
    )!;
    expect(workflow).toContain("Run the project test command here");
  });

  it("codex emits PreToolUse hooks in config.toml and role policy", () => {
    const result = new CodexAdapter().emit(model);
    const files = byPath(result.files);
    const config = files.get(".codex/config.toml")!;
    expect(config).toContain("[[hooks.PreToolUse]]");
    expect(config).toContain("approved-gate.mjs");
    expect(config).toContain("mcp-gate.mjs");
    expect(files.has(".codex/sdlc/role-policy.json")).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it("copilot omits the CI workflow under gateMode: instructions", () => {
    const instructionsModel = makeModel({
      roles: [makeRole("engineer", "write", [])],
      manifest: HostManifest.parse({
        version: 1,
        hosts: ["copilot"],
        options: { copilot: { gateMode: "instructions" } },
      }),
    });
    const files = byPath(new CopilotAdapter().emit(instructionsModel).files);
    expect(files.has(".github/workflows/sdlc-gate.yml")).toBe(false);
    // The instruction checklist + cloud-agent hook still back the gate.
    expect(files.has(".github/copilot-instructions.md")).toBe(true);
    expect(files.has(".github/hooks/approved-gate.mjs")).toBe(true);
  });
});

/**
 * The MCP least-privilege gate is a runtime artifact, so we exercise the emitted
 * script itself rather than its source text — the regression that matters is its
 * exit code under each role/server combination.
 */
describe("cursor MCP gate runtime (fail-closed least-privilege)", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  function install(policy: Record<string, { posture: string; servers: string[] }> | null): string {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-mcpgate-"));
    const files = byPath(new CursorAdapter().emit(model).files);
    const scriptRel = ".cursor/hooks/mcp-gate.mjs";
    mkdirSync(join(dir, ".cursor", "hooks"), { recursive: true });
    writeFileSync(join(dir, scriptRel), files.get(scriptRel)!);
    if (policy) {
      mkdirSync(join(dir, ".cursor", "sdlc"), { recursive: true });
      writeFileSync(join(dir, ".cursor", "sdlc", "role-policy.json"), JSON.stringify(policy));
    }
    return join(dir, scriptRel);
  }

  function run(script: string, input: object): number {
    try {
      execFileSync("node", [script], { cwd: dir, input: JSON.stringify(input) });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? 1;
    }
  }

  const policy = { engineer: { posture: "write", servers: ["gitlab-prod"] } };

  it("allows a known role calling a server it is permitted to reach", () => {
    const s = install(policy);
    expect(run(s, { role: "engineer", server_name: "gitlab-prod" })).toBe(0);
  });

  it("denies a known role calling a server outside its allowlist", () => {
    const s = install(policy);
    expect(run(s, { role: "engineer", server_name: "jira-prod" })).toBe(2);
  });

  it("denies (fail-closed) when the active role is missing", () => {
    const s = install(policy);
    expect(run(s, { server_name: "gitlab-prod" })).toBe(2);
  });

  it("denies (fail-closed) when the role is unknown to the policy", () => {
    const s = install(policy);
    expect(run(s, { role: "ghost", server_name: "gitlab-prod" })).toBe(2);
  });

  it("is inert when no policy file is present (nothing to enforce)", () => {
    const s = install(null);
    expect(run(s, { role: "ghost", server_name: "gitlab-prod" })).toBe(0);
  });
});

describe("codex MCP gate runtime (fail-closed least-privilege)", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  function install(policy: Record<string, { posture: string; servers: string[] }> | null): string {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-codex-mcpgate-"));
    const files = byPath(new CodexAdapter().emit(model).files);
    const scriptRel = ".codex/hooks/mcp-gate.mjs";
    mkdirSync(join(dir, ".codex", "hooks"), { recursive: true });
    writeFileSync(join(dir, scriptRel), files.get(scriptRel)!);
    if (policy) {
      mkdirSync(join(dir, ".codex", "sdlc"), { recursive: true });
      writeFileSync(join(dir, ".codex", "sdlc", "role-policy.json"), JSON.stringify(policy));
    }
    return join(dir, scriptRel);
  }

  function run(script: string, input: object): number {
    try {
      execFileSync("node", [script], { cwd: dir, input: JSON.stringify(input) });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? 1;
    }
  }

  const policy = { engineer: { posture: "write", servers: ["gitlab-prod"] } };

  it("allows a known role calling a server it is permitted to reach", () => {
    const s = install(policy);
    expect(run(s, { agent_type: "engineer", tool_name: "mcp__gitlab-prod__do_thing" })).toBe(0);
  });

  it("denies a known role calling a server outside its allowlist", () => {
    const s = install(policy);
    expect(run(s, { agent_type: "engineer", tool_name: "mcp__jira-prod__do_thing" })).toBe(2);
  });

  it("denies (fail-closed) when the active role is missing", () => {
    const s = install(policy);
    expect(run(s, { tool_name: "mcp__gitlab-prod__do_thing" })).toBe(2);
  });

  it("denies (fail-closed) when the role is unknown to the policy", () => {
    const s = install(policy);
    expect(run(s, { agent_type: "ghost", tool_name: "mcp__gitlab-prod__do_thing" })).toBe(2);
  });

  it("is inert when no policy file is present (nothing to enforce)", () => {
    const s = install(null);
    expect(run(s, { agent_type: "ghost", tool_name: "mcp__gitlab-prod__do_thing" })).toBe(0);
  });
});
