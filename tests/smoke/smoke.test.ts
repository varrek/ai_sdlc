import { mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildRegistry } from "../../src/adapters/registry.js";
import { runSmokeCli } from "../../src/cli/smoke.js";
import { compile } from "../../src/core/engine.js";
import { Overlay } from "../../src/schema/index.js";
import { evaluateReadiness, runSmoke, smokeExitCode } from "../../src/smoke/harness.js";
import { makeContract, makeModel, makeRole, makeSkill } from "../helpers/model.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function freshOut(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-smoke-"));
  tmpDirs.push(dir);
  return dir;
}

function loopModel() {
  return makeModel({
    roles: [makeRole("engineer", "write", ["gitlab"]), makeRole("reviewer", "read-only", [])],
    skills: [makeSkill("sdlc-loop")],
    integrations: [makeContract("gitlab")],
    overlay: Overlay.parse({
      version: 1,
      integrations: { gitlab: { serverId: "gitlab-mcp", allowedRoles: ["engineer"] } },
    }),
  });
}

function compiled(model = loopModel()): { model: ReturnType<typeof loopModel>; configDir: string } {
  const configDir = freshOut();
  compile(model, buildRegistry(), { outDir: configDir });
  return { model, configDir };
}

describe("smoke gate", () => {
  it("passes on a correctly generated config and writes a PASS log", () => {
    const { model, configDir } = compiled();
    const result = runSmoke({ model, configDir });

    expect(result.passed).toBe(true);
    expect(smokeExitCode(result)).toBe(0);
    expect(evaluateReadiness(0, result)).toBe(true);
    const log = readFileSync(result.logPath!, "utf8");
    expect(log).toContain("SDLC smoke: PASS");
  });

  it("fails with a specific reason when an expected skill file is missing", () => {
    const { model, configDir } = compiled();
    unlinkSync(join(configDir, ".agents/skills/sdlc-loop/SKILL.md"));

    const result = runSmoke({ model, configDir });
    expect(result.passed).toBe(false);
    const failed = result.checks.find((c) => c.name === "skill-resolves:sdlc-loop");
    expect(failed?.ok).toBe(false);
    expect(readFileSync(result.logPath!, "utf8")).toContain("FAIL");
  });

  it("fails when a bound MCP server has no mock/credentials", () => {
    const { model, configDir } = compiled();
    const result = runSmoke({ model, configDir, mocks: [] });
    expect(result.passed).toBe(false);
    const mcp = result.checks.find((c) => c.name === "mcp-mock:gitlab-mcp");
    expect(mcp?.ok).toBe(false);
    expect(mcp?.reason).toMatch(/no mock or credentials/);
  });

  it("readiness is false when smoke fails even with no interview gaps", () => {
    const { model, configDir } = compiled();
    const result = runSmoke({ model, configDir, mocks: [] });
    expect(evaluateReadiness(0, result)).toBe(false);
    expect(smokeExitCode(result)).toBe(1);
  });
});

describe("runSmokeCli chain gate", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const baseDir = resolve(here, "..", "..", "sdlc-base");
  const repo = (name: string) => resolve(here, "..", "fixtures", "sample-repos", name);

  it("reports setup-ready when the base gates pass and the repo has a mined test command", () => {
    const out = freshOut();
    const cli = runSmokeCli({
      baseDir,
      configDir: out,
      compileFirst: true,
      repoRoot: repo("python-rags"),
    });
    expect(cli.result.passed).toBe(true);
    expect(cli.blockingGapCount).toBe(0);
    expect(cli.setupReady).toBe(true);
    // A bare base overlay binds no integrations, so both are deferred (not blocking).
    expect(cli.deferredIntegrations).toEqual(expect.arrayContaining(["gitlab", "jira"]));
  });

  it("is not setup-ready when the repo has no runnable test command, even though smoke passes", () => {
    const out = freshOut();
    const cli = runSmokeCli({
      baseDir,
      configDir: out,
      compileFirst: true,
      repoRoot: repo("thin-poc"),
    });
    expect(cli.result.passed).toBe(true);
    expect(cli.blockingGapCount).toBeGreaterThan(0);
    expect(cli.setupReady).toBe(false);
  });
});
