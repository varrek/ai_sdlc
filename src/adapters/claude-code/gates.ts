import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { approvedGateScript, emitLoopEventRecorder } from "../shared/approved-gate.js";
import { stableJson } from "../shared/roles.js";

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
    { path: ".claude/hooks/approved-gate.mjs", contents: approvedGateScript("Claude Code") },
    emitLoopEventRecorder(),
  ];
}
