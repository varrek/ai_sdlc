import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { KiroAdapter } from "../../src/adapters/kiro/index.js";
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
    const policy = JSON.parse(files.get(".cursor/sdlc/role-policy.json")!) as Record<
      string,
      unknown
    >;
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
    const hook = JSON.parse(files.get(".github/hooks/approved-gate.json")!) as {
      hooks: { preToolUse?: { command?: string; bash?: string }[] };
    };
    expect(hook.hooks.preToolUse?.[0]?.bash).toContain("approved-gate.mjs");
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

  it("copilot CI emits block scalars for multiline test commands", () => {
    const m = makeModel({
      roles: [makeRole("engineer", "write", [])],
      overlay: Overlay.parse({
        version: 1,
        interviewAnswers: { "test-command": "make test\nmake lint" },
      }),
    });
    const workflow = byPath(new CopilotAdapter().emit(m).files).get(
      ".github/workflows/sdlc-gate.yml",
    )!;
    expect(workflow).toContain("run: |");
    expect(workflow).toContain("make test");
    expect(workflow).toContain("make lint");
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

  it("kiro emits PreToolUse hooks and role policy", () => {
    const result = new KiroAdapter().emit(model);
    const files = byPath(result.files);
    const hooks = JSON.parse(files.get(".kiro/hooks/sdlc-gates.json")!) as {
      hooks: { name: string; trigger: string; matcher: string; action: { command: string } }[];
    };
    expect(hooks.hooks).toHaveLength(3);
    expect(hooks.hooks.every((hook) => hook.trigger === "PreToolUse")).toBe(true);
    expect(hooks.hooks.map((hook) => hook.action.command)).toEqual(
      expect.arrayContaining([
        "node ./.kiro/hooks/approved-gate.mjs",
        "node ./.kiro/hooks/tool-gate.mjs",
        "node ./.kiro/hooks/mcp-gate.mjs",
      ]),
    );
    expect(hooks.hooks.find((hook) => hook.name === "sdlc-approved-gate")?.matcher).toContain(
      "fs_write",
    );
    expect(hooks.hooks.find((hook) => hook.name === "sdlc-approved-gate")?.matcher).toContain(
      "str_replace",
    );
    expect(hooks.hooks.find((hook) => hook.name === "sdlc-approved-gate")?.matcher).toContain(
      "edit",
    );
    expect(hooks.hooks.find((hook) => hook.name === "sdlc-approved-gate")?.matcher).toContain(
      "execute_bash",
    );
    expect(files.has(".kiro/sdlc/role-policy.json")).toBe(true);
    expect(result.gaps.map((gap) => gap.capability)).toEqual(
      expect.arrayContaining(["approved-gate-hook", "per-role-hook-policy"]),
    );
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

describe("approved gate runtime", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  const hostScripts = [
    ["claude", new ClaudeCodeAdapter(), ".claude/hooks/approved-gate.mjs"],
    ["cursor", new CursorAdapter(), ".cursor/hooks/approved-gate.mjs"],
    ["copilot", new CopilotAdapter(), ".github/hooks/approved-gate.mjs"],
    ["codex", new CodexAdapter(), ".codex/hooks/approved-gate.mjs"],
    ["kiro", new KiroAdapter(), ".kiro/hooks/approved-gate.mjs"],
  ] as const;

  function install(files: Map<string, string>, scriptRel: string): string {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-approvedgate-"));
    for (const rel of [scriptRel, ".sdlc/hooks/record-loop-event.mjs"]) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), files.get(rel)!);
    }
    return join(dir, scriptRel);
  }

  function installGateOnly(files: Map<string, string>, scriptRel: string): string {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-approvedgate-"));
    mkdirSync(join(dir, scriptRel, ".."), { recursive: true });
    writeFileSync(join(dir, scriptRel), files.get(scriptRel)!);
    return join(dir, scriptRel);
  }

  for (const [host, adapter, scriptRel] of hostScripts) {
    it(`${host} blocks when approval is missing`, () => {
      const files = byPath(adapter.emit(model).files);
      expect(files.get(scriptRel)).not.toContain("npx");
      const script = install(files, scriptRel);
      expect(runApprovedGate(script, {})).toBe(2);
      expect(existsSync(join(dir, ".sdlc", "loop_history", "events.jsonl"))).toBe(false);
    });

    it(`${host} records approval locally`, () => {
      const files = byPath(adapter.emit(model).files);
      const script = install(files, scriptRel);
      const env = {
        SDLC_APPROVED: "1",
        SDLC_TASK_ID: "T-123",
        SDLC_ACTIVE_ROLE: "engineer",
        SDLC_CHECKPOINT: "review",
      };
      expect(runApprovedGate(script, env)).toBe(0);
      const events = readFileSync(join(dir, ".sdlc", "loop_history", "events.jsonl"), "utf8");
      expect(events).toContain('"type":"approval_gate"');
      expect(events).toContain('"taskId":"T-123"');
      expect(JSON.parse(events).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  }

  it("dedupes repeated approvals for the same checkpoint", () => {
    const files = byPath(new CursorAdapter().emit(model).files);
    const script = install(files, ".cursor/hooks/approved-gate.mjs");
    const env = {
      SDLC_APPROVED: "1",
      SDLC_TASK_ID: "T-123",
      SDLC_ACTIVE_ROLE: "engineer",
      SDLC_CHECKPOINT: "before-reviewer",
    };

    expect(runApprovedGate(script, env)).toBe(0);
    expect(runApprovedGate(script, env)).toBe(0);

    const events = readFileSync(join(dir, ".sdlc", "loop_history", "events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(events).toHaveLength(1);
  });

  it("allows approved actions when local recording fails", () => {
    const files = byPath(new CursorAdapter().emit(model).files);
    const script = installGateOnly(files, ".cursor/hooks/approved-gate.mjs");

    expect(runApprovedGate(script, { SDLC_APPROVED: "1", SDLC_TASK_ID: "T-123" })).toBe(0);
    expect(existsSync(join(dir, ".sdlc", "loop_history", "events.jsonl"))).toBe(false);
  });

  function runApprovedGate(script: string, env: Record<string, string>): number {
    try {
      execFileSync("node", [script], { cwd: dir, env: { ...process.env, ...env } });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? 1;
    }
  }
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

  function run(script: string, input: object, env: Record<string, string> = {}): number {
    try {
      execFileSync("node", [script], {
        cwd: dir,
        input: JSON.stringify(input),
        env: { ...process.env, ...env },
      });
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

  it("fails closed when the policy file exists but is malformed", () => {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-mcpgate-"));
    const files = byPath(new CursorAdapter().emit(model).files);
    const scriptRel = ".cursor/hooks/mcp-gate.mjs";
    mkdirSync(join(dir, ".cursor", "hooks"), { recursive: true });
    writeFileSync(join(dir, scriptRel), files.get(scriptRel)!);
    mkdirSync(join(dir, ".cursor", "sdlc"), { recursive: true });
    writeFileSync(join(dir, ".cursor", "sdlc", "role-policy.json"), "{not-json");
    expect(run(join(dir, scriptRel), { role: "engineer", server_name: "gitlab-prod" })).toBe(2);
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

  function run(script: string, input: object, env: Record<string, string> = {}): number {
    try {
      execFileSync("node", [script], {
        cwd: dir,
        input: JSON.stringify(input),
        env: { ...process.env, ...env },
      });
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

describe("kiro gates runtime (fail-closed least-privilege)", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const files = byPath(new KiroAdapter().emit(model).files);

  function install(
    scriptRel: ".kiro/hooks/mcp-gate.mjs" | ".kiro/hooks/tool-gate.mjs",
    policy: Record<string, { posture: string; servers: string[] }> | null,
  ): string {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-kiro-gate-"));
    mkdirSync(join(dir, ".kiro", "hooks"), { recursive: true });
    writeFileSync(join(dir, scriptRel), files.get(scriptRel)!);
    if (policy) {
      mkdirSync(join(dir, ".kiro", "sdlc"), { recursive: true });
      writeFileSync(join(dir, ".kiro", "sdlc", "role-policy.json"), JSON.stringify(policy));
    }
    return join(dir, scriptRel);
  }

  function run(script: string, input: object, env: Record<string, string> = {}): number {
    try {
      execFileSync("node", [script], {
        cwd: dir,
        input: JSON.stringify(input),
        env: { ...process.env, ...env },
      });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? 1;
    }
  }

  const policy = {
    engineer: { posture: "write", servers: ["gitlab-prod"] },
    reviewer: { posture: "read-only", servers: [] },
    tester: { posture: "read-run", servers: [] },
  };

  it("allows a known role calling a server it is permitted to reach", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", policy);
    expect(
      run(s, { tool_name: "@gitlab-prod/create_issue" }, { SDLC_ACTIVE_ROLE: "engineer" }),
    ).toBe(0);
  });

  it("allows MCP calls using SDLC_ACTIVE_ROLE when Kiro payload has no role field", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", policy);
    expect(
      run(
        s,
        { hook_event_name: "preToolUse", tool_name: "@gitlab-prod/create_issue", tool_input: {} },
        { SDLC_ACTIVE_ROLE: "engineer" },
      ),
    ).toBe(0);
  });

  it("prefers SDLC_ACTIVE_ROLE over speculative payload role aliases", () => {
    const s = install(".kiro/hooks/tool-gate.mjs", policy);
    expect(
      run(s, { agent: "engineer", tool_name: "fs_write" }, { SDLC_ACTIVE_ROLE: "reviewer" }),
    ).toBe(2);
  });

  it("parses Codex-style MCP names defensively when Kiro reports them", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", policy);
    expect(
      run(s, { tool_name: "mcp__gitlab-prod__do_thing" }, { SDLC_ACTIVE_ROLE: "engineer" }),
    ).toBe(0);
    expect(
      run(s, { tool_name: "mcp__jira-prod__do_thing" }, { SDLC_ACTIVE_ROLE: "engineer" }),
    ).toBe(2);
  });

  it("denies a known role calling a server outside its allowlist", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", policy);
    expect(run(s, { tool_name: "@jira-prod/create_issue" }, { SDLC_ACTIVE_ROLE: "engineer" })).toBe(
      2,
    );
  });

  it("denies (fail-closed) when the active role is missing", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", policy);
    expect(run(s, { tool_name: "@gitlab-prod/create_issue" })).toBe(2);
  });

  it("denies (fail-closed) when the role is unknown to the policy", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", policy);
    expect(run(s, { tool_name: "@gitlab-prod/create_issue" }, { SDLC_ACTIVE_ROLE: "ghost" })).toBe(
      2,
    );
  });

  it("denies malformed MCP tool names when a policy exists", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", policy);
    expect(run(s, { tool_name: "@" }, { SDLC_ACTIVE_ROLE: "engineer" })).toBe(2);
    expect(run(s, {}, { SDLC_ACTIVE_ROLE: "engineer" })).toBe(2);
  });

  it("is inert when no MCP policy file is present", () => {
    const s = install(".kiro/hooks/mcp-gate.mjs", null);
    expect(run(s, { role: "ghost", tool_name: "@gitlab-prod/create_issue" })).toBe(0);
  });

  it("denies write and shell tools for read-only roles", () => {
    const s = install(".kiro/hooks/tool-gate.mjs", policy);
    const env = { SDLC_ACTIVE_ROLE: "reviewer" };
    expect(run(s, { tool_name: "write" }, env)).toBe(2);
    expect(run(s, { tool_name: "shell" }, env)).toBe(2);
    expect(run(s, { tool_name: "fs_write" }, env)).toBe(2);
    expect(run(s, { tool_name: "str_replace" }, env)).toBe(2);
    expect(run(s, { tool_name: "edit" }, env)).toBe(2);
    expect(run(s, { tool_name: "execute_bash" }, env)).toBe(2);
  });

  it("denies mutating tools when the active role is missing or unknown", () => {
    const s = install(".kiro/hooks/tool-gate.mjs", policy);
    expect(run(s, { tool_name: "fs_write" })).toBe(2);
    expect(run(s, { tool_name: "execute_bash" }, { SDLC_ACTIVE_ROLE: "ghost" })).toBe(2);
    expect(run(s, {}, { SDLC_ACTIVE_ROLE: "engineer" })).toBe(2);
  });

  it("allows shell but denies write tools for read-run roles", () => {
    const s = install(".kiro/hooks/tool-gate.mjs", policy);
    const env = { SDLC_ACTIVE_ROLE: "tester" };
    expect(run(s, { tool_name: "execute_bash" }, env)).toBe(0);
    expect(run(s, { tool_name: "fs_write" }, env)).toBe(2);
    expect(run(s, { tool_name: "str_replace" }, env)).toBe(2);
  });

  it("allows write tools for write-posture roles", () => {
    const s = install(".kiro/hooks/tool-gate.mjs", policy);
    expect(run(s, { tool_name: "write" }, { SDLC_ACTIVE_ROLE: "engineer" })).toBe(0);
  });

  it("allows mutating tools when no posture policy file is present", () => {
    const s = install(".kiro/hooks/tool-gate.mjs", null);
    expect(run(s, { role: "ghost", tool_name: "fs_write" })).toBe(0);
  });
});
