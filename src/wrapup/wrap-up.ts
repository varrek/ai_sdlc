import type { NeutralModel } from "../core/types.js";
import type { IntegrationBinding } from "../schema/index.js";
import { type ContractGap, validateResponse } from "./contract-validate.js";
import type { McpClient } from "./mcp-client.js";

/** Raised when a role attempts an MCP call its profile does not permit. */
export class LeastPrivilegeError extends Error {
  constructor(role: string, server: string) {
    super(`Least-privilege: role '${role}' may not call MCP server '${server}'.`);
    this.name = "LeastPrivilegeError";
  }
}

export interface WrapUpDeps {
  model: NeutralModel;
  /** Role performing the wrap-up (must hold the integrations). */
  role: string;
  client: McpClient;
}

export interface WrapUpInput {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
  issueKey: string;
  comment?: string;
  /** When set, also move the Jira issue through this transition (e.g. "In Review"). */
  transition?: string;
}

export interface WrapUpResult {
  mr: { mrId?: number; webUrl?: string };
  jiraUpdated: boolean;
  contractGaps: ContractGap[];
}

/**
 * On approval, open the GitLab MR and update Jira via MCP — scoped to the role's
 * least-privilege profile and validated against the thin integration contracts.
 * Contract gaps are collected (not thrown) so they feed the next customize.
 */
export function runWrapUp(deps: WrapUpDeps, input: WrapUpInput): WrapUpResult {
  const { model, role, client } = deps;
  const roleDef = model.roles.find((r) => r.frontmatter.name === role);
  if (!roleDef) throw new Error(`unknown role '${role}'`);

  const gitlab = requireBinding(model, roleDef.frontmatter.integrations, "gitlab", role);
  const jira = requireBinding(model, roleDef.frontmatter.integrations, "jira", role);

  const contractGaps: ContractGap[] = [];

  // --- GitLab: open the MR ---
  const gitlabContract = contract(model, "gitlab");
  const createMrTool = toolFor(gitlabContract, "create-mr");
  const mrResponse = client.call({
    server: gitlab.serverId,
    tool: createMrTool,
    input: {
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
      title: input.title,
      description: input.description ?? "",
    },
  });
  contractGaps.push(...validateResponse(gitlabContract, "create-mr", mrResponse));
  const mr = {
    mrId: typeof mrResponse.mrId === "number" ? mrResponse.mrId : undefined,
    webUrl: typeof mrResponse.webUrl === "string" ? mrResponse.webUrl : undefined,
  };

  // --- Jira: comment, then (optionally) transition the issue ---
  const jiraContract = contract(model, "jira");
  const jiraGaps: ContractGap[] = [];

  const commentResponse = client.call({
    server: jira.serverId,
    tool: toolFor(jiraContract, "add-comment"),
    input: {
      issueKey: input.issueKey,
      body: input.comment ?? `MR opened: ${mr.webUrl ?? input.title}`,
    },
  });
  jiraGaps.push(...validateResponse(jiraContract, "add-comment", commentResponse));

  if (input.transition) {
    const transitionResponse = client.call({
      server: jira.serverId,
      tool: toolFor(jiraContract, "transition-issue"),
      input: { issueKey: input.issueKey, transition: input.transition },
    });
    jiraGaps.push(...validateResponse(jiraContract, "transition-issue", transitionResponse));
  }

  contractGaps.push(...jiraGaps);

  // Jira is only "updated" if its calls satisfied the contract; a gap (missing
  // or wrong-typed output) means the update is not trustworthy.
  return { mr, jiraUpdated: jiraGaps.length === 0, contractGaps };
}

function requireBinding(
  model: NeutralModel,
  roleIntegrations: string[],
  contractId: string,
  role: string,
): IntegrationBinding {
  const binding = model.overlay.integrations[contractId];
  const roleHolds = roleIntegrations.includes(contractId);
  const admitted = binding
    ? binding.allowedRoles.length === 0 || binding.allowedRoles.includes(role)
    : false;
  if (!binding || !roleHolds || !admitted) {
    throw new LeastPrivilegeError(role, binding?.serverId ?? contractId);
  }
  return binding;
}

function contract(model: NeutralModel, name: string) {
  const found = model.integrations.find((c) => c.name === name);
  if (!found) throw new Error(`integration contract '${name}' not found in model`);
  return found;
}

function toolFor(contractDef: ReturnType<typeof contract>, operationId: string): string {
  const op = contractDef.operations.find((o) => o.id === operationId);
  if (!op) throw new Error(`operation '${operationId}' not in contract '${contractDef.name}'`);
  return op.tool;
}
