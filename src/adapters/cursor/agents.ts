import { stringify } from "yaml";
import type { EmittedFile, NeutralModel } from "../../core/types.js";

/**
 * Cursor role subagents live in `.cursor/agents/<name>.md`. Cursor has no
 * per-subagent tool allowlist (KTD-5), so the posture is recorded here as
 * metadata and *enforced* by the `beforeMCPExecution` hook (see gates.ts) that
 * reads `.cursor/sdlc/role-policy.json`.
 */
export function emitAgents(model: NeutralModel): EmittedFile[] {
  return model.roles.map((role) => {
    const fm: Record<string, unknown> = {
      name: role.frontmatter.name,
      description: role.frontmatter.description,
      posture: role.frontmatter.posture,
    };
    if (role.frontmatter.model) fm.model = role.frontmatter.model;
    const frontmatter = stringify(fm, { sortMapEntries: false }).trim();
    return {
      path: `.cursor/agents/${role.frontmatter.name}.md`,
      contents: `---\n${frontmatter}\n---\n\n${role.body.trim()}\n`,
    };
  });
}
