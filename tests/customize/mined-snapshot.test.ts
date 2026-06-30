import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCustomize } from "../../src/cli/customize.js";
import {
  loadMinedProfile,
  saveMinedProfile,
} from "../../src/customize/mined-snapshot.js";
import { mineRepo } from "../../src/customize/repo-miner.js";

describe("mined snapshot cache", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("round-trips profile when inventory is unchanged", () => {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-snapshot-"));
    writeFileSync(join(dir, "package.json"), '{"scripts":{"test":"npm test"}}');
    const overlayDir = join(dir, ".sdlc", "overlay");
    mkdirSync(overlayDir, { recursive: true });
    const profile = mineRepo(dir);
    saveMinedProfile(dir, overlayDir, profile);
    const loaded = loadMinedProfile(dir, overlayDir);
    expect(loaded?.testCommand).toBe(profile.testCommand);
  });

  it("invalidates cache when a new file is added", () => {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-snapshot-"));
    writeFileSync(join(dir, "package.json"), '{"scripts":{"test":"npm test"}}');
    const overlayDir = join(dir, ".sdlc", "overlay");
    mkdirSync(overlayDir, { recursive: true });
    saveMinedProfile(dir, overlayDir, mineRepo(dir));
    writeFileSync(join(dir, "new-source.ts"), "export const x = 1;");
    expect(loadMinedProfile(dir, overlayDir)).toBeUndefined();
  });

  it("runCustomize writes snapshot on first run", () => {
    dir = mkdtempSync(join(tmpdir(), "aisdlc-snapshot-"));
    writeFileSync(join(dir, "package.json"), '{"scripts":{"test":"npm test"}}');
    runCustomize({ repoRoot: dir });
    expect(existsSync(join(dir, ".sdlc", "overlay", ".mined-snapshot.json"))).toBe(true);
    const snap = JSON.parse(
      readFileSync(join(dir, ".sdlc", "overlay", ".mined-snapshot.json"), "utf8"),
    );
    expect(snap.inventoryFingerprint).toBeTruthy();
  });
});
