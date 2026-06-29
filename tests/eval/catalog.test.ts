import { describe, expect, it } from "vitest";
import { parseExternalRepoCatalog, repoId, selectExternalRepos } from "../../src/eval/catalog.js";

const catalog = parseExternalRepoCatalog({
  catalogRevision: "test",
  repos: [
    repo("a", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "TypeScript"),
    repo("b", "two", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "Python"),
    repo("c", "three", "cccccccccccccccccccccccccccccccccccccccc", "Go"),
    repo("d", "four", "dddddddddddddddddddddddddddddddddddddddd", "Ruby"),
    repo("e", "five", "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "Rust"),
  ],
});

describe("external repo catalog", () => {
  it("selects the same repos for the same seed", () => {
    const first = selectExternalRepos(catalog, 42, 5);
    const second = selectExternalRepos(catalog, 42, 5);

    expect(second.selected.map((entry) => entry.id)).toEqual(first.selected.map((entry) => entry.id));
    expect(first.selected).toHaveLength(5);
    expect(new Set(first.selected.map((entry) => entry.primaryLanguage)).size).toBe(5);
  });

  it("rejects catalog IDs that do not match owner repo and commit", () => {
    expect(() =>
      parseExternalRepoCatalog({
        catalogRevision: "test",
        repos: [{ ...repo("a", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "TypeScript"), id: "wrong" }],
      }),
    ).toThrow(/must be/);
  });

  it("rejects entry catalog revisions that differ from the root catalog", () => {
    expect(() =>
      parseExternalRepoCatalog({
        catalogRevision: "root",
        repos: [
          { ...repo("a", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "TypeScript"), catalogRevision: "entry" },
        ],
      }),
    ).toThrow(/must match catalog revision/);
  });

  it("reports diversity gaps when the catalog cannot satisfy requested languages", () => {
    const narrow = parseExternalRepoCatalog({
      catalogRevision: "test",
      repos: [
        repo("a", "one", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "TypeScript"),
        repo("b", "two", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "TypeScript"),
      ],
    });

    const selection = selectExternalRepos(narrow, 1, 2);

    expect(selection.selected).toHaveLength(2);
    expect(selection.diversityGaps).toContain("catalog does not contain enough distinct primary languages for requested count");
  });
});

function repo(owner: string, name: string, commit: string, language: string) {
  const entry = {
    owner,
    repo: name,
    commit,
    primaryLanguage: language,
    toolTags: [],
    sizeBand: "medium" as const,
    catalogRevision: "test",
  };
  return { ...entry, id: repoId(entry) };
}
