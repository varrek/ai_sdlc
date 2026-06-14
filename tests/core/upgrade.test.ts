import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runUpgrade } from "../../src/cli/upgrade.js";
import { readProjectLock } from "../../src/core/overlay.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "..", "fixtures", "upgrade");
const oldBase = join(fixtures, "old");
const newConflictBase = join(fixtures, "new-conflict");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-upgrade-"));
  tmpDirs.push(dir);
  return dir;
}

function writeOverlay(dir: string, body: string): string {
  const p = join(dir, "overlay.yaml");
  writeFileSync(p, body);
  return p;
}

describe("aisdlc upgrade", () => {
  it("advances project.lock and leaves a non-conflicting overlay byte-identical", () => {
    const work = tmp();
    const sdlcDir = join(work, ".sdlc");
    const overlayPath = writeOverlay(
      work,
      "version: 1\nroleModels:\n  architect: team-tuned\n",
    );
    const overlayBefore = readFileSync(overlayPath);

    // old -> old: base did not change the overlaid edge, so no conflict.
    const result = runUpgrade({
      oldBaseDir: oldBase,
      newBaseDir: oldBase,
      newBaseVersion: "v2.0.0",
      overlayPath,
      sdlcDir,
    });

    expect(result.upgraded).toBe(true);
    expect(readFileSync(overlayPath).equals(overlayBefore)).toBe(true);
    const lock = readProjectLock(join(sdlcDir, "project.lock"));
    expect(lock?.baseVersion).toBe("v2.0.0");
  });

  it("blocks and reports when a base push collides with an overlaid edge", () => {
    const work = tmp();
    const sdlcDir = join(work, ".sdlc");
    const overlayPath = writeOverlay(
      work,
      "version: 1\nroleModels:\n  architect: team-tuned\n",
    );

    // old (no model) -> new-conflict (base now sets architect.model): collision.
    const result = runUpgrade({
      oldBaseDir: oldBase,
      newBaseDir: newConflictBase,
      newBaseVersion: "v2.0.0",
      overlayPath,
      sdlcDir,
    });

    expect(result.upgraded).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.edge).toBe("role.architect.model");
    // lock NOT advanced on a blocked upgrade
    expect(existsSync(join(sdlcDir, "project.lock"))).toBe(false);
    // conflict report written
    const report = readFileSync(join(sdlcDir, "upgrade-conflicts.yml"), "utf8");
    expect(report).toContain("role.architect.model");
    expect(report).toContain("manual");
  });
});
