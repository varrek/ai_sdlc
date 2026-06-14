import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { packageInstructionFiles } from "../shared/package-instructions.js";

/**
 * Claude Code reads `CLAUDE.md`. We keep `AGENTS.md` as the single source of
 * truth and emit a thin `CLAUDE.md` that imports it via `@AGENTS.md`, plus a
 * Claude-specific appendix. This avoids duplicating the constitution while
 * still giving Claude its native entrypoint.
 */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  const claudeMd = [
    "# Claude Code project guide",
    "",
    "The project constitution is authored once in `AGENTS.md` and imported below.",
    "Do not edit it here — change the host-neutral base and re-compile.",
    "",
    "@AGENTS.md",
    "",
    "## Claude Code appendix",
    "",
    "- Role agents live in `.claude/agents/`; the Reviewer runs in a fresh, read-only context.",
    "- The `Approved?` gate is enforced by a `PreToolUse` hook in `.claude/settings.json`.",
    "- Per-role tool restrictions use native subagent `tools`/`disallowedTools` frontmatter.",
    "",
  ].join("\n");

  return [
    { path: "AGENTS.md", contents: model.constitution },
    { path: "CLAUDE.md", contents: claudeMd },
    ...packageInstructionFiles(model, "CLAUDE.md"),
  ];
}
