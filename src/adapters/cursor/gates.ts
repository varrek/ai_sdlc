import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { buildRolePolicy, stableJson } from "../shared/roles.js";

const MCP_GATE_SCRIPT = `#!/usr/bin/env node
// Cursor beforeMCPExecution gate: deny MCP calls a role is not permitted to make.
// Enforces per-role least-privilege that Cursor's global mcpAllowlist cannot.
import { readFileSync } from "node:fs";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return {}; }
}

const input = readStdin();
const role = input.role ?? process.env.SDLC_ACTIVE_ROLE ?? "";
const server = input.server_name ?? input.server ?? "";

let policy = {};
try { policy = JSON.parse(readFileSync(".cursor/sdlc/role-policy.json", "utf8")); } catch {}

const entry = policy[role];
if (entry && server && !entry.servers.includes(server)) {
  console.error(\`SDLC gate: role '\${role}' may not call MCP server '\${server}'.\`);
  process.exit(2);
}
process.exit(0);
`;

const APPROVED_GATE_SCRIPT = `#!/usr/bin/env node
// Cursor Approved? gate: block writes leaving the workspace until approval.
// The orchestration loop sets SDLC_APPROVED=1 only after the human approves.
if (process.env.SDLC_APPROVED !== "1") {
  console.error("SDLC gate: changes are not Approved? yet. Halting before write-out.");
  process.exit(2);
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
    { path: ".cursor/hooks/approved-gate.mjs", contents: APPROVED_GATE_SCRIPT },
  ];
}
