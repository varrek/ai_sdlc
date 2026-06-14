import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HostManifest,
  IntegrationContract,
  Overlay,
  Role,
  Skill,
  SchemaValidationError,
  loadMarkdown,
  loadYaml,
} from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const base = (p: string) => resolve(repoRoot, "sdlc-base", p);
const fixture = (p: string) => resolve(here, "..", "fixtures", p);

describe("host manifest", () => {
  it("parses the shipped base manifest", () => {
    const manifest = loadYaml(base("host-manifest.yaml"), HostManifest);
    expect(manifest.hosts).toContain("cursor");
    expect(manifest.options?.copilot?.gateMode).toBe("ci");
  });

  it("rejects an unknown host / bad version with a path-pointed error", () => {
    try {
      loadYaml(fixture("host-manifest-invalid.yaml"), HostManifest);
      throw new Error("expected validation to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaValidationError);
      const e = err as SchemaValidationError;
      expect(e.message).toContain("host-manifest-invalid.yaml");
      const paths = e.issues.map((i) => i.path.join("."));
      expect(paths).toContain("version");
      expect(paths).toContain("hosts.1");
    }
  });
});

describe("role", () => {
  it("parses the shipped architect role", () => {
    const role = loadMarkdown(base("roles/architect.md"), Role);
    expect(role.frontmatter.name).toBe("architect");
    expect(role.frontmatter.posture).toBe("read-only");
    expect(role.frontmatter.integrations).toEqual(["jira"]);
    expect(role.body.length).toBeGreaterThan(0);
  });

  it("fails invalid frontmatter and names the offending fields", () => {
    const run = () => loadMarkdown(fixture("role-invalid.md"), Role);
    expect(run).toThrow(SchemaValidationError);
    try {
      run();
    } catch (err) {
      const e = err as SchemaValidationError;
      expect(e.message).toContain("role-invalid.md");
      const paths = e.issues.map((i) => i.path.join("."));
      expect(paths).toContain("frontmatter.name");
      expect(paths).toContain("frontmatter.description");
      expect(paths).toContain("frontmatter.posture");
    }
  });
});

describe("skill", () => {
  it("parses a valid skill and defaults disableModelInvocation", () => {
    const skill = loadMarkdown(fixture("skill-valid.md"), Skill);
    expect(skill.frontmatter.name).toBe("customize");
    expect(skill.frontmatter.disableModelInvocation).toBe(false);
  });
});

describe("integration contract", () => {
  it("parses a valid jira contract and applies field defaults", () => {
    const contract = loadYaml(fixture("integration-jira.yaml"), IntegrationContract);
    expect(contract.operations).toHaveLength(2);
    const getIssue = contract.operations[0]!;
    expect(getIssue.inputs[0]!.required).toBe(true);
    // outputs omit `required`, so the schema default applies
    expect(getIssue.outputs[0]!.required).toBe(false);
  });
});

describe("overlay", () => {
  it("accepts a configurable-edge overlay and applies defaults", () => {
    const overlay = Overlay.parse({
      version: 1,
      defaultTrack: "standard",
      integrations: { jira: { serverId: "jira-cloud", allowedRoles: ["architect"] } },
    });
    expect(overlay.standards).toEqual([]);
    expect(overlay.roleModels).toEqual({});
    expect(overlay.integrations.jira!.serverId).toBe("jira-cloud");
  });

  it("rejects unknown top-level keys so gates can't be disabled by typo", () => {
    const result = Overlay.safeParse({
      version: 1,
      reviewRequired: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const codes = result.error.issues.map((i) => i.code);
      expect(codes).toContain("unrecognized_keys");
    }
  });
});
