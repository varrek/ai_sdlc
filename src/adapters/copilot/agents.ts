import { stringify } from "yaml";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { toolsForPosture } from "../shared/roles.js";

/**
 * Copilot custom agents in `.github/agents/<name>.agent.md`. Copilot custom
 * agents accept a `tools` list (partial enforcement), so we emit the posture
 * tools; deeper per-role MCP scoping degrades to the gate fallback + CI.
 */
export function emitAgents(model: NeutralModel): EmittedFile[] {
  return model.roles.map((role) => {
    const fm: Record<string, unknown> = {
      name: role.frontmatter.name,
      description: role.frontmatter.description,
      tools: toolsForPosture(role.frontmatter.posture),
    };
    if (role.frontmatter.model) fm.model = role.frontmatter.model;
    const frontmatter = stringify(fm, { sortMapEntries: false }).trim();
    return {
      path: `.github/agents/${role.frontmatter.name}.agent.md`,
      contents: `---\n${frontmatter}\n---\n\n${role.body.trim()}\n`,
    };
  });
}
