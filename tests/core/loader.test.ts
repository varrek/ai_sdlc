import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadBase } from "../../src/core/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");
const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function makePack(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `aisdlc-pack-${name}-`));
  tmpDirs.push(dir);
  writeFileSync(
    join(dir, "pack.yaml"),
    `version: 1\nname: ${name}\ndescription: ${name} test pack\n`,
    "utf8",
  );
  return dir;
}

function writePackFile(packDir: string, relPath: string, contents: string): void {
  const abs = join(packDir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents, "utf8");
}

describe("loadBase packs", () => {
  it("adds pack guidance, roles, skills, and integration contracts", () => {
    const packDir = makePack("security");
    writePackFile(packDir, "AGENTS.md", "Security reviews must check auth boundaries.");
    writePackFile(
      packDir,
      "roles/security-reviewer.md",
      `---
name: security-reviewer
description: Reviews security-sensitive changes
posture: read-only
---

Review authentication, authorization, and secret handling.
`,
    );
    writePackFile(
      packDir,
      "skills/threat-model/SKILL.md",
      `---
name: threat-model
description: Create a lightweight threat model
---

Identify trust boundaries before implementation.
`,
    );
    writePackFile(
      packDir,
      "integrations/security.contract.yaml",
      `name: security
description: Security tracker
operations:
  - id: get-finding
    tool: security_get_finding
`,
    );

    const base = loadBase(baseDir, [packDir]);

    expect(base.packs.map((pack) => pack.manifest.name)).toEqual(["security"]);
    expect(base.constitution).toContain("## Pack guidance: security");
    expect(base.constitution).toContain("Security reviews must check auth boundaries.");
    expect(base.roles.map((role) => role.frontmatter.name)).toContain("security-reviewer");
    expect(base.skills.map((skill) => skill.frontmatter.name)).toContain("threat-model");
    expect(base.integrations.map((integration) => integration.name)).toContain("security");
  });

  it("rejects duplicate artifact names instead of overriding base content", () => {
    const packDir = makePack("duplicate");
    writePackFile(
      packDir,
      "skills/customize/SKILL.md",
      `---
name: customize
description: Conflicting customize skill
---

This should not replace the base customize skill.
`,
    );

    expect(() => loadBase(baseDir, [packDir])).toThrow(/Duplicate skill 'customize'/);
  });
});
