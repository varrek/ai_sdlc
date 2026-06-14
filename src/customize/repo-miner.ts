import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";

/** Directories never mined — vendored deps, virtualenvs, caches, build output, SDLC state. */
const IGNORE_DIRS = new Set([
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
  // Agent-host config dirs: emitted by the compiler (constitution skills/agents/
  // hooks) or pre-existing host setup, never user source. Excluded so a re-mine
  // after an in-repo compile stays stable — including when a host dir symlinks
  // into a generated skills tree (e.g. `.codex/skills` -> the emitted skills).
  // See isGeneratedArtifact for the file-level companions (AGENTS.md, …).
  ".claude",
  ".cursor",
  ".codex",
  ".windsurf",
  ".aider",
  // SDLC phase cache + overlay + logs: state, never user source. Skipping it
  // also makes the emitted-config exclusion below the single source of truth.
  ".sdlc",
]);

const WALK_DEPTH = 4;

/** Observable architecture: the source module map + entrypoints (never inferred layering). */
export interface Architecture {
  /** The dominant source directory (e.g. `src`), or `.` for root-level source. */
  sourceRoot: string;
  /** Immediate source modules under the source root (e.g. `adapters`, `core`). */
  modules: string[];
  /** Declared entrypoints from manifests (e.g. a `package.json` `bin`/`main`). */
  entrypoints: string[];
}

/** Mined project conventions, asserted only when the evidence is unambiguous. */
export interface Conventions {
  /** Set when sampled commit subjects are a clear Conventional Commits majority. */
  commits?: "conventional";
  /** Whether tests sit beside source (`*.test.*`) or under a `tests/`-style dir. */
  testLayout?: "co-located" | "separate";
}

/**
 * A single workspace package mined in its own right. Languages, frameworks,
 * test command and linters are local to the package; `evidence` paths are
 * repo-relative (prefixed with the package path) so they stay portable. Used to
 * scope standards and emit per-package instruction files in a monorepo.
 */
export interface PackageProfile {
  /** Repo-relative POSIX path of the package directory (e.g. `packages/api`). */
  path: string;
  languages: string[];
  frameworks: string[];
  /** A runnable test command local to this package, when one is discoverable. */
  testCommand?: string;
  linters: string[];
  /** claim -> repo-relative paths (prefixed with `path`) that justify it. */
  evidence: Record<string, string[]>;
}

export interface RepoProfile {
  root: string;
  languages: string[];
  frameworks: string[];
  testRunner?: string;
  /** A runnable test command (e.g. `vitest run`, `pytest`), not just the runner name. */
  testCommand?: string;
  linters: string[];
  packageManagers: string[];
  manifests: string[];
  ciFiles: string[];
  codeowners?: string;
  docs: string[];
  /** Observable architecture (module map + entrypoints); absent for a flat repo. */
  architecture?: Architecture;
  /** Mined conventions (commit style, test layout); fields absent when ambiguous. */
  conventions?: Conventions;
  /**
   * Workspace packages, mined individually. Present only for a detected
   * multi-package workspace (>=2 packages); absent for a single-package repo so
   * the common case is unchanged.
   */
  packages?: PackageProfile[];
  /** Total non-ignored files seen (drives thin-repo / track suggestion). */
  fileCount: number;
  /** claim -> repo-relative paths that justify it (evidence-backed artifacts). */
  evidence: Record<string, string[]>;
}

/** Options for {@link mineRepo}. */
export interface MineOptions {
  /**
   * Detect workspace packages and mine each one (default `true`). Set `false`
   * when mining a single package in isolation to avoid infinite recursion.
   */
  detectPackages?: boolean;
}

/** Top-level dirs that are not source modules — excluded from the architecture map. */
const NON_SOURCE_DIRS = new Set([
  "docs",
  "doc",
  "tests",
  "test",
  "spec",
  "__tests__",
  "examples",
  "example",
  "fixtures",
  ".github",
  ".circleci",
]);

function walk(root: string, excluded: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const visit = (dir: string, depth: number): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (IGNORE_DIRS.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (depth < WALK_DEPTH) visit(abs, depth + 1);
      } else {
        const rel = relative(root, abs);
        // Never mine our own generated config: otherwise a re-run after compile
        // would scan the emitted `.claude/`, `.cursor/`, `AGENTS.md`, etc. as if
        // they were repo source — corrupting language/track detection and
        // breaking the mined-phase fingerprint (and thus freshness/idempotency).
        // The static `isGeneratedArtifact` check covers files the compiler may
        // overwrite in place (a pre-existing `AGENTS.md`), which `excluded`
        // (the emitted manifest) cannot make symmetric across the first compile.
        if (excluded.has(rel) || isGeneratedArtifact(rel)) continue;
        out.push(rel);
      }
    }
  };
  visit(root, 0);
  return out.sort();
}

/**
 * Files the compiler emits into the repo's own namespace (the constitution, host
 * instruction files, generated agents/skills/hooks, the SDLC gate workflow).
 * Unlike the rest of `.github/`, these collide with paths a user may already
 * own — compile overwrites a pre-existing `AGENTS.md` in place — so the
 * `emitted.json` manifest alone can't keep mining stable: the first compile
 * would turn a counted source file into an excluded one, shifting the mined
 * fingerprint. Excluding the whole generated namespace unconditionally makes a
 * re-mine after an in-repo compile a true no-op. Real user workflows under
 * `.github/workflows/` (minus our own gate) are deliberately still mined.
 */
function isGeneratedArtifact(rel: string): boolean {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (base === "AGENTS.md" || base === "CLAUDE.md") return true;
  if (rel === ".github/copilot-instructions.md") return true;
  if (rel === ".github/workflows/sdlc-gate.yml") return true;
  return (
    rel.startsWith(".github/agents/") ||
    rel.startsWith(".github/skills/") ||
    rel.startsWith(".github/hooks/") ||
    rel.startsWith(".github/instructions/")
  );
}

/**
 * Paths the compiler emitted on a prior run, read from the `.sdlc/emitted.json`
 * manifest. Empty before the first compile. These are excluded from mining so
 * generated config never feeds back into the repo profile, while user-authored
 * files in the same standard dirs (e.g. real `.github/workflows/*`) are kept.
 */
function readEmittedPaths(root: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(join(root, ".sdlc", "emitted.json"), "utf8")) as {
      files?: unknown;
    };
    if (Array.isArray(parsed.files)) {
      return new Set(parsed.files.filter((p): p is string => typeof p === "string"));
    }
  } catch {
    /* no manifest yet (pre-first-compile) — nothing to exclude */
  }
  return new Set();
}

function read(root: string, rel: string): string {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return "";
  }
}

function addEvidence(evidence: Record<string, string[]>, claim: string, path: string): void {
  (evidence[claim] ??= []).push(path);
}

/** The immediate subdirectories of `dir` that contain at least one mined file. */
function immediateSubdirs(files: string[], dir: string): string[] {
  const prefix = `${dir}/`;
  const subs = new Set<string>();
  for (const f of files) {
    if (!f.startsWith(prefix)) continue;
    const rest = f.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) continue; // a file directly in `dir`, not a submodule
    subs.add(rest.slice(0, slash));
  }
  return [...subs].sort();
}

/**
 * Mine observable architecture: the dominant source directory, its immediate
 * module subdirectories, and declared entrypoints. Only facts are recorded —
 * every module cites the directory it was seen in. A flat repo (no source
 * subdirectories) yields `undefined` rather than a fabricated map.
 */
function mineArchitecture(
  root: string,
  files: string[],
  fileSet: Set<string>,
  evidence: Record<string, string[]>,
): Architecture | undefined {
  const bySeg = new Map<string, number>();
  for (const f of files) {
    const slash = f.indexOf("/");
    const seg = slash === -1 ? "." : f.slice(0, slash);
    bySeg.set(seg, (bySeg.get(seg) ?? 0) + 1);
  }

  // Prefer the non-source-excluded top-level dir holding the most files as the
  // source root; fall back to root-level source when no such dir has submodules.
  let sourceRoot: string | undefined;
  let best = 0;
  for (const [seg, count] of bySeg) {
    if (seg === "." || NON_SOURCE_DIRS.has(seg)) continue;
    if (count > best) {
      best = count;
      sourceRoot = seg;
    }
  }

  let modules: string[] = [];
  if (sourceRoot) modules = immediateSubdirs(files, sourceRoot);

  // Root-level source: no dominant src/-style dir with submodules. Treat the
  // repo root as the source root and use its source subdirs as modules.
  if (modules.length === 0) {
    const rootDirs = [...bySeg.keys()].filter((s) => s !== "." && !NON_SOURCE_DIRS.has(s));
    if (rootDirs.length === 0) return undefined; // genuinely flat — no claim
    sourceRoot = ".";
    modules = rootDirs.sort();
  }

  for (const m of modules) {
    addEvidence(evidence, `architecture:module:${m}`, sourceRoot === "." ? m : `${sourceRoot}/${m}`);
  }

  const entrypoints = mineEntrypoints(root, fileSet, evidence);
  return { sourceRoot: sourceRoot!, modules, entrypoints };
}

/** Read declared entrypoints from manifests (currently `package.json` `bin`/`main`). */
function mineEntrypoints(
  root: string,
  fileSet: Set<string>,
  evidence: Record<string, string[]>,
): string[] {
  const entrypoints = new Set<string>();
  if (fileSet.has("package.json")) {
    const pkg = safeJson(read(root, "package.json"));
    const bin = pkg.bin;
    if (typeof bin === "string") entrypoints.add(bin);
    else if (bin && typeof bin === "object") {
      for (const v of Object.values(bin as Record<string, unknown>)) {
        if (typeof v === "string") entrypoints.add(v);
      }
    }
    if (typeof pkg.main === "string") entrypoints.add(pkg.main);
    if (entrypoints.size > 0) addEvidence(evidence, "architecture:entrypoint", "package.json");
  }
  return [...entrypoints].sort();
}

/** Subject line of a Conventional Commit (`type` or `type(scope)` then `: `). */
const CONVENTIONAL_COMMIT =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: /;

/**
 * Sample recent commit subjects via git. Read-only and failure-tolerant: no git
 * binary, not a repo, or empty history all yield an empty list (no claim), never
 * a throw. Isolated here so convention detection is testable without a real repo.
 */
function sampleCommitSubjects(root: string): string[] {
  // Only trust git history when `root` is itself a git root. Without this guard,
  // mining a non-git subdirectory (a fixture, or a user's project nested inside a
  // larger repo) walks up to the enclosing repo and mis-attributes its commit
  // conventions. A worktree uses a `.git` file, a normal clone a `.git` dir —
  // `existsSync` covers both.
  if (!existsSync(join(root, ".git"))) return [];
  try {
    const out = execFileSync("git", ["log", "--format=%s", "-n", "50"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Mine project conventions with evidence. Commit convention is asserted only on
 * a clear majority (>=70% of >=5 sampled subjects); test layout is read from the
 * already-walked file list. Fields are omitted when the signal is ambiguous.
 */
function mineConventions(
  root: string,
  files: string[],
  evidence: Record<string, string[]>,
): Conventions | undefined {
  const conventions: Conventions = {};

  const subjects = sampleCommitSubjects(root);
  if (subjects.length >= 5) {
    const matches = subjects.filter((s) => CONVENTIONAL_COMMIT.test(s));
    if (matches.length / subjects.length >= 0.7) {
      conventions.commits = "conventional";
      addEvidence(
        evidence,
        "convention:commits",
        `git log (${matches.length}/${subjects.length} conventional subjects)`,
      );
    }
  }

  const coLocated = files.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /_test\.py$/.test(f));
  const separate = files.filter(
    (f) => f.startsWith("tests/") || f.startsWith("test/") || f.startsWith("spec/"),
  );
  if (coLocated.length > 0 && coLocated.length >= separate.length) {
    conventions.testLayout = "co-located";
    for (const f of coLocated.slice(0, 3)) addEvidence(evidence, "convention:test-layout", f);
  } else if (separate.length > 0) {
    conventions.testLayout = "separate";
    for (const f of separate.slice(0, 3)) addEvidence(evidence, "convention:test-layout", f);
  }

  return conventions.commits || conventions.testLayout ? conventions : undefined;
}

/**
 * Statically mine a repository into a RepoProfile. Detection is language-aware
 * (not language-specific): the same scan recognizes Python, TS/JS, and falls
 * back gracefully. Every claim records the repo paths that justify it so
 * downstream artifacts are evidence-backed.
 */
export function mineRepo(root: string, options: MineOptions = {}): RepoProfile {
  const files = walk(root, readEmittedPaths(root));
  const fileSet = new Set(files);
  const evidence: Record<string, string[]> = {};

  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const linters = new Set<string>();
  const packageManagers = new Set<string>();
  const manifests: string[] = [];
  const ciFiles: string[] = [];
  const docs: string[] = [];
  let testRunner: string | undefined;
  let pkgTestScript = "";
  let codeowners: string | undefined;

  // Count files per extension-detected language. A single stray file in a large
  // repo (e.g. one analysis script in an otherwise-JS monorepo) is not a project
  // language; require either >=2 files or a meaningful share of the repo so a
  // small single-language package still counts. Manifests below assert a language
  // regardless of count.
  const extLangCount = new Map<string, number>();
  const bumpLang = (lang: string): void => {
    extLangCount.set(lang, (extLangCount.get(lang) ?? 0) + 1);
  };
  for (const f of files) {
    const ext = f.slice(f.lastIndexOf("."));
    if (ext === ".py") bumpLang("python");
    else if (ext === ".ts" || ext === ".tsx") bumpLang("typescript");
    else if (ext === ".js" || ext === ".jsx" || ext === ".mjs") bumpLang("javascript");
    else if (ext === ".go") bumpLang("go");
  }
  const LANG_SHARE_FLOOR = 0.05;
  for (const [lang, count] of extLangCount) {
    if (count >= 2 || count / Math.max(files.length, 1) >= LANG_SHARE_FLOOR) {
      languages.add(lang);
    }
  }

  const KNOWN_MANIFESTS = [
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    "Makefile",
    "package.json",
    "tsconfig.json",
    "go.mod",
    "Cargo.toml",
  ];
  for (const m of KNOWN_MANIFESTS) {
    if (fileSet.has(m)) manifests.push(m);
  }

  // ---- Python signals ----
  const pyproject = read(root, "pyproject.toml");
  const requirements = read(root, "requirements.txt");
  const makefile = read(root, "Makefile");
  if (fileSet.has("pyproject.toml") || fileSet.has("requirements.txt") || fileSet.has("setup.py")) {
    languages.add("python");
    packageManagers.add(pyproject.includes("[tool.poetry]") ? "poetry" : "pip");
    if (fileSet.has("pyproject.toml")) addEvidence(evidence, "python", "pyproject.toml");
    else if (fileSet.has("requirements.txt")) addEvidence(evidence, "python", "requirements.txt");
  }
  if (pyproject.includes("[tool.ruff]") || fileSet.has("ruff.toml") || fileSet.has(".ruff.toml")) {
    linters.add("ruff");
    addEvidence(evidence, "linter:ruff", fileSet.has("pyproject.toml") ? "pyproject.toml" : "ruff.toml");
  }
  if (pyproject.includes("[tool.black]")) {
    linters.add("black");
    addEvidence(evidence, "linter:black", "pyproject.toml");
  }
  if (pyproject.includes("[tool.mypy]") || fileSet.has("mypy.ini")) {
    linters.add("mypy");
    addEvidence(evidence, "linter:mypy", fileSet.has("mypy.ini") ? "mypy.ini" : "pyproject.toml");
  }
  if (fileSet.has(".flake8") || read(root, "setup.cfg").includes("[flake8]")) {
    linters.add("flake8");
    addEvidence(evidence, "linter:flake8", fileSet.has(".flake8") ? ".flake8" : "setup.cfg");
  }
  // pytest is asserted only on an explicit signal — a dependency, a `[tool.pytest]`
  // / `pytest.ini` / `setup.cfg [tool:pytest]` config, or a `conftest.py`. A bare
  // `tests/` directory is NOT enough: many Python projects use a custom runner
  // (e.g. Django's `python tests/runtests.py`), so inferring pytest from the
  // directory alone fabricates a command that collects nothing. Without a signal
  // the test-command gap stays open (fall-open), which is the intended behavior.
  const hasConftest = fileSet.has("conftest.py") || files.some((f) => f.endsWith("/conftest.py"));
  const pytestNamed =
    pyproject.includes("pytest") ||
    requirements.includes("pytest") ||
    makefile.includes("pytest") ||
    fileSet.has("pytest.ini") ||
    read(root, "setup.cfg").includes("[tool:pytest]") ||
    hasConftest;
  if (languages.has("python") && pytestNamed) {
    testRunner = "pytest";
    if (pyproject.includes("pytest")) addEvidence(evidence, "test-runner:pytest", "pyproject.toml");
    if (makefile.includes("pytest")) addEvidence(evidence, "test-runner:pytest", "Makefile");
    if (fileSet.has("pytest.ini")) addEvidence(evidence, "test-runner:pytest", "pytest.ini");
    if (hasConftest) addEvidence(evidence, "test-runner:pytest", "conftest.py");
  }
  const pyDepFile = fileSet.has("requirements.txt") ? "requirements.txt" : "pyproject.toml";
  // Detect frameworks from runtime deps only: a framework named solely under an
  // optional/dev/test extra (e.g. fastapi listing `flask` under
  // `[dependency-groups]` for benchmarks) is not the project's framework.
  const pyFrameworkText = `${requirements}\n${stripOptionalDepSections(pyproject)}`;
  const addPyFramework = (name: string, re: RegExp): void => {
    if (re.test(pyFrameworkText)) {
      frameworks.add(name);
      addEvidence(evidence, `framework:${name}`, pyDepFile);
    }
  };
  addPyFramework("streamlit", /\bstreamlit\b/);
  addPyFramework("fastapi", /\bfastapi\b/);
  addPyFramework("flask", /\bflask\b/);
  addPyFramework("django", /\bdjango\b/i);

  // ---- JS/TS signals ----
  if (fileSet.has("package.json")) {
    packageManagers.add(fileSet.has("pnpm-lock.yaml") ? "pnpm" : fileSet.has("yarn.lock") ? "yarn" : "npm");
    // A package.json is itself a language signal: classify as TypeScript when a
    // tsconfig is present (handled below), otherwise JavaScript — so a
    // manifest-only repo (no source files yet) isn't reported as "Languages: none".
    if (!fileSet.has("tsconfig.json")) {
      languages.add("javascript");
      addEvidence(evidence, "javascript", "package.json");
    }
    const pkg = safeJson(read(root, "package.json"));
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } as Record<string, string>;
    const testScript = scripts.test ?? "";
    pkgTestScript = testScript;
    if (/vitest/.test(testScript) || "vitest" in deps) {
      testRunner = "vitest";
      addEvidence(evidence, "test-runner:vitest", "package.json");
    } else if (/jest/.test(testScript) || "jest" in deps) {
      testRunner = "jest";
      addEvidence(evidence, "test-runner:jest", "package.json");
    }
    if ("eslint" in deps || files.some((f) => f.startsWith(".eslintrc"))) {
      linters.add("eslint");
      addEvidence(evidence, "linter:eslint", "eslint" in deps ? "package.json" : ".eslintrc");
    }
    if ("prettier" in deps) {
      linters.add("prettier");
      addEvidence(evidence, "linter:prettier", "package.json");
    }
    if ("react" in deps) {
      frameworks.add("react");
      addEvidence(evidence, "framework:react", "package.json");
    }
    if ("next" in deps) {
      frameworks.add("next");
      addEvidence(evidence, "framework:next", "package.json");
    }
  }
  if (fileSet.has("tsconfig.json")) {
    languages.add("typescript");
    addEvidence(evidence, "typescript", "tsconfig.json");
  }

  // ---- Go signals ----
  if (fileSet.has("go.mod")) {
    languages.add("go");
    addEvidence(evidence, "go", "go.mod");
  }

  // ---- CI, ownership, docs ----
  for (const f of files) {
    if (f.startsWith(".github/workflows/") && (f.endsWith(".yml") || f.endsWith(".yaml"))) ciFiles.push(f);
    if (f === ".gitlab-ci.yml") ciFiles.push(f);
    if (f === ".circleci/config.yml") ciFiles.push(f);
    if (f.endsWith("CODEOWNERS")) codeowners = f;
    if (f === "README.md" || f === "README.rst" || f.startsWith("docs/")) docs.push(f);
  }
  for (const f of ciFiles) addEvidence(evidence, "ci", f);
  if (codeowners) addEvidence(evidence, "codeowners", codeowners);

  // ---- Runnable test command (priority CI > Makefile > manifest) ----
  // Extension-based language shares let the resolver reject a test command from
  // a minority-language toolchain (e.g. a Python repo that ships a `package.json`
  // for asset builds — its `npm test` must not hijack the Python suite).
  const sourceFileTotal = [...extLangCount.values()].reduce((a, b) => a + b, 0);
  const langShares = new Map<string, number>();
  for (const [lang, count] of extLangCount) langShares.set(lang, count / Math.max(sourceFileTotal, 1));
  const testCommand = resolveTestCommand(root, {
    ciFiles,
    fileSet,
    makefile,
    pkgTestScript,
    testRunner,
    langShares,
    sourceFileTotal,
  });
  if (testCommand) addEvidence(evidence, "test-command", testCommand.evidence);

  // ---- Architecture + conventions ----
  const architecture = mineArchitecture(root, files, fileSet, evidence);
  const conventions = mineConventions(root, files, evidence);

  // ---- Workspace packages (monorepo) ----
  // Only a genuine multi-package workspace (>=2 packages) is reported; a single
  // package or a flat repo leaves `packages` absent so the common case is
  // unchanged. `detectPackages: false` (used when mining a package in isolation)
  // skips this entirely to avoid recursing forever.
  let packages: PackageProfile[] | undefined;
  if (options.detectPackages !== false) {
    const pkgDirs = detectWorkspacePackages(root, files, fileSet);
    if (pkgDirs.length >= 2) packages = pkgDirs.map((dir) => minePackage(root, dir));
  }

  return {
    root,
    languages: [...languages].sort(),
    frameworks: [...frameworks].sort(),
    testRunner,
    testCommand: testCommand?.command,
    linters: [...linters].sort(),
    packageManagers: [...packageManagers].sort(),
    manifests: manifests.sort(),
    ciFiles: ciFiles.sort(),
    codeowners,
    docs: docs.sort(),
    architecture,
    conventions,
    packages,
    fileCount: files.length,
    evidence,
  };
}

/** Manifest filenames whose presence in a subdirectory marks it as a package. */
const PACKAGE_MANIFESTS = new Set([
  "package.json",
  "pyproject.toml",
  "setup.py",
  "Cargo.toml",
  "go.mod",
]);

/**
 * Top-level dirs whose nested manifests are sample/demo/doc apps, not workspace
 * members. Only consulted in the fallback path (no declared workspace): an
 * explicit `examples/*` workspace glob is still honored. Prevents a non-workspace
 * repo (e.g. Flask, whose `examples/*` each ship a `pyproject.toml`) from being
 * mis-detected as a monorepo.
 */
const NON_PACKAGE_TOPDIRS = new Set([
  "examples",
  "example",
  "samples",
  "sample",
  "demo",
  "demos",
  "docs",
  "doc",
  "fixtures",
  "testdata",
  "e2e",
  "integration",
  "benchmarks",
  "bench",
  "template",
  "templates",
  "playground",
  "playgrounds",
]);

/**
 * Path segments that mark a directory as non-source even mid-path, so a declared
 * workspace glob like `packages/**` or `playground/**` does not pull in test
 * fixtures, mocks, or nested demo apps as if they were workspace members.
 */
const NON_PACKAGE_SEGMENTS = new Set([
  ...NON_PACKAGE_TOPDIRS,
  "__tests__",
  "__mocks__",
  "__fixtures__",
  "node_modules",
]);

/** A candidate dir is not a real package when any path segment is a non-source segment. */
function isExcludedPackageDir(dir: string): boolean {
  return dir.split("/").some((seg) => NON_PACKAGE_SEGMENTS.has(seg));
}

/**
 * Detect workspace package directories. Declared globs win when present (npm /
 * yarn / pnpm workspaces, Cargo `[workspace] members`, `go.work use`); otherwise
 * fall back to scanning for nested manifest directories. Returns sorted
 * repo-relative POSIX paths, excluding the root itself.
 */
function detectWorkspacePackages(root: string, files: string[], fileSet: Set<string>): string[] {
  const candidates = manifestDirs(files);
  const globs = declaredWorkspaceGlobs(root, fileSet);

  const dirs = new Set<string>();
  if (globs.length > 0) {
    // A declared workspace glob is authoritative for *where* members live, but
    // globs like `playground/**` or `packages/**/__tests__/**` also match demo
    // apps and test fixtures — exclude those so they don't each emit a package.
    const matchers = globs.map(globToRegExp);
    for (const dir of candidates) {
      if (matchers.some((re) => re.test(dir)) && !isExcludedPackageDir(dir)) dirs.add(dir);
    }
  } else {
    // No declared workspace: a nested manifest only marks a package when it isn't
    // a sample/demo/doc app, so an examples-heavy single repo stays single.
    for (const dir of candidates) {
      if (!isExcludedPackageDir(dir)) dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

/** Directories (excluding the root) that directly contain a package manifest. */
function manifestDirs(files: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const f of files) {
    const slash = f.lastIndexOf("/");
    const dir = slash === -1 ? "." : f.slice(0, slash);
    const name = slash === -1 ? f : f.slice(slash + 1);
    if (dir !== "." && PACKAGE_MANIFESTS.has(name)) dirs.add(dir);
  }
  return dirs;
}

/** Workspace member globs declared by the root manifests (normalized, `./` stripped). */
function declaredWorkspaceGlobs(root: string, fileSet: Set<string>): string[] {
  const globs: string[] = [];
  if (fileSet.has("package.json")) {
    const ws = safeJson(read(root, "package.json")).workspaces;
    if (Array.isArray(ws)) globs.push(...ws.filter((w): w is string => typeof w === "string"));
    else if (ws && typeof ws === "object") {
      const pkgs = (ws as { packages?: unknown }).packages;
      if (Array.isArray(pkgs)) globs.push(...pkgs.filter((w): w is string => typeof w === "string"));
    }
  }
  if (fileSet.has("pnpm-workspace.yaml")) {
    let doc: unknown;
    try {
      doc = parseYaml(read(root, "pnpm-workspace.yaml"));
    } catch {
      doc = undefined;
    }
    const pkgs = (doc as { packages?: unknown } | null)?.packages;
    if (Array.isArray(pkgs)) globs.push(...pkgs.filter((w): w is string => typeof w === "string"));
  }
  if (fileSet.has("Cargo.toml")) globs.push(...cargoWorkspaceMembers(read(root, "Cargo.toml")));
  if (fileSet.has("go.work")) globs.push(...goWorkUses(read(root, "go.work")));
  return globs.map((g) => g.replace(/^\.\//, "").replace(/\/+$/, "")).filter(Boolean);
}

/** Parse `[workspace] members = [...]` paths from a `Cargo.toml`. */
function cargoWorkspaceMembers(text: string): string[] {
  const block = text.match(/\[workspace\][\s\S]*?members\s*=\s*\[([^\]]*)\]/);
  if (!block) return [];
  return [...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/** Parse `use` directive paths (single-line and block form) from a `go.work`. */
function goWorkUses(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*use\s+(\S+)/gm)) {
    if (m[1] !== "(") out.push(m[1]!);
  }
  const block = text.match(/use\s*\(([^)]*)\)/);
  if (block) {
    for (const line of block[1]!.split("\n")) {
      const t = line.trim();
      if (t) out.push(t);
    }
  }
  return out.map((p) => p.replace(/^\.\//, "").replace(/^\//, "")).filter(Boolean);
}

/**
 * Compile a workspace glob to an anchored RegExp over a POSIX dir path. `*`
 * matches one path segment; `**` matches any depth. Other glob metacharacters
 * are treated literally — workspace members rarely use them.
 */
function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("/")
    .map((seg) =>
      seg === "**" ? ".*" : seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"),
    )
    .join("/");
  return new RegExp(`^${body}$`);
}

/**
 * Mine a single workspace package by re-running the scan rooted at its
 * directory (without package detection, to avoid recursion), then re-prefixing
 * its evidence paths so they remain repo-relative.
 */
function minePackage(root: string, pkgDir: string): PackageProfile {
  const sub = mineRepo(join(root, pkgDir), { detectPackages: false });
  const evidence: Record<string, string[]> = {};
  for (const [claim, paths] of Object.entries(sub.evidence)) {
    // Git-derived evidence (commit subjects) has no repo path to prefix.
    evidence[claim] = paths.map((p) => (p.startsWith("git log") ? p : `${pkgDir}/${p}`));
  }
  return {
    path: pkgDir,
    languages: sub.languages,
    frameworks: sub.frameworks,
    testCommand: sub.testCommand,
    linters: sub.linters,
    evidence,
  };
}

/**
 * Drop optional / dev / test dependency tables from a `pyproject.toml` so a
 * framework named only as a test or benchmark extra isn't mis-read as the
 * project's framework. Runtime deps (`[project].dependencies`) and the rest of
 * the manifest are preserved. A line is skipped while inside an excluded table,
 * resuming at the next table header.
 */
function stripOptionalDepSections(toml: string): string {
  const isOptional = (name: string): boolean =>
    name === "project.optional-dependencies" ||
    name.startsWith("project.optional-dependencies.") ||
    name === "dependency-groups" ||
    name.startsWith("dependency-groups.") ||
    name.startsWith("tool.poetry.group.") ||
    name === "tool.poetry.dev-dependencies";
  const out: string[] = [];
  let skipping = false;
  for (const line of toml.split("\n")) {
    const header = line.match(/^\s*\[+\s*([^\]]+?)\s*\]+/);
    if (header) skipping = isOptional(header[1]!);
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Matches the runnable invocation of a common test runner inside a shell line. */
const TEST_TOOL =
  /(^|\s)(pytest|vitest|jest|tox|mocha)\b|(npm|yarn|pnpm)\s+(run\s+)?test\b|\bgo\s+test\b|\bmake\s+test\b/;

/** Leading `FOO=bar BAZ="qux" ` environment assignments before the real command. */
const ENV_ASSIGN_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/;

/** Run-wrappers that precede the real program; stripped only to find the leading token. */
const RUN_WRAPPER = /^(?:python3?\s+-m\s+|uv\s+run\s+(?:--\S+\s+)*|npx\s+|poetry\s+run\s+|pdm\s+run\s+|hatch\s+run\s+)/;

/**
 * A dependency-install / setup command, never a test invocation — even when it
 * names a test tool as an argument (e.g. `pip install --upgrade tox`). Checked
 * after env + run-wrapper prefixes are stripped so the leading token is the
 * program being run.
 */
const INSTALL_LIKE =
  /^(?:pip3?|uv\s+pip|pipx|poetry|pdm|conda|apt|apt-get|brew|gem|cargo|go|npm|yarn|pnpm|bun|dotnet|mvn)\s+(?:install|add|sync|ci|i|download|upgrade|update|uninstall|remove|get|restore|mod)\b/;

function isInstallCommand(segment: string): boolean {
  return INSTALL_LIKE.test(segment.replace(RUN_WRAPPER, "").trim());
}

interface TestCommandSignals {
  ciFiles: string[];
  fileSet: Set<string>;
  makefile: string;
  pkgTestScript: string;
  testRunner: string | undefined;
  /** Extension-based language share (0..1), keyed by language. Empty when no source. */
  langShares: Map<string, number>;
  /** Total extension-classified source files; 0 for a manifest-only repo. */
  sourceFileTotal: number;
}

/** The language toolchain a test command belongs to, or `undefined` if neutral. */
type Ecosystem = "js" | "python" | "go" | undefined;

/** Below this extension share a language is a minority — its test command can't be the suite. */
const LANG_PRIMARY_FLOOR = 0.15;

/** Classify a shell test command by toolchain so a minority-language command can be rejected. */
function commandEcosystem(command: string): Ecosystem {
  const c = command.toLowerCase();
  if (/\bgo\s+test\b/.test(c)) return "go";
  if (/\b(pytest|tox|nox)\b/.test(c) || /\bpython3?\s+-m\b/.test(c) || /\buv\s+run\b/.test(c)) {
    return "python";
  }
  if (/\b(npm|yarn|pnpm|npx|node)\b/.test(c) || /\b(jest|vitest|mocha)\b/.test(c)) return "js";
  return undefined;
}

/**
 * Whether a command's toolchain language is a primary language of the repo.
 * A neutral command (`make test`, a bare script) is always allowed. When no
 * source files are classified (manifest-only repo) the share is unknowable, so
 * nothing is rejected. Otherwise the toolchain's language must clear the floor —
 * this is what keeps a Python repo's auxiliary `npm test` from being chosen.
 */
function ecosystemAllowed(command: string, signals: TestCommandSignals): boolean {
  const eco = commandEcosystem(command);
  if (eco === undefined || signals.sourceFileTotal === 0) return true;
  const share = (lang: string): number => signals.langShares.get(lang) ?? 0;
  switch (eco) {
    case "js":
      return share("javascript") >= LANG_PRIMARY_FLOOR || share("typescript") >= LANG_PRIMARY_FLOOR;
    case "python":
      return share("python") >= LANG_PRIMARY_FLOOR;
    case "go":
      return share("go") >= LANG_PRIMARY_FLOOR;
    default:
      return true;
  }
}

/** True when JS/TS is a primary language (or unknowable) — gates the package.json test script. */
function jsTsPrimary(signals: TestCommandSignals): boolean {
  if (signals.sourceFileTotal === 0) return true;
  const share = (lang: string): number => signals.langShares.get(lang) ?? 0;
  return share("javascript") >= LANG_PRIMARY_FLOOR || share("typescript") >= LANG_PRIMARY_FLOOR;
}

/**
 * Rank a workflow filename so the project's primary test/CI workflow is consulted
 * before incidental ones (a scheduled job, a narrow regression workflow). Lower
 * is better; ties fall back to lexicographic order.
 */
function workflowRank(path: string): number {
  const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.(ya?ml)$/, "").toLowerCase();
  if (base === "test" || base === "tests" || base === "ci" || base === "main") return 0;
  if (/(^|[-_.])(tests?|ci)([-_.]|$)/.test(base)) return 1;
  if (base.includes("test") || base.includes("ci")) return 2;
  return 3;
}

/** Drop a trailing bare `--` (a CI argument separator left dangling), e.g. `… --headless --`. */
function trimTrailingSeparator(command: string): string {
  return command.replace(/\s+--\s*$/, "").trim();
}

/**
 * Pick a runnable test command by fixed source priority **CI > Makefile >
 * package.json/pyproject**. CI is most authoritative because it gates merges.
 * Never prompts on conflict; an inferred runner yields a sensible default so a
 * runner-only repo still resolves a command. CI mining is GitHub Actions only in v1.
 */
function resolveTestCommand(
  root: string,
  signals: TestCommandSignals,
): { command: string; evidence: string } | undefined {
  // 1. CI — GitHub Actions workflows, primary test/CI workflow first. A command
  //    from a minority-language toolchain is skipped (a Python repo's CI may run
  //    a JS asset suite via `npm test`; that is not the project's test command).
  const workflows = signals.ciFiles
    .filter((f) => f.startsWith(".github/workflows/"))
    .sort((a, b) => workflowRank(a) - workflowRank(b) || (a < b ? -1 : a > b ? 1 : 0));
  for (const wf of workflows) {
    const command = testCommandFromWorkflow(read(root, wf));
    if (command && ecosystemAllowed(command, signals)) {
      return { command: trimTrailingSeparator(command), evidence: wf };
    }
  }
  // 2. Makefile `test:` target recipe.
  const mk = testCommandFromMakefile(signals.makefile);
  if (mk && ecosystemAllowed(mk, signals)) return { command: trimTrailingSeparator(mk), evidence: "Makefile" };
  // 3. package.json scripts.test — a JS/TS command by definition, so only trust
  //    it when JS/TS is a primary language (else it's an asset/lint helper).
  const script = signals.pkgTestScript.trim();
  if (script && !/no test specified/i.test(script) && jsTsPrimary(signals)) {
    return { command: trimTrailingSeparator(pickTestSegment(script) ?? script), evidence: "package.json" };
  }
  // 4. Inferred runner default (e.g. a pytest repo with no scripts).
  const fallback = runnerDefaultCommand(signals.testRunner);
  if (fallback && ecosystemAllowed(fallback, signals)) {
    const evidence = signals.fileSet.has("pyproject.toml")
      ? "pyproject.toml"
      : signals.fileSet.has("package.json")
        ? "package.json"
        : "tests/";
    return { command: fallback, evidence };
  }
  return undefined;
}

function runnerDefaultCommand(runner: string | undefined): string | undefined {
  switch (runner) {
    case "pytest":
      return "pytest";
    case "vitest":
      return "vitest run";
    case "jest":
      return "jest";
    default:
      return undefined;
  }
}

/**
 * Normalize a shell line to a bare test invocation. Splits on `&&`, `;`, and
 * newlines, then for each statement: skips CI-template (`${{ … }}`) lines that
 * can't run locally, strips leading env-var assignments, and skips
 * dependency-install / setup steps. Returns the first real test command — so
 * `npm ci && CI=1 npm test` yields `npm test` and an `Install tox` step never
 * leaks `pip install --upgrade tox` as the test command.
 */
function pickTestSegment(run: string): string | undefined {
  const segments = run
    .split(/\n|&&|;/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const raw of segments) {
    if (raw.includes("${{")) continue; // CI expression — not a local command
    if (raw.includes("[@]}")) continue; // unexpanded shell array (e.g. "${PYTEST_ARGS[@]}")
    if (raw.startsWith("#")) continue; // shell comment (e.g. `# build pytest args …`)
    const segment = raw.replace(ENV_ASSIGN_PREFIX, "").trim();
    if (!segment || segment.startsWith("#") || isInstallCommand(segment)) continue;
    if (TEST_TOOL.test(segment)) return segment;
  }
  return undefined;
}

function testCommandFromWorkflow(text: string): string | undefined {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return undefined;
  }
  const jobs = (doc as { jobs?: Record<string, unknown> } | null)?.jobs;
  if (!jobs || typeof jobs !== "object") return undefined;
  for (const job of Object.values(jobs)) {
    const steps = (job as { steps?: unknown })?.steps;
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      const run = typeof (step as { run?: unknown })?.run === "string" ? (step as { run: string }).run : undefined;
      if (!run) continue;
      const command = pickTestSegment(run);
      if (command) return command;
    }
  }
  return undefined;
}

function testCommandFromMakefile(makefile: string): string | undefined {
  if (!makefile) return undefined;
  const lines = makefile.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^test\s*:/.test(lines[i]!)) continue;
    // Recipe lines follow, indented by a tab; take the first runnable one.
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (!/^\t/.test(line)) break;
      const recipe = line.replace(/^\t/, "").replace(/^[@-]+/, "").trim();
      if (recipe) return recipe;
    }
  }
  return undefined;
}

export { IGNORE_DIRS };
