import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { stableJson } from "../shared/roles.js";

const APPROVED_GATE_SCRIPT = `#!/usr/bin/env node
// Claude Code PreToolUse Approved? gate. Blocks Write/Edit/MCP tool use until
// the orchestration loop sets SDLC_APPROVED=1 (after human approval).
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

function gateStage() {
  const stage = process.env.SDLC_GATE_STAGE || process.env.SDLC_STAGE;
  return ["architect", "engineer", "test", "reviewer", "wrap-up"].includes(stage) ? stage : undefined;
}

if (!approved) {
  console.error("SDLC gate: changes are not Approved? yet. Halting before write/MCP.");
  process.exit(2);
}

// Record the approval event to loop trace history.
const taskId = process.env.SDLC_TASK_ID || "unknown";
const scope = process.env.SDLC_SCOPE || "workspace";
const role = process.env.SDLC_ACTIVE_ROLE || "unknown";
const sdlcDir = process.env.SDLC_DIR || findSdlcDir();
const stage = gateStage();
const checkpoint = process.env.SDLC_CHECKPOINT;
const label = checkpoint || stage || scope;

const event = JSON.stringify({
  type: "approval_gate",
  taskId,
  verdict: "approved",
  role,
  stage,
  checkpoint,
  reason: \`Human approved via SDLC_APPROVED=1 (\${label})\`,
  evidence: [scope, label].filter(Boolean),
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
 * Claude Code gate: a `PreToolUse` hook in `.claude/settings.json` matching the
 * mutating tools and MCP calls, backed by a gate script. Per-role tool
 * restriction is handled natively in the agent frontmatter (see agents.ts), so
 * this hook only enforces the Approved? checkpoint.
 */
export function emitGates(_model: NeutralModel): EmittedFile[] {
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Write|Edit|MultiEdit|mcp__.*",
          hooks: [{ type: "command", command: "node ./.claude/hooks/approved-gate.mjs" }],
        },
      ],
    },
  };

  return [
    { path: ".claude/settings.json", contents: stableJson(settings) },
    { path: ".claude/hooks/approved-gate.mjs", contents: APPROVED_GATE_SCRIPT },
  ];
}
