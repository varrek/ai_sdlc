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
  operations: [
    { id: "add-comment", tool: "jira_add_comment" },
    {
      id: "transition-issue",
      tool: "jira_transition_issue",
      inputs: [
        { name: "issueKey", type: "string", required: true },
        { name: "transition", type: "string", required: true },
      ],
    },
  ],
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

  it("denies a role excluded by the binding's allowedRoles (least-privilege)", () => {
    const scoped = Overlay.parse({
      version: 1,
      integrations: {
        gitlab: { serverId: "gitlab-mcp", allowedRoles: ["architect"] }, // engineer excluded
        jira: { serverId: "jira-mcp", allowedRoles: ["engineer"] },
      },
    });
    const scopedModel = makeModel({
      roles: [makeRole("engineer", "write", ["gitlab", "jira"])],
      integrations: [gitlabContract, jiraContract],
      overlay: scoped,
    });
    const client = new MockMcpClient();
    expect(() => runWrapUp({ model: scopedModel, role: "engineer", client }, input)).toThrow(
      LeastPrivilegeError,
    );
    expect(client.calls).toHaveLength(0);
  });

  it("denies a role whose profile does not hold the integration", () => {
    const partialModel = makeModel({
      roles: [makeRole("engineer", "write", ["gitlab"])], // no jira in role profile
      integrations: [gitlabContract, jiraContract],
      overlay,
    });
    const client = new MockMcpClient().on("gitlab-mcp", "gitlab_create_merge_request", () => ({
      mrId: 1,
      webUrl: "https://gitlab.example/mr/1",
    }));
    // Binding admits engineer, but the role does not list `jira` -> denied before any call.
    expect(() => runWrapUp({ model: partialModel, role: "engineer", client }, input)).toThrow(
      LeastPrivilegeError,
    );
    expect(client.calls).toHaveLength(0);
  });

  it("transitions the Jira issue when a transition is requested", () => {
    const client = new MockMcpClient()
      .on("gitlab-mcp", "gitlab_create_merge_request", () => ({
        mrId: 7,
        webUrl: "https://gitlab.example/mr/7",
      }))
      .on("jira-mcp", "jira_add_comment", () => ({}))
      .on("jira-mcp", "jira_transition_issue", () => ({}));

    const result = runWrapUp(
      { model: model(), role: "engineer", client },
      { ...input, transition: "In Review" },
    );

    expect(result.jiraUpdated).toBe(true);
    expect(client.calls.map((c) => c.tool)).toContain("jira_transition_issue");
    expect(client.calls).toHaveLength(3);
  });

  it("marks Jira not-updated when a Jira call violates its contract", () => {
    const strictJira = IntegrationContract.parse({
      name: "jira",
      description: "issues",
      operations: [
        {
          id: "add-comment",
          tool: "jira_add_comment",
          outputs: [{ name: "commentId", type: "number", required: true }],
        },
      ],
    });
    const strictModel = makeModel({
      roles: [makeRole("engineer", "write", ["gitlab", "jira"])],
      integrations: [gitlabContract, strictJira],
      overlay,
    });
    const client = new MockMcpClient()
      .on("gitlab-mcp", "gitlab_create_merge_request", () => ({
        mrId: 9,
        webUrl: "https://gitlab.example/mr/9",
      }))
      .on("jira-mcp", "jira_add_comment", () => ({})); // missing required commentId

    const result = runWrapUp({ model: strictModel, role: "engineer", client }, input);

    expect(result.jiraUpdated).toBe(false);
    expect(result.contractGaps.some((g) => g.field === "commentId")).toBe(true);
    // The GitLab MR still succeeded — gaps are collected, not thrown.
    expect(result.mr.mrId).toBe(9);
  });
});
