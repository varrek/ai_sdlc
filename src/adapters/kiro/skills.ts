import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { portableSkillPath, renderSkillMarkdown } from "../shared/skill-file.js";

/** Kiro supports the open Agent Skills standard under workspace `.kiro/skills`. */
export function emitSkills(model: NeutralModel): EmittedFile[] {
  return model.skills.flatMap((skill) => {
    const contents = renderSkillMarkdown(skill);
    const name = skill.frontmatter.name;
    return [
      { path: portableSkillPath(skill), contents },
      { path: `.kiro/skills/${name}/SKILL.md`, contents },
    ];
  });
}
