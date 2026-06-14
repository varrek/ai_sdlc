import { z } from "zod";

const SLUG = /^[a-z][a-z0-9-]*$/;

/**
 * A compile-time extension pack. Packs are additive: they may contribute
 * guidance, roles, skills, and integration contracts, but cannot weaken the base
 * constitution or override existing artifacts by name.
 */
export const PackManifest = z
  .object({
    version: z.literal(1),
    name: z.string().regex(SLUG, "pack name must be a lowercase slug"),
    description: z.string().min(1).optional(),
  })
  .strict();

export type PackManifest = z.infer<typeof PackManifest>;
