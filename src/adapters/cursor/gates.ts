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

const APPROVED_GATE_SCRIPT = `#!/usr/bin/env node
// Cursor Approved? gate: block writes leaving the workspace until approval.
// The orchestration loop sets SDLC_APPROVED=1 only after the human approves.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const approved = process.env.SDLC_APPROVED === "1";

function findSdlcDir() {
  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, ".sdlc");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return join(process.cwd(), ".sdlc");
    dir = parent;
  }
}

if (!approved) {
  console.error("SDLC gate: changes are not Approved? yet. Halting before write-out.");
  process.exit(2);
}

// Record the approval event to loop trace history.
const taskId = process.env.SDLC_TASK_ID || "unknown";
const scope = process.env.SDLC_SCOPE || "workspace";
const role = process.env.SDLC_ACTIVE_ROLE || "unknown";
const sdlcDir = process.env.SDLC_DIR || findSdlcDir();

const event = JSON.stringify({
  type: "approval_gate",
  taskId,
  verdict: "approved",
  role,
  reason: "Human approved via SDLC_APPROVED=1",
  evidence: scope ? [scope] : undefined,
});

try {
  execFileSync("npx", ["--yes", "aisdlc", "record-event", "--event", event, "--sdlc-dir", sdlcDir], { stdio: "ignore" });
} catch (err) {
  // Best-effort: log recording failures but don't block the gate.
  const message = err instanceof Error ? err.message : String(err);
  console.warn("Warning: failed to record approval event:", message);
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
