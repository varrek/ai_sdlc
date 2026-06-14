import { describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { CopilotAdapter } from "../../src/adapters/copilot/index.js";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { HostManifest } from "../../src/schema/index.js";
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
    const gap = result.gaps.find((g) => g.capability === "approved-gate-hook");
    expect(gap?.host).toBe("copilot");
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
