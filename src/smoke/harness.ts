import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { portableSkillPath } from "../adapters/shared/skill-file.js";
import type { NeutralModel } from "../core/types.js";
import { reviewIsApproved, runCannedTask } from "./canned-task.js";

export interface SmokeCheck {
  name: string;
  ok: boolean;
  reason?: string;
}

export interface SmokeResult {
  passed: boolean;
  checks: SmokeCheck[];
  logPath?: string;
}

export interface SmokeOptions {
  model: NeutralModel;
  /** Directory the config was compiled into. */
  configDir: string;
  /** Defaults to `<configDir>/.sdlc`. */
  sdlcDir?: string;
  /**
   * Server ids backed by an in-memory mock for this run. Defaults to every
   * bound integration — the happy path needs no live credentials. Pass a subset
   * (or `[]`) to simulate a missing mock/credential.
   */
  mocks?: string[];
}

/**
 * Run the smoke validation gate: verify the generated config is well-formed and
 * push a trivial change through mock Engineer→Reviewer stages with MCP mocks.
 * Writes a pass/fail log to `.sdlc/validation.log`. This is the hard exit
 * criterion for "customize complete".
 */
export function runSmoke(options: SmokeOptions): SmokeResult {
  const { model, configDir } = options;
  const sdlcDir = options.sdlcDir ?? join(configDir, ".sdlc");
  const boundServers = boundServerIds(model);
  const mocks = new Set(options.mocks ?? boundServers);

  const checks: SmokeCheck[] = [];

  checks.push({
    name: "constitution-present",
    ok: existsSync(join(configDir, "AGENTS.md")),
    reason: "AGENTS.md missing from generated config",
  });

  for (const skill of model.skills) {
    const rel = portableSkillPath(skill);
    checks.push({
      name: `skill-resolves:${skill.frontmatter.name}`,
      ok: existsSync(join(configDir, rel)),
      reason: `expected emitted skill at ${rel}`,
    });
  }

  const engineer = model.roles.find((r) => r.frontmatter.name === "engineer");
  const reviewer = model.roles.find((r) => r.frontmatter.name === "reviewer");
  checks.push({ name: "engineer-role-present", ok: Boolean(engineer), reason: "no engineer role" });
  checks.push({ name: "reviewer-role-present", ok: Boolean(reviewer), reason: "no reviewer role" });
  checks.push({
    name: "reviewer-read-only",
    ok: reviewer?.frontmatter.posture === "read-only",
    reason: "reviewer must be read-only (least-privilege)",
  });

  const tester = model.roles.find((r) => r.frontmatter.name === "tester");
  if (tester) {
    checks.push({
      name: "tester-read-run",
      ok: tester.frontmatter.posture === "read-run",
      reason: "tester must be read-run (runs tests, never writes)",
    });
  }

  for (const serverId of boundServers) {
    checks.push({
      name: `mcp-mock:${serverId}`,
      ok: mocks.has(serverId),
      reason: `no mock or credentials for MCP server '${serverId}'`,
    });
  }

  // Mock Engineer -> Reviewer cycle on the canned trivial change.
  const outcome = runCannedTask();
  checks.push({
    name: "engineer-applies-change",
    ok: outcome.after !== outcome.before,
    reason: "engineer produced no change",
  });
  checks.push({
    name: "reviewer-approves",
    ok: reviewIsApproved(outcome),
    reason: "reviewer rejected the canned change",
  });

  const passed = checks.every((c) => c.ok);
  const logPath = writeLog(sdlcDir, passed, checks);
  return { passed, checks, logPath };
}

export function smokeExitCode(result: SmokeResult): number {
  return result.passed ? 0 : 1;
}

/** Readiness gate: customize is "ready" only when interview gaps are closed AND smoke passes. */
export function evaluateReadiness(gapCount: number, smoke: SmokeResult): boolean {
  return gapCount === 0 && smoke.passed;
}

function boundServerIds(model: NeutralModel): string[] {
  return [...new Set(Object.values(model.overlay.integrations).map((b) => b.serverId))].sort();
}

function writeLog(sdlcDir: string, passed: boolean, checks: SmokeCheck[]): string {
  const lines = [`SDLC smoke: ${passed ? "PASS" : "FAIL"}`];
  for (const c of checks) {
    lines.push(`- ${c.name}: ${c.ok ? "ok" : `FAIL — ${c.reason ?? "no reason"}`}`);
  }
  if (!passed) {
    lines.push("");
    lines.push("Fix the FAIL items above and re-run `aisdlc smoke`. customize is not ready until this passes.");
  }
  const logPath = join(sdlcDir, "validation.log");
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
  return logPath;
}
