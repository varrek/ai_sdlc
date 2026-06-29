import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCustomize } from "../../src/cli/customize.js";
import { readAcceptedLearnings } from "../../src/core/accepted-learnings.js";
import { syncAcceptedLearningsFromCustomize } from "../../src/core/accepted-learnings-sync.js";
import { buildStandardsIndex } from "../../src/customize/emitters.js";
import { mineRepo } from "../../src/customize/repo-miner.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function workRoot(): { root: string; overlayDir: string; sdlcDir: string } {
  const root = mkdtempSync(join(tmpdir(), "aisdlc-learn-sync-"));
  tmpDirs.push(root);
  const overlayDir = join(root, "overlay");
  const sdlcDir = join(root, ".sdlc");
  return { root, overlayDir, sdlcDir };
}

describe("accepted learnings sync", () => {
  it("records miner-closed test command during customize", () => {
    const { root, overlayDir, sdlcDir } = workRoot();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir, sdlcDir });

    const entries = readAcceptedLearnings(sdlcDir);
    const testCommand = entries.find((entry) => entry.key === "test-command");
    expect(testCommand).toBeDefined();
    expect(testCommand?.provenance).toBe("miner");
    expect(testCommand?.claim).toContain("pytest");
  });

  it("records interview test-command provenance when answers override mining", () => {
    const { root, overlayDir, sdlcDir } = workRoot();
    runCustomize({
      repoRoot: repo("python-rags"),
      overlayDir,
      sdlcDir,
      answers: { "test-command": "pytest -q custom" },
    });

    const testCommand = readAcceptedLearnings(sdlcDir).find(
      (entry) => entry.key === "test-command",
    );
    expect(testCommand?.provenance).toBe("interview");
    expect(testCommand?.claim).toContain("pytest -q custom");
  });

  it("preserves prior standard-added entries across re-sync", () => {
    const { overlayDir, sdlcDir } = workRoot();
    const profile = mineRepo(repo("python-rags"));
    const standardsIndex = buildStandardsIndex(profile);
    const overlay = Overlay.parse({ version: 1, interviewAnswers: { "test-command": "pytest" } });

    syncAcceptedLearningsFromCustomize(sdlcDir, profile, overlay, standardsIndex, {
      added: ["Always cite evidence in standards."],
      removed: [],
      changed: true,
    });
    syncAcceptedLearningsFromCustomize(sdlcDir, profile, overlay, standardsIndex, {
      added: [],
      removed: [],
      changed: false,
    });

    const claims = readAcceptedLearnings(sdlcDir).map((entry) => entry.claim);
    expect(claims.some((claim) => claim.includes("Always cite evidence"))).toBe(true);
  });
});
