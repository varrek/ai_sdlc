import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Overlay } from "../../src/schema/index.js";
import { loadBase } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

describe("mergeOverlay", () => {
  it("appends overlay standards to the constitution", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1, standards: ["Conventional commits required."] });
    const model = mergeOverlay(base, overlay);
    expect(model.constitution).toContain("Project standards (from overlay)");
    expect(model.constitution).toContain("Conventional commits required.");
  });

  it("overrides a role model with the overlay value (overlay wins)", () => {
    const base = loadBase(baseDir);
    const overlay = Overlay.parse({ version: 1, roleModels: { architect: "claude-opus" } });
    const model = mergeOverlay(base, overlay);
    const architect = model.roles.find((r) => r.frontmatter.name === "architect");
    expect(architect?.frontmatter.model).toBe("claude-opus");
  });

  it("leaves base untouched when overlay is empty", () => {
    const base = loadBase(baseDir);
    const model = mergeOverlay(base, Overlay.parse({ version: 1 }));
    expect(model.constitution).toBe(base.constitution);
    expect(model.roles[0]?.frontmatter.model).toBeUndefined();
  });
});
