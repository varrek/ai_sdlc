import { z } from "zod";
import { CeremonyTrack } from "./overlay.js";

const SLUG = /^[a-z][a-z0-9-]*$/;

export const SkillFrontmatter = z
  .object({
    name: z.string().regex(SLUG, "skill name must be a lowercase slug"),
    description: z.string().min(1),
    /** Optional glob(s) scoping where the skill auto-applies. */
    paths: z.union([z.string(), z.array(z.string())]).optional(),
    /** When true, the skill is reference-only and never model-invoked. */
    disableModelInvocation: z.boolean().default(false),
    /**
     * Ceremony tracks this skill belongs to. Absent = all tracks (a general
     * capability). Present = only emitted when the chosen track is in the list,
     * so e.g. the integration `wrap-up` skill ships only on the `full` track.
     */
    tracks: z.array(CeremonyTrack).nonempty().optional(),
  })
  .strict();

export type SkillFrontmatter = z.infer<typeof SkillFrontmatter>;

export const Skill = z
  .object({
    frontmatter: SkillFrontmatter,
    body: z.string().min(1, "skill body must not be empty"),
  })
  .strict();

export type Skill = z.infer<typeof Skill>;
