import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { portableSkillPath, renderSkillMarkdown } from "../shared/skill-file.js";

/** Cursor reads the portable `.agents/skills` location and a `.cursor/skills` shim. */
export function emitSkills(model: NeutralModel): EmittedFile[] {
  return model.skills.flatMap((skill) => {
    const contents = renderSkillMarkdown(skill);
    const name = skill.frontmatter.name;
    return [
      { path: portableSkillPath(skill), contents },
      { path: `.cursor/skills/${name}/SKILL.md`, contents },
    ];
  });
}
