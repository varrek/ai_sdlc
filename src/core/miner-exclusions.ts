/** Directories never mined — vendored deps, virtualenvs, caches, build output, SDLC state. */
export const MINER_IGNORE_DIRS: readonly string[] = [
  ".git",
  "node_modules",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "dist",
  "build",
  ".next",
  "coverage",
  ".tox",
  ".claude",
  ".cursor",
  ".codex",
  ".kiro",
  ".windsurf",
  ".aider",
  ".agents",
  ".sdlc",
];

export const MINER_IGNORE_DIR_SET = new Set(MINER_IGNORE_DIRS);

/**
 * Default exclusion list for compile when no mined project context exists.
 * Mirrors miner ignores minus `.git`, sorted for stable host output.
 */
export function minerDefaultExclusions(): string[] {
  return MINER_IGNORE_DIRS.filter((dir) => dir !== ".git").sort((a, b) => a.localeCompare(b));
}
