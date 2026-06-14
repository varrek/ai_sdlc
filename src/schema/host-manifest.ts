import { z } from "zod";

/**
 * Hosts the framework can compile to. Cursor and Claude Code reach full
 * orchestration depth in Milestone 1; Copilot runs degraded (see options).
 */
export const HostId = z.enum(["cursor", "claude-code", "copilot"]);
export type HostId = z.infer<typeof HostId>;

/**
 * Copilot lacks first-class subagents/hooks, so the Approved? gate and
 * review gate are enforced out-of-band. gateMode selects where.
 */
export const CopilotGateMode = z.enum(["ci", "instructions"]);
export type CopilotGateMode = z.infer<typeof CopilotGateMode>;

export const HostOptions = z
  .object({
    copilot: z
      .object({
        gateMode: CopilotGateMode.default("ci"),
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
