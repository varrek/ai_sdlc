import { stringify } from "yaml";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { allowedServersForRole, kiroToolsForPosture } from "../shared/roles.js";

/**
 * Kiro custom subagents live in `.kiro/agents/<name>.md`. Kiro uses lowercase
 * built-in tool names and `@server` MCP selectors rather than Claude tool names.
 */
export function emitAgents(model: NeutralModel): EmittedFile[] {
  return model.roles.map((role) => {
    const mcpTools = allowedServersForRole(role, model.overlay).map((server) => `@${server}`);
    const fm: Record<string, unknown> = {
      name: role.frontmatter.name,
      description: role.frontmatter.description,
      tools: [...kiroToolsForPosture(role.frontmatter.posture), ...mcpTools],
    };
    if (role.frontmatter.model) fm.model = role.frontmatter.model;

    const frontmatter = stringify(fm, { sortMapEntries: false }).trim();
    return {
      path: `.kiro/agents/${role.frontmatter.name}.md`,
      contents: `---\n${frontmatter}\n---\n\n${role.body.trim()}\n`,
    };
  });
}
