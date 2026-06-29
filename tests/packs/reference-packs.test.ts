import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadBase } from "../../src/core/loader.js";
import { PackManifest, loadYaml } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const baseDir = join(repoRoot, "sdlc-base");
const packsRoot = join(repoRoot, "packs");
const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function listReferencePackDirs(): string[] {
  return readdirSync(packsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packsRoot, entry.name))
    .sort();
}

function makeTempPack(name: string, manifestName?: string): string {
  const dir = mkdtempSync(join(tmpdir(), `aisdlc-pack-${name}-`));
  tmpDirs.push(dir);
  writeFileSync(
    join(dir, "pack.yaml"),
    `version: 1\nname: ${manifestName ?? name}\ndescription: temp ${name} pack\n`,
    "utf8",
  );
  return dir;
}

function writePackFile(packDir: string, relPath: string, contents: string): void {
  const abs = join(packDir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents, "utf8");
}

describe("reference packs", () => {
  const packDirs = listReferencePackDirs();

  it("ships the expected curated set with valid manifests", () => {
    expect(packDirs.map((dir) => loadYaml(join(dir, "pack.yaml"), PackManifest).name)).toEqual([
      "backend-api",
      "frontend",
      "infra",
      "security",
    ]);
  });

  it("loads all reference packs with the base without duplicate artifacts", () => {
    const loaded = loadBase(baseDir, packDirs);

    expect(loaded.packs).toHaveLength(4);
    expect(loaded.roles.map((role) => role.frontmatter.name)).toEqual(
      expect.arrayContaining([
        "architect",
        "security-reviewer",
        "frontend-reviewer",
        "api-reviewer",
        "infra-reviewer",
      ]),
    );
    expect(loaded.skills.map((skill) => skill.frontmatter.name)).toEqual(
      expect.arrayContaining([
        "customize",
        "threat-model",
        "ui-smoke-check",
        "api-contract-review",
        "deploy-readiness",
      ]),
    );
    expect(loaded.integrations.map((integration) => integration.name)).toEqual(
      expect.arrayContaining([
        "gitlab",
        "jira",
        "sentry",
        "playwright",
        "context7",
        "github",
        "database",
        "linear",
      ]),
    );
    expect(loaded.constitution).toContain("## Pack guidance: security");
    expect(loaded.constitution).toContain("## Pack guidance: frontend");
  });

  it("rejects duplicate pack manifest names from two directories", () => {
    const first = makeTempPack("dup-a", "collision");
    const second = makeTempPack("dup-b", "collision");

    expect(() => loadBase(baseDir, [first, second])).toThrow(/Duplicate pack 'collision'/);
  });

  it("rejects a pack role that collides with a base role", () => {
    const packDir = makeTempPack("bad-role");
    writePackFile(
      packDir,
      "roles/architect.md",
      `---
name: architect
description: Attempt to override base architect
posture: read-only
---

Should not load.
`,
    );

    expect(() => loadBase(baseDir, [packDir])).toThrow(/Duplicate role 'architect'/);
  });

  it("rejects duplicate integration names across two packs", () => {
    const first = makeTempPack("int-a");
    const second = makeTempPack("int-b");
    const contract = `name: sentry
description: conflicting sentry contract
operations:
  - id: get-issue
    tool: sentry_get_issue
`;
    writePackFile(first, "integrations/sentry.contract.yaml", contract);
    writePackFile(second, "integrations/sentry.contract.yaml", contract);

    expect(() => loadBase(baseDir, [first, second])).toThrow(/Duplicate integration 'sentry'/);
  });

  it("rejects a reference pack combined with itself (duplicate pack name)", () => {
    const security = join(packsRoot, "security");
    expect(() => loadBase(baseDir, [security, security])).toThrow(/Duplicate pack 'security'/);
  });
});
