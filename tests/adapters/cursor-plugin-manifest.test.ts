import { describe, expect, it } from "vitest";
import { CursorAdapter } from "../../src/adapters/cursor/index.js";
import { HostManifest } from "../../src/schema/index.js";
import { makeModel } from "../helpers/model.js";

function byPath(files: { path: string; contents: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.contents]));
}

describe("cursor plugin manifest", () => {
  it("does not emit a manifest by default", () => {
    const files = byPath(new CursorAdapter().emit(makeModel()).files);
    expect(files.has(".cursor-plugin/plugin.json")).toBe(false);
  });

  it("emits a manifest with explicit component paths when enabled", () => {
    const manifest = HostManifest.parse({
      version: 1,
      hosts: ["cursor"],
      options: { cursor: { pluginManifest: true } },
    });
    const files = byPath(new CursorAdapter().emit(makeModel({ manifest })).files);
    const raw = files.get(".cursor-plugin/plugin.json");
    expect(raw).toBeDefined();

    const doc = JSON.parse(raw!) as Record<string, unknown>;
    expect(doc.name).toBe("ai-sdlc");
    expect(doc.agents).toBe(".cursor/agents");
    expect(doc.skills).toBe(".agents/skills");
    expect(doc.hooks).toBe(".cursor/hooks.json");
    expect(doc.mcpServers).toBe(".cursor/mcp.json");
    expect(doc.displayName).toBe("AI SDLC");
    expect(typeof doc.description).toBe("string");
    expect(doc.version).toBe("0.1.0");
  });

  it("honors a custom plugin name override", () => {
    const manifest = HostManifest.parse({
      version: 1,
      hosts: ["cursor"],
      options: { cursor: { pluginManifest: true, pluginName: "acme-sdlc" } },
    });
    const files = byPath(new CursorAdapter().emit(makeModel({ manifest })).files);
    const doc = JSON.parse(files.get(".cursor-plugin/plugin.json")!) as Record<string, unknown>;
    expect(doc.name).toBe("acme-sdlc");
  });
});
