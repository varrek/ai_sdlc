import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildRegistry } from "../../src/adapters/registry.js";
import { compile } from "../../src/core/engine.js";
import { loadBase, loadOverlay } from "../../src/core/loader.js";
import { mergeOverlay } from "../../src/core/merge.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseDir = join(resolve(here, "../.."), "sdlc-base");

let out: string;
afterEach(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

function walk(dir: string, root = dir): string[] {
  const result: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) result.push(...walk(abs, root));
    else result.push(relative(root, abs));
  }
  return result;
}

describe("golden compile output", () => {
  it("emits a stable tree across all four adapters", () => {
    out = mkdtempSync(join(tmpdir(), "aisdlc-golden-"));
    const model = mergeOverlay(loadBase(baseDir), loadOverlay(undefined));
    compile(model, buildRegistry(), { outDir: out });

    const tree: Record<string, string> = {};
    for (const rel of walk(out)) {
      // Exclude the internal emitted manifest (absolute-path-free but volatile ordering aside).
      tree[rel] = readFileSync(join(out, rel), "utf8");
    }

    expect(tree).toMatchSnapshot();
  });
});
