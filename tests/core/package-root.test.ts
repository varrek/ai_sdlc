import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bundledPath,
  resolveDefaultBaseDir,
  resolveDefaultBaseDirFrom,
} from "../../src/core/package-root.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("package root resolution", () => {
  it("resolves bundled runtime assets from the package root", () => {
    const baseDir = resolveDefaultBaseDir();
    expect(baseDir).toBe(bundledPath("sdlc-base"));
    expect(existsSync(join(baseDir, "host-manifest.yaml"))).toBe(true);
  });

  it("resolves a packaged layout and falls back to source checkouts", () => {
    const packageRoot = tmpDir("package-root-");
    const cwd = tmpDir("target-repo-");
    writeManifest(join(packageRoot, "sdlc-base"));
    expect(resolveDefaultBaseDirFrom(packageRoot, cwd)).toBe(join(packageRoot, "sdlc-base"));

    const emptyPackageRoot = tmpDir("empty-package-root-");
    writeManifest(join(cwd, "sdlc-base"));
    expect(resolveDefaultBaseDirFrom(emptyPackageRoot, cwd)).toBe(join(cwd, "sdlc-base"));
  });

  it("throws a clear error when no default base exists", () => {
    expect(() =>
      resolveDefaultBaseDirFrom(tmpDir("package-root-"), tmpDir("target-repo-")),
    ).toThrow(/Pass --base/);
  });
});

function tmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `aisdlc-${prefix}`));
  tmpDirs.push(dir);
  return dir;
}

function writeManifest(baseDir: string): void {
  mkdirSync(baseDir, { recursive: true });
  writeFileSync(join(baseDir, "host-manifest.yaml"), "version: 1\nhosts: [cursor]\n", "utf8");
}
