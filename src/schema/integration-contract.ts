import { z } from "zod";

const SLUG = /^[a-z][a-z0-9-]*$/;

export const FieldType = z.enum(["string", "number", "boolean", "array", "object"]);
export type FieldType = z.infer<typeof FieldType>;

export const ContractField = z
  .object({
    name: z.string().min(1),
    type: FieldType,
    required: z.boolean().default(false),
  })
  .strict();

export type ContractField = z.infer<typeof ContractField>;

export const ContractOperation = z
  .object({
    id: z.string().regex(SLUG),
    /** The MCP tool name this operation maps to on the configured server. */
    tool: z.string().min(1),
    inputs: z.array(ContractField).default([]),
    outputs: z.array(ContractField).default([]),
  })
  .strict();

export type ContractOperation = z.infer<typeof ContractOperation>;

/**
 * A host-neutral description of an external integration (Jira, GitLab, ...).
 * The concrete MCP server id is bound later via the project overlay, keeping
 * the base free of environment-specific endpoints.
 */
export const IntegrationContract = z
  .object({
    name: z.string().regex(SLUG),
    description: z.string().min(1),
    operations: z.array(ContractOperation).min(1),
  })
  .strict();

export type IntegrationContract = z.infer<typeof IntegrationContract>;
