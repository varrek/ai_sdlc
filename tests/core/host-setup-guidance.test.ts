import { describe, expect, it } from "vitest";
import { renderHostSetupGuide } from "../../src/core/host-setup-guidance.js";
import type { EmittedFile, Gap } from "../../src/core/types.js";

describe("host setup guidance", () => {
  it("renders activation guidance and honest host gaps for enabled hosts", () => {
    const files: EmittedFile[] = [
      { path: "AGENTS.md", contents: "" },
      { path: ".cursor/agents/engineer.md", contents: "" },
      { path: ".github/hooks/approved-gate.json", contents: "" },
      { path: ".codex/config.toml", contents: "" },
    ];
    const gaps: Gap[] = [
      {
        host: "copilot",
        capability: "approved-gate-hook",
        reason: "Copilot IDE has no PreToolUse hook.",
      },
    ];

    const guide = renderHostSetupGuide(["cursor", "copilot", "codex"], files, gaps);

    expect(guide).toContain("## Cursor");
    expect(guide).toContain("## GitHub Copilot");
    expect(guide).toContain("## Codex");
    expect(guide).not.toContain("## Claude Code");
    expect(guide).toContain("approved-gate-hook: Copilot IDE has no PreToolUse hook.");
    expect(guide).toContain("`.cursor/agents/`");
    expect(guide).toContain("`.cursor/hooks/`");
    expect(guide).toContain("`.cursor-plugin/plugin.json` (conditional or not emitted");

    const claudeGuide = renderHostSetupGuide(
      ["claude-code"],
      [{ path: ".claude/hooks/approved-gate.mjs", contents: "" }],
      [],
    );
    expect(claudeGuide).toContain("`.claude/hooks/`");
  });
});
