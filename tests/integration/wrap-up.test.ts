import { describe, expect, it } from "vitest";
import { Overlay } from "../../src/schema/index.js";
import { LeastPrivilegeError, runWrapUp } from "../../src/wrapup/wrap-up.js";
import { MockMcpClient } from "../../src/wrapup/mcp-client.js";
import { makeModel, makeRole } from "../helpers/model.js";
import { IntegrationContract } from "../../src/schema/index.js";

const gitlabContract = IntegrationContract.parse({
  name: "gitlab",
  description: "MRs",
  operations: [
    {
      id: "create-mr",
      tool: "gitlab_create_merge_request",
      outputs: [
        { name: "mrId", type: "number", required: true },
        { name: "webUrl", type: "string", required: true },
      ],
    },
  ],
});

const jiraContract = IntegrationContract.parse({
  name: "jira",
  description: "issues",
  operations: [{ id: "add-comment", tool: "jira_add_comment" }],
});

const overlay = Overlay.parse({
  version: 1,
  integrations: {
    gitlab: { serverId: "gitlab-mcp", allowedRoles: ["engineer"] },
    jira: { serverId: "jira-mcp", allowedRoles: ["engineer"] },
  },
});

function model() {
  return makeModel({
    roles: [
      makeRole("engineer", "write", ["gitlab", "jira"]),
      makeRole("reviewer", "read-only", []),
    ],
    integrations: [gitlabContract, jiraContract],
    overlay,
  });
}

const input = {
  sourceBranch: "feat/x",
  targetBranch: "main",
  title: "Add x",
  issueKey: "PROJ-1",
};

describe("wrap-up", () => {
  it("opens an MR and updates Jira against mock MCP servers", () => {
    const client = new MockMcpClient()
      .on("gitlab-mcp", "gitlab_create_merge_request", () => ({
        mrId: 42,
        webUrl: "https://gitlab.example/mr/42",
      }))
      .on("jira-mcp", "jira_add_comment", () => ({}));

    const result = runWrapUp({ model: model(), role: "engineer", client }, input);

    expect(result.mr.mrId).toBe(42);
    expect(result.mr.webUrl).toBe("https://gitlab.example/mr/42");
    expect(result.jiraUpdated).toBe(true);
    expect(result.contractGaps).toHaveLength(0);
    expect(client.calls).toHaveLength(2);
  });

  it("reports a contract-shape mismatch instead of passing silently", () => {
    const client = new MockMcpClient()
      .on("gitlab-mcp", "gitlab_create_merge_request", () => ({ mrId: 42 })) // missing webUrl
      .on("jira-mcp", "jira_add_comment", () => ({}));

    const result = runWrapUp({ model: model(), role: "engineer", client }, input);

    const gap = result.contractGaps.find((g) => g.field === "webUrl");
    expect(gap).toBeDefined();
    expect(gap!.reason).toMatch(/missing/);
  });

  it("denies a read-only Reviewer attempting the write MCP wrap-up", () => {
    const client = new MockMcpClient();
    expect(() => runWrapUp({ model: model(), role: "reviewer", client }, input)).toThrow(
      LeastPrivilegeError,
    );
    expect(client.calls).toHaveLength(0);
  });
});
