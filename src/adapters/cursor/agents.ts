import { stringify } from "yaml";
import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { resolveModelForHost } from "../shared/model-tiers.js";

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
    const tier = role.frontmatter.modelTier ?? "standard";
    const resolved = resolveModelForHost("cursor", tier, role.frontmatter.model);
    if (resolved.model) fm.model = resolved.model;
    if (role.frontmatter.writeScope) fm.writeScope = role.frontmatter.writeScope;
    const frontmatter = stringify(fm, { sortMapEntries: false }).trim();
    return {
      path: `.cursor/agents/${role.frontmatter.name}.md`,
      contents: `---\n${frontmatter}\n---\n\n${role.body.trim()}\n`,
    };
  });
}
