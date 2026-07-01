import { stringify } from "yaml";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { resolveModelForHost } from "../shared/model-tiers.js";
import { allowedServersForRole, toolsForPosture } from "../shared/roles.js";

/**
 * Claude Code role subagents in `.claude/agents/<name>.md`. Least-privilege is
 * NATIVE here: the `tools` frontmatter is a hard allowlist. Read-only roles
 * (Architect, Reviewer) get no Write/Edit; only roles whose contracts are bound
 * receive the corresponding `mcp__<server>` tools.
 */
export function emitAgents(model: NeutralModel): EmittedFile[] {
  return model.roles.map((role) => {
    const mcpTools = allowedServersForRole(role, model.overlay).map((s) => `mcp__${s}`);
    const tools = [...toolsForPosture(role.frontmatter.posture), ...mcpTools];

    const fm: Record<string, unknown> = {
      name: role.frontmatter.name,
      description: role.frontmatter.description,
      tools: tools.join(", "),
    };
    const tier = role.frontmatter.modelTier ?? "standard";
    const resolved = resolveModelForHost("claude-code", tier, role.frontmatter.model);
    if (resolved.model) fm.model = resolved.model;

    const frontmatter = stringify(fm, { sortMapEntries: false }).trim();
    return {
      path: `.claude/agents/${role.frontmatter.name}.md`,
      contents: `---\n${frontmatter}\n---\n\n${role.body.trim()}\n`,
    };
  });
}
