import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { portableSkillPath, renderSkillMarkdown } from "../shared/skill-file.js";

/** Codex reads `.agents/skills` repo-wide; we mirror into `.codex/skills` for parity. */
export function emitSkills(model: NeutralModel): EmittedFile[] {
  return model.skills.flatMap((skill) => {
    const contents = renderSkillMarkdown(skill);
    const name = skill.frontmatter.name;
    return [
      { path: portableSkillPath(skill), contents },
      { path: `.codex/skills/${name}/SKILL.md`, contents },
    ];
  });
}
