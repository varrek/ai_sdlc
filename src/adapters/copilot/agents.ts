import { stringify } from "yaml";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { allowedServersForRole, toolsForPosture } from "../shared/roles.js";
import { handoffsForRole } from "./loop-handoffs.js";

/**
 * Copilot custom agents in `.github/agents/<name>.agent.md`. Profiles support
 * `target`, posture `tools`, MCP scoping via `serverId/*`, and native `handoffs`.
 * IDE agents use `target: vscode` and workspace `.vscode/mcp.json`; per-role MCP
 * reach is declared in `tools` (partial enforcement — no IDE MCP hook).
 */
export function emitAgents(model: NeutralModel): EmittedFile[] {
  return model.roles.map((role) => {
    const mcpTools = allowedServersForRole(role, model.overlay).map((s) => `${s}/*`);
    const tools = [...toolsForPosture(role.frontmatter.posture), ...mcpTools];
    const handoffs = handoffsForRole(role.frontmatter.name, model);

    const fm: Record<string, unknown> = {
      name: role.frontmatter.name,
      description: role.frontmatter.description,
      target: "vscode",
      tools,
    };
    if (role.frontmatter.model) fm.model = role.frontmatter.model;
    if (handoffs) fm.handoffs = handoffs;

    const frontmatter = stringify(fm, { sortMapEntries: false }).trim();
    return {
      path: `.github/agents/${role.frontmatter.name}.agent.md`,
      contents: `---\n${frontmatter}\n---\n\n${role.body.trim()}\n`,
    };
  });
}
