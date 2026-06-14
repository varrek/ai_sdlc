import { stringify } from "yaml";
import type { Skill } from "../../schema/index.js";

/**
 * Render a neutral skill back to `SKILL.md` text with progressive-disclosure
 * frontmatter preserved. The neutral `disableModelInvocation` field maps to the
 * host-facing `disable-model-invocation` key used by the Agent Skills standard.
 */
export function renderSkillMarkdown(skill: Skill): string {
  const fm: Record<string, unknown> = {
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
  };
  if (skill.frontmatter.paths !== undefined) fm.paths = skill.frontmatter.paths;
  if (skill.frontmatter.disableModelInvocation) fm["disable-model-invocation"] = true;

  const frontmatter = stringify(fm, { sortMapEntries: false }).trim();
  return `---\n${frontmatter}\n---\n\n${skill.body.trim()}\n`;
}

/** The portable, host-neutral skill location (shared by all hosts). */
export function portableSkillPath(skill: Skill): string {
  return `.agents/skills/${skill.frontmatter.name}/SKILL.md`;
}
