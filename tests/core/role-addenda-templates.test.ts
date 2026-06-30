import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertRoleAddendumWithinContract } from "../../src/core/role-addenda.js";
import {
  buildOverlay,
  buildProjectContext,
  buildStandardsIndex,
  mergeRoleAddenda,
} from "../../src/customize/emitters.js";
import { buildTemplateRoleAddenda } from "../../src/customize/role-addenda-templates.js";
import { mineRepo } from "../../src/customize/repo-miner.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);

describe("buildTemplateRoleAddenda", () => {
  it("populates workflow addenda for a ready Python repo without duplicating grounding facts", () => {
    const profile = mineRepo(repo("python-rags"));
    const index = buildStandardsIndex(profile);
    const projectContext = buildProjectContext(profile, index);
    const answers = { "test-command": profile.testCommand! };
    const addenda = buildTemplateRoleAddenda(profile, projectContext, answers, {
      "test-command": "miner",
    });

    expect(addenda.engineer).toBeDefined();
    expect(addenda.tester).toBeDefined();
    expect(addenda.architect).toBeDefined();
    expect(addenda.reviewer).toBeDefined();
    expect(addenda.debugger).toBeDefined();

    const combined = Object.values(addenda).join("\n");
    expect(combined).not.toMatch(/pytest|ruff|fastapi|`src`/i);
    expect(combined).not.toContain("Run tests with");

    for (const [role, text] of Object.entries(addenda)) {
      const posture =
        role === "engineer"
          ? "write"
          : role === "tester"
            ? "read-run"
            : ("read-only" as const);
      expect(() => assertRoleAddendumWithinContract(role, posture, text!)).not.toThrow();
    }
  });

  it("uses standards-based architect posture when the map is empty", () => {
    const profile = mineRepo(repo("ci-repo"));
    const index = buildStandardsIndex(profile);
    const projectContext = buildProjectContext(profile, index);
    const addenda = buildTemplateRoleAddenda(profile, projectContext, {
      "test-command": profile.testCommand!,
    });

    expect(addenda.architect).toContain("uncertain");
    expect(addenda.architect).not.toContain("npm test");
  });

  it("skips addenda when mining confidence is insufficient", () => {
    const profile = mineRepo(repo("thin-poc"));
    const index = buildStandardsIndex(profile);
    const projectContext = buildProjectContext(profile, index);
    const addenda = buildTemplateRoleAddenda(profile, projectContext);

    expect(Object.keys(addenda)).toHaveLength(0);
  });

  it("mergeRoleAddenda preserves prior entries per role key", () => {
    const prior = Overlay.parse({
      version: 1,
      roleAddenda: { engineer: "User-authored engineer guidance." },
    }).roleAddenda;
    const merged = mergeRoleAddenda(prior, {
      engineer: "Template engineer guidance.",
      tester: "Template tester guidance.",
    });
    expect(merged.engineer).toBe("User-authored engineer guidance.");
    expect(merged.tester).toBe("Template tester guidance.");
  });
});

describe("buildOverlay role addenda", () => {
  it("writes template addenda on first customize for python-rags", () => {
    const profile = mineRepo(repo("python-rags"));
    const overlay = buildOverlay(profile, { "test-command": profile.testCommand! }, undefined, {
      "test-command": "miner",
    });
    expect(overlay.roleAddenda.engineer).toBeTruthy();
    expect(overlay.roleAddenda.tester).toBeTruthy();
    expect(overlay.roleAddenda.architect).toBeTruthy();
  });
});
