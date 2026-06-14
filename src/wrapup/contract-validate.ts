import type { FieldType, IntegrationContract } from "../schema/index.js";
import type { McpResponse } from "./mcp-client.js";

export interface ContractGap {
  contract: string;
  operation: string;
  field: string;
  reason: string;
}

function typeMatches(type: FieldType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Validate an MCP response against the thin integration contract. Returns a list
 * of gaps (missing required fields, wrong types) so a mismatch is *reported* for
 * the next customize rather than silently passing.
 */
export function validateResponse(
  contract: IntegrationContract,
  operationId: string,
  response: McpResponse,
): ContractGap[] {
  const operation = contract.operations.find((op) => op.id === operationId);
  if (!operation) {
    return [
      {
        contract: contract.name,
        operation: operationId,
        field: "(operation)",
        reason: `operation '${operationId}' is not defined in the contract`,
      },
    ];
  }

  const gaps: ContractGap[] = [];
  for (const field of operation.outputs) {
    const value = response[field.name];
    if (value === undefined || value === null) {
      if (field.required) {
        gaps.push({
          contract: contract.name,
          operation: operationId,
          field: field.name,
          reason: "required output field missing",
        });
      }
      continue;
    }
    if (!typeMatches(field.type, value)) {
      gaps.push({
        contract: contract.name,
        operation: operationId,
        field: field.name,
        reason: `expected ${field.type}, got ${typeof value}`,
      });
    }
  }
  return gaps;
}
