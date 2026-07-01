import { z } from "zod";

const SLUG = /^[a-z][a-z0-9-]*$/;

/**
 * Tool posture drives least-privilege MCP wiring per host:
 *  - read-only: may read repo/context, no shell, no writes
 *  - read-run:  may read + run commands/tests, no file writes
 *  - write:     full read/run/write within the workspace
 */
export const ToolPosture = z.enum(["read-only", "read-run", "write"]);
export type ToolPosture = z.infer<typeof ToolPosture>;

/** Abstract model tier — vendor-neutral; adapters map to host SKUs (R10). */
export const ModelTier = z.enum(["narrow-fast", "standard", "high-reasoning"]);
export type ModelTier = z.infer<typeof ModelTier>;

/** Path glob write boundary relative to repo root (R3). */
export const WriteScope = z
  .object({
    allow: z.array(z.string().min(1)).default([]),
    deny: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type WriteScope = z.infer<typeof WriteScope>;

export const RoleFrontmatter = z
  .object({
    name: z.string().regex(SLUG, "role name must be a lowercase slug"),
    description: z.string().min(1),
    posture: ToolPosture,
    model: z.string().min(1).optional(),
    modelTier: ModelTier.optional(),
    writeScope: WriteScope.optional(),
    /** MCP integration contract ids this role is allowed to use. */
    integrations: z.array(z.string().regex(SLUG)).default([]),
  })
  .strict();

export type RoleFrontmatter = z.infer<typeof RoleFrontmatter>;

/** A role authored as markdown: validated frontmatter + non-empty body. */
export const Role = z
  .object({
    frontmatter: RoleFrontmatter,
    body: z.string().min(1, "role body (system prompt) must not be empty"),
  })
  .strict();

export type Role = z.infer<typeof Role>;
