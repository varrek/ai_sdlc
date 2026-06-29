import { z } from "zod";

/**
 * Hosts the framework can compile to. Cursor and Claude Code reach full
 * orchestration depth in Milestone 1; Copilot runs degraded (see options).
 */
export const HostId = z.enum(["cursor", "claude-code", "copilot", "codex"]);
export type HostId = z.infer<typeof HostId>;

/**
 * Copilot lacks first-class subagents/hooks, so the Approved? gate and
 * review gate are enforced out-of-band. gateMode selects where.
 */
export const CopilotGateMode = z.enum(["ci", "instructions"]);
export type CopilotGateMode = z.infer<typeof CopilotGateMode>;

/** Cursor plugin manifest `name` — kebab-case with optional interior periods. */
export const CursorPluginName = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/, "plugin name must be lowercase kebab-case");
export type CursorPluginName = z.infer<typeof CursorPluginName>;

export const CursorPluginVersion = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/, "plugin version must be semver-like");
export type CursorPluginVersion = z.infer<typeof CursorPluginVersion>;

export const HostOptions = z
  .object({
    copilot: z
      .object({
        gateMode: CopilotGateMode.default("ci"),
      })
      .strict()
      .optional(),
    cursor: z
      .object({
        /** Emit `.cursor-plugin/plugin.json` pointing at compiled Cursor artifacts. */
        pluginManifest: z.boolean().default(false),
        /** Override default plugin `name` (`ai-sdlc`). */
        pluginName: CursorPluginName.optional(),
        /** Human-readable plugin display name. */
        pluginDisplayName: z.string().min(1).max(80).optional(),
        /** Marketplace/distribution description. */
        pluginDescription: z.string().min(1).max(240).optional(),
        /** Distribution version for generated plugin metadata. */
        pluginVersion: CursorPluginVersion.optional(),
        /** Owning publisher/team slug for distribution catalogs. */
        pluginPublisher: CursorPluginName.optional(),
        /** Source repository URL for distribution metadata. */
        pluginRepository: z.string().url().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const HostManifest = z
  .object({
    version: z.literal(1),
    hosts: z.array(HostId).min(1),
    options: HostOptions.optional(),
  })
  .strict();

export type HostManifest = z.infer<typeof HostManifest>;
