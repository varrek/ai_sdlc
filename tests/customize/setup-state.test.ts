import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fingerprint,
  isPhaseFresh,
  readSetupState,
  stalePhases,
  writeSetupPhases,
} from "../../src/customize/setup-state.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function freshSdlc(): string {
  const dir = mkdtempSync(join(tmpdir(), "aisdlc-state-"));
  tmpDirs.push(dir);
  return dir;
}

describe("setup-state", () => {
  it("writes and reads back phase fingerprints with timestamps", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, { mined: "fp-mine", "overlay-written": "fp-overlay" });
    const state = readSetupState(sdlc);
    expect(state.phases.mined?.fingerprint).toBe("fp-mine");
    expect(state.phases["overlay-written"]?.fingerprint).toBe("fp-overlay");
    expect(state.phases.mined?.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("returns empty state for a missing file without throwing", () => {
    expect(readSetupState(freshSdlc()).phases).toEqual({});
  });

  it("returns empty state for a corrupt file (and warns)", () => {
    const sdlc = freshSdlc();
    writeFileSync(join(sdlc, "setup-state.yaml"), ":\n  - not: [valid", "utf8");
    expect(readSetupState(sdlc).phases).toEqual({});
  });

  it("marks a phase + all downstream stale when its fingerprint changes", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, {
      mined: "m1",
      "overlay-written": "o1",
      compiled: "c1",
      "smoke-passed": "s1",
    });
    const state = readSetupState(sdlc);
    const stale = stalePhases(state, {
      mined: "m2", // changed
      "overlay-written": "o1",
      compiled: "c1",
      "smoke-passed": "s1",
    });
    expect(stale).toEqual(["mined", "overlay-written", "compiled", "smoke-passed"]);
  });

  it("returns no stale phases when every recorded fingerprint matches", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, {
      mined: "m1",
      "overlay-written": "o1",
      compiled: "c1",
      "smoke-passed": "s1",
    });
    const state = readSetupState(sdlc);
    const stale = stalePhases(state, {
      mined: "m1",
      "overlay-written": "o1",
      compiled: "c1",
      "smoke-passed": "s1",
    });
    expect(stale).toEqual([]);
  });

  it("reports unrun downstream phases as stale when only upstream is recorded", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, { mined: "m1", "overlay-written": "o1" });
    const state = readSetupState(sdlc);
    const stale = stalePhases(state, { mined: "m1", "overlay-written": "o1" });
    expect(stale).toEqual(["compiled", "smoke-passed"]);
  });

  it("invalidates overlay + downstream on an overlay-only edit, keeping mined fresh (AE4)", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, {
      mined: "m1",
      "overlay-written": "o1",
      compiled: "c1",
      "smoke-passed": "s1",
    });
    const state = readSetupState(sdlc);
    const stale = stalePhases(state, { mined: "m1", "overlay-written": "o2" });
    expect(stale).toEqual(["overlay-written", "compiled", "smoke-passed"]);
    expect(stale).not.toContain("mined");
  });

  it("treats a missing earlier phase as forcing downstream stale", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, { "overlay-written": "o1", compiled: "c1" });
    const state = readSetupState(sdlc);
    const stale = stalePhases(state, { mined: "m1", "overlay-written": "o1" });
    expect(stale).toContain("mined");
    expect(stale).toContain("overlay-written");
    expect(stale).toContain("compiled");
  });

  it("treats a matching fingerprint with a missing artifact as stale", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, { compiled: "c1" });
    const state = readSetupState(sdlc);
    expect(isPhaseFresh(state, "compiled", "c1", false)).toBe(false);
    expect(isPhaseFresh(state, "compiled", "c1", true)).toBe(true);
    const stale = stalePhases(state, { compiled: "c1" }, { compiled: false });
    expect(stale).toContain("compiled");
  });

  it("produces a stable, deterministic fingerprint", () => {
    expect(fingerprint(["a", "b"])).toBe(fingerprint(["a", "b"]));
    expect(fingerprint(["a", "b"])).not.toBe(fingerprint(["b", "a"]));
  });

  it("records phases atomically and leaves no temp file", () => {
    const sdlc = freshSdlc();
    writeSetupPhases(sdlc, { mined: "m1" });
    writeSetupPhases(sdlc, { compiled: "c1" });
    const state = readSetupState(sdlc);
    expect(state.phases.mined?.fingerprint).toBe("m1");
    expect(state.phases.compiled?.fingerprint).toBe("c1");
    expect(() => readFileSync(join(sdlc, "setup-state.yaml.tmp"), "utf8")).toThrow();
  });
});
