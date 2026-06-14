import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { portableSkillPath, renderSkillMarkdown } from "../shared/skill-file.js";

/** Claude Code reads `.claude/skills`; we also emit the portable copy. */
export function emitSkills(model: NeutralModel): EmittedFile[] {
  return model.skills.flatMap((skill) => {
    const contents = renderSkillMarkdown(skill);
    const name = skill.frontmatter.name;
    return [
      { path: portableSkillPath(skill), contents },
      { path: `.claude/skills/${name}/SKILL.md`, contents },
    ];
  });
}
