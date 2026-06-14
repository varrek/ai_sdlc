import { z } from "zod";

const SLUG = /^[a-z][a-z0-9-]*$/;

export const CeremonyTrack = z.enum(["quick", "standard", "full"]);
export type CeremonyTrack = z.infer<typeof CeremonyTrack>;

/**
 * How to launch/reach an MCP server. Values in `env` are environment-variable
 * names (or `${VAR}` references), never literal secrets — the compiler emits
 * references, the host resolves them at runtime.
 */
export const McpServerSpec = z
  .object({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    env: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type McpServerSpec = z.infer<typeof McpServerSpec>;

/**
 * Binds a host-neutral integration contract to a concrete MCP server, and
 * scopes which roles may reach it (least-privilege).
 */
export const IntegrationBinding = z
  .object({
    serverId: z.string().min(1),
    allowedRoles: z.array(z.string().regex(SLUG)).default([]),
    server: McpServerSpec.optional(),
  })
  .strict();

export type IntegrationBinding = z.infer<typeof IntegrationBinding>;

/**
 * The project overlay edits only the CONFIGURABLE EDGES of the base. Hard
 * gates (review required, tests must pass, Approved? gate, least-privilege
 * MCP) live in the base constitution and are intentionally not expressible
 * here. `.strict()` rejects unknown keys so a team can never silently turn a
 * gate off by typo'ing a new field.
 */
export const Overlay = z
  .object({
    version: z.literal(1),
    defaultTrack: CeremonyTrack.optional(),
    /** Extra project standards appended to the base constitution. */
    standards: z.array(z.string().min(1)).default([]),
    /** contract-id -> binding */
    integrations: z.record(z.string().regex(SLUG), IntegrationBinding).default({}),
    /** role-name -> model id override */
    roleModels: z.record(z.string().regex(SLUG), z.string().min(1)).default({}),
    /** Free-form answers captured by the /customize interview. */
    interviewAnswers: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type Overlay = z.infer<typeof Overlay>;
