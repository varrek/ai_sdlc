/**
 * The structured, host-neutral context the customize phase mines about a repo's
 * shape and hands to the compiler: per-package instruction bodies, a navigable
 * codebase map, and the directories agents should not search. It is persisted as
 * `project-context.json` beside the overlay and re-loaded at compile time so the
 * adapters can emit per-package instruction files, a codebase map, and
 * host-native exclusion rules without re-mining.
 */

/** One row of the codebase map: where a thing lives and what it is. */
export interface MapEntry {
  /** Repo-relative POSIX path of the package or module. */
  path: string;
  /** A short, evidence-backed description (e.g. `TypeScript, tests via \`vitest run\``). */
  role: string;
  /** Repo paths that justify the entry. */
  sources: string[];
}

/** Pre-rendered per-package instruction content for a single workspace package. */
export interface PackageContext {
  /** Repo-relative POSIX path of the package directory. */
  path: string;
  /** Mined language identifiers for this package. */
  languages?: string[];
  /** The rendered instruction-file body (host-neutral markdown). */
  instructionBody: string;
  /** The package-local test command, when known. */
  testCommand?: string;
}

export interface ProjectContext {
  /** Mined language identifiers across the repository. */
  languages?: string[];
  packages: PackageContext[];
  map: MapEntry[];
  /** Directory names agents should not search/read (vendored, generated, caches). */
  exclusions: string[];
}

/**
 * Static fallback exclusion set, emitted when no mined ProjectContext is present
 * (e.g. `compile` run without a prior `customize`). Mirrors the vendored/
 * generated/cache directories `repo-miner` ignores, minus `.git`. Sorted so
 * emitted host config is byte-stable.
 */
export const DEFAULT_EXCLUSIONS: string[] = [
  ".mypy_cache",
  ".next",
  ".pytest_cache",
  ".ruff_cache",
  ".sdlc",
  ".tox",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "env",
  "node_modules",
  "venv",
];

/** Render the codebase map as a markdown section appended to the constitution. */
export function renderCodebaseMap(map: MapEntry[]): string {
  const lines = [
    "## Codebase map",
    "",
    "Where things live in this repo (compiled from repo evidence). Use it to",
    "navigate directly instead of scanning the whole tree.",
    "",
  ];
  for (const entry of map) {
    const src = entry.sources.length > 0 ? ` _(${entry.sources.join(", ")})_` : "";
    lines.push(`- \`${entry.path}\` — ${entry.role}.${src}`);
  }
  return lines.join("\n");
}

/** Serialize a ProjectContext for persistence (stable, trailing newline). */
export function serializeProjectContext(ctx: ProjectContext): string {
  return `${JSON.stringify(ctx, null, 2)}\n`;
}

/** Parse a persisted ProjectContext, returning `undefined` on malformed input. */
export function parseProjectContext(text: string): ProjectContext | undefined {
  try {
    const parsed = JSON.parse(text) as Partial<ProjectContext>;
    if (
      parsed &&
      Array.isArray(parsed.packages) &&
      Array.isArray(parsed.map) &&
      Array.isArray(parsed.exclusions)
    ) {
      return {
        languages: Array.isArray(parsed.languages) ? parsed.languages : undefined,
        packages: parsed.packages,
        map: parsed.map,
        exclusions: parsed.exclusions,
      };
    }
  } catch {
    /* malformed → treat as absent */
  }
  return undefined;
}
