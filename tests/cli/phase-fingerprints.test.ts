import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compiledFingerprint, overlayFingerprint } from "../../src/cli/phase-fingerprints.js";
import { acceptedLearningsPath } from "../../src/core/accepted-learnings.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function sdlc(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-fp-"));
  tmpDirs.push(dir);
  return dir;
}

describe("phase fingerprints", () => {
  it("folds host selection into the compiled fingerprint", () => {
    const defaultHosts = compiledFingerprint("overlay", "base");
    const cursorOnly = compiledFingerprint("overlay", "base", ["cursor"]);
    const sameSetDifferentOrder = compiledFingerprint("overlay", "base", ["codex", "cursor"]);
    const sortedSet = compiledFingerprint("overlay", "base", ["cursor", "codex"]);

    expect(cursorOnly).not.toBe(defaultHosts);
    expect(sameSetDifferentOrder).toBe(sortedSet);
  });

  it("folds accepted learnings into the overlay fingerprint", () => {
    const sdlcDir = sdlc();
    const overlayDir = join(sdlcDir, "overlay");
    mkdirSync(overlayDir, { recursive: true });
    const overlayPath = join(overlayDir, ".customize.yaml");
    writeFileSync(overlayPath, "version: 1\n", "utf8");

    const before = overlayFingerprint(overlayPath, sdlcDir);
    const learningsPath = acceptedLearningsPath(sdlcDir);
    mkdirSync(join(sdlcDir, "memory"), { recursive: true });
    writeFileSync(
      learningsPath,
      JSON.stringify({
        key: "gate:T-1:approved:src",
        kind: "gate-approval",
        claim: "Approved? gate approved for src: tests green",
        sources: ["src"],
        provenance: "gate",
      }) + "\n",
      "utf8",
    );

    expect(overlayFingerprint(overlayPath, sdlcDir)).not.toBe(before);
  });
});
