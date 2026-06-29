import { readFileSync } from "node:fs";
import { z } from "zod";

const githubOwner = /^[A-Za-z0-9-]+$/;
const githubRepo = /^[A-Za-z0-9._-]+$/;
const commitSha = /^[A-Fa-f0-9]{7,40}$/;

export const ExternalRepoEntrySchema = z.object({
  id: z.string().min(1),
  owner: z.string().regex(githubOwner, "owner must be a GitHub owner slug"),
  repo: z.string().regex(githubRepo, "repo must be a GitHub repo slug"),
  commit: z.string().regex(commitSha, "commit must be a pinned SHA"),
  primaryLanguage: z.string().min(1),
  toolTags: z.array(z.string().min(1)).default([]),
  sizeBand: z.enum(["medium", "big"]),
  catalogRevision: z.string().min(1),
  expectedSkipReason: z.string().optional(),
});

export const ExternalRepoCatalogSchema = z.object({
  catalogRevision: z.string().min(1),
  repos: z.array(ExternalRepoEntrySchema).min(1),
});

export type ExternalRepoEntry = z.infer<typeof ExternalRepoEntrySchema>;
export type ExternalRepoCatalog = z.infer<typeof ExternalRepoCatalogSchema>;

export interface RepoSelection {
  selected: ExternalRepoEntry[];
  diversityGaps: string[];
}

export function readExternalRepoCatalog(path: string): ExternalRepoCatalog {
  return parseExternalRepoCatalog(JSON.parse(readFileSync(path, "utf8")));
}

export function parseExternalRepoCatalog(value: unknown): ExternalRepoCatalog {
  const catalog = ExternalRepoCatalogSchema.parse(value);
  const ids = new Set<string>();
  for (const repo of catalog.repos) {
    if (ids.has(repo.id)) {
      throw new Error(`external repo catalog contains duplicate id '${repo.id}'`);
    }
    ids.add(repo.id);
    const expectedId = repoId(repo);
    if (repo.id !== expectedId) {
      throw new Error(`external repo catalog id '${repo.id}' must be '${expectedId}'`);
    }
    if (repo.catalogRevision !== catalog.catalogRevision) {
      throw new Error(
        `external repo '${repo.id}' catalogRevision '${repo.catalogRevision}' must match catalog revision '${catalog.catalogRevision}'`,
      );
    }
  }
  return catalog;
}

export function selectExternalRepos(
  catalog: ExternalRepoCatalog,
  seed: number,
  count = 5,
): RepoSelection {
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer");
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");

  const stable = [...catalog.repos].sort((a, b) => a.id.localeCompare(b.id));
  const shuffled = seededShuffle(stable, seed);
  const selected: ExternalRepoEntry[] = [];
  const selectedIds = new Set<string>();
  const usedLanguages = new Set<string>();

  for (const repo of shuffled) {
    if (selected.length >= count) break;
    if (!usedLanguages.has(repo.primaryLanguage)) {
      selected.push(repo);
      selectedIds.add(repo.id);
      usedLanguages.add(repo.primaryLanguage);
    }
  }

  for (const repo of shuffled) {
    if (selected.length >= count) break;
    if (!selectedIds.has(repo.id)) {
      selected.push(repo);
      selectedIds.add(repo.id);
    }
  }

  const diversityGaps: string[] = [];
  if (
    new Set(catalog.repos.map((repo) => repo.primaryLanguage)).size <
    Math.min(count, catalog.repos.length)
  ) {
    diversityGaps.push(
      "catalog does not contain enough distinct primary languages for requested count",
    );
  }
  if (selected.length < count) {
    diversityGaps.push(
      `catalog contains only ${selected.length} selectable repos for requested count ${count}`,
    );
  }

  return { selected, diversityGaps };
}

export function repoId(repo: Pick<ExternalRepoEntry, "owner" | "repo" | "commit">): string {
  return `${repo.owner}/${repo.repo}@${repo.commit}`;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  return items
    .map((item, index) => ({ item, index, sort: rand() }))
    .sort((a, b) => a.sort - b.sort || a.index - b.index)
    .map(({ item }) => item);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
