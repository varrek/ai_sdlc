import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { stableJson } from "../shared/roles.js";

const APPROVED_GATE_SCRIPT = `#!/usr/bin/env node
// Claude Code PreToolUse Approved? gate. Blocks Write/Edit/MCP tool use until
// the orchestration loop sets SDLC_APPROVED=1 (after human approval).
if (process.env.SDLC_APPROVED !== "1") {
  console.error("SDLC gate: changes are not Approved? yet. Halting before write/MCP.");
  process.exit(2);
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
