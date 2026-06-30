import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { approvedGateScript, emitLoopEventRecorder } from "../shared/approved-gate.js";
import { buildRolePolicy, stableJson } from "../shared/roles.js";

const KIRO_HOOK_DIR = ".kiro/hooks";
const KIRO_POLICY_REL = ".kiro/sdlc/role-policy.json";
const KIRO_APPROVED_GATE_REL = `${KIRO_HOOK_DIR}/approved-gate.mjs`;
const KIRO_MCP_GATE_REL = `${KIRO_HOOK_DIR}/mcp-gate.mjs`;
const KIRO_TOOL_GATE_REL = `${KIRO_HOOK_DIR}/tool-gate.mjs`;
const KIRO_MUTATING_TOOL_PATTERN =
  "(write|fs_write|fsWrite|file_write|fileWrite|str_replace|strReplace|edit|create|delete|shell|execute_bash|execute_cmd)";
const KIRO_MCP_TOOL_PATTERN = "(@.*|mcp__.*)";

function commandFor(path: string): string {
  return `node ./${path}`;
}

function kiroGateRuntimePreamble(): string {
  return `import { readFileSync } from "node:fs";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return {}; }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

const input = readStdin();
const role = firstString(process.env.SDLC_ACTIVE_ROLE);

let policy = {};
try { policy = JSON.parse(readFileSync("${KIRO_POLICY_REL}", "utf8")); } catch {}

const hasPolicy = Object.keys(policy).length > 0;`;
}

const MCP_GATE_SCRIPT = `#!/usr/bin/env node
// Kiro PreToolUse MCP gate: deny MCP calls a role is not permitted to make.
${kiroGateRuntimePreamble()}

function serverFromToolName(toolName) {
  if (typeof toolName !== "string") return "";
  if (toolName.startsWith("@")) return toolName.slice(1).split("/")[0] ?? "";
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    return parts.length >= 2 ? parts[1] : "";
  }
  return "";
}

const toolName = firstString(input.tool_name, input.toolName, input.tool);
const server = firstString(
  input.server_name,
  input.server,
  input.mcp_server,
  input.mcpServer,
  input.mcp_server_name,
  input.mcpServerName,
  serverFromToolName(toolName),
);

if (hasPolicy) {
  if (!server) {
    console.error("SDLC gate: MCP tool invocation did not include a parseable server id.");
    process.exit(2);
  }
  const entry = policy[role];
  if (!entry || !entry.servers.includes(server)) {
    console.error(\`SDLC gate: role '\${role || "(unset)"}' may not call MCP server '\${server}'.\`);
    process.exit(2);
  }
}
process.exit(0);
`;

const TOOL_GATE_SCRIPT = `#!/usr/bin/env node
// Kiro PreToolUse tool gate: enforce role posture for mutating built-in tools.
${kiroGateRuntimePreamble()}

function normalizedTool(input) {
  const tool = firstString(input.tool_name, input.toolName, input.tool, input.name).toLowerCase();
  if (tool.includes("write")) return "write";
  if (tool.includes("replace")) return "write";
  if (tool.includes("edit")) return "write";
  if (tool.includes("delete")) return "write";
  if (tool.includes("create")) return "write";
  if (tool.includes("shell")) return "shell";
  if (tool.includes("bash")) return "shell";
  if (tool.includes("execute_cmd")) return "shell";
  return tool;
}

function allowed(posture, tool) {
  switch (posture) {
    case "read-only":
      return tool !== "write" && tool !== "shell";
    case "read-run":
      return tool !== "write";
    case "write":
      return true;
    default:
      return false;
  }
}

const tool = normalizedTool(input);

if (hasPolicy) {
  if (tool !== "write" && tool !== "shell") {
    console.error("SDLC gate: mutating tool invocation did not include a parseable tool name.");
    process.exit(2);
  }
  const entry = policy[role];
  if (!entry || !allowed(entry.posture, tool)) {
    console.error(\`SDLC gate: role '\${role || "(unset)"}' may not use Kiro tool '\${tool}'.\`);
    process.exit(2);
  }
}
process.exit(0);
`;

function renderHooks(): string {
  return stableJson({
    version: "v1",
    hooks: [
      {
        name: "sdlc-approved-gate",
        description: "Block mutating tools and MCP calls until the SDLC Approved? gate passes.",
        trigger: "PreToolUse",
        matcher: `^(${KIRO_MUTATING_TOOL_PATTERN}|${KIRO_MCP_TOOL_PATTERN})`,
        action: { type: "command", command: commandFor(KIRO_APPROVED_GATE_REL) },
        timeout: 30,
        enabled: true,
      },
      {
        name: "sdlc-tool-posture-gate",
        description: "Deny write or shell tools for roles whose posture does not allow them.",
        trigger: "PreToolUse",
        matcher: `^${KIRO_MUTATING_TOOL_PATTERN}`,
        action: { type: "command", command: commandFor(KIRO_TOOL_GATE_REL) },
        timeout: 30,
        enabled: true,
      },
      {
        name: "sdlc-mcp-gate",
        description: "Deny MCP calls outside the active role's integration allowlist.",
        trigger: "PreToolUse",
        matcher: `^${KIRO_MCP_TOOL_PATTERN}`,
        action: { type: "command", command: commandFor(KIRO_MCP_GATE_REL) },
        timeout: 30,
        enabled: true,
      },
    ],
  });
}

export function emitGates(model: NeutralModel): EmittedFile[] {
  return [
    { path: `${KIRO_HOOK_DIR}/sdlc-gates.json`, contents: renderHooks() },
    { path: KIRO_POLICY_REL, contents: stableJson(buildRolePolicy(model)) },
    { path: KIRO_MCP_GATE_REL, contents: MCP_GATE_SCRIPT },
    { path: KIRO_TOOL_GATE_REL, contents: TOOL_GATE_SCRIPT },
    { path: KIRO_APPROVED_GATE_REL, contents: approvedGateScript("Kiro") },
    emitLoopEventRecorder(),
  ];
}
