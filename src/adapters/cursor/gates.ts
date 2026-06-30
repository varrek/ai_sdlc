import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { approvedGateScript, emitLoopEventRecorder } from "../shared/approved-gate.js";
import { buildRolePolicy, stableJson } from "../shared/roles.js";

const MCP_GATE_SCRIPT = `#!/usr/bin/env node
// Cursor beforeMCPExecution gate: deny MCP calls a role is not permitted to make.
// Enforces per-role least-privilege that Cursor's global mcpAllowlist cannot.
import { existsSync, readFileSync } from "node:fs";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return {}; }
}

const input = readStdin();
const role = input.role ?? process.env.SDLC_ACTIVE_ROLE ?? "";
const server = input.server_name ?? input.server ?? "";

const policyPath = ".cursor/sdlc/role-policy.json";
let policy = {};
if (existsSync(policyPath)) {
  try {
    policy = JSON.parse(readFileSync(policyPath, "utf8"));
  } catch {
    console.error("SDLC gate: role policy exists but could not be parsed.");
    process.exit(2);
  }
}

// Fail CLOSED: when a role policy exists, an MCP call is only allowed if the
// active role is known AND explicitly permits this server. A missing/unknown
// role (e.g. the orchestrator forgot to set SDLC_ACTIVE_ROLE) is denied rather
// than granted blanket access — otherwise least-privilege silently disappears.
const hasPolicy = Object.keys(policy).length > 0;
if (server && hasPolicy) {
  const entry = policy[role];
  if (!entry || !entry.servers.includes(server)) {
    console.error(\`SDLC gate: role '\${role || "(unset)"}' may not call MCP server '\${server}'.\`);
    process.exit(2);
  }
}
process.exit(0);
`;

/**
 * Cursor gate: a `beforeMCPExecution` hook keyed to the active role (MCP
 * least-privilege) plus a `stop`-stage Approved? gate. Hook scripts read the
 * generated role policy so behavior tracks the neutral source.
 */
export function emitGates(model: NeutralModel): EmittedFile[] {
  const hooks = {
    version: 1,
    hooks: {
      beforeMCPExecution: [{ command: "node ./.cursor/hooks/mcp-gate.mjs" }],
      stop: [{ command: "node ./.cursor/hooks/approved-gate.mjs" }],
    },
  };

  return [
    { path: ".cursor/hooks.json", contents: stableJson(hooks) },
    { path: ".cursor/sdlc/role-policy.json", contents: stableJson(buildRolePolicy(model)) },
    { path: ".cursor/hooks/mcp-gate.mjs", contents: MCP_GATE_SCRIPT },
    { path: ".cursor/hooks/approved-gate.mjs", contents: approvedGateScript("Cursor") },
    emitLoopEventRecorder(),
  ];
}
