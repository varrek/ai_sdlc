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
  ".agents",
  // SDLC phase cache + overlay + logs: state, never user source. Skipping it
  // also makes the emitted-config exclusion below the single source of truth.
  ".sdlc",
]);

const WALK_DEPTH = 8;

/** Observable architecture: the source module map + entrypoints (never inferred layering). */
export interface Architecture {
  /** Whether the source root is strong enough to publish as authoritative guidance. */
  confidence: "high" | "low";
  /** Deterministic reasons explaining the confidence decision. */
  reasons: string[];
  /** The dominant source directory (e.g. `src`), or `.` for root-level source. */
  sourceRoot: string;
  /** Immediate source modules under the source root (e.g. `adapters`, `core`). */
  modules: string[];
  /** Candidate roots demoted as tutorial/docs/demo/fixture surfaces. */
  demotedRoots: string[];
  /** Number of modules omitted from the bounded prompt-facing summary. */
  overflowModules: number;
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
  /** Browser E2E tools evidenced by deps or config (e.g. `playwright`, `cypress`). */
  tools: string[];
  testRunner?: string;
  /** A runnable test command (e.g. `vitest run`, `pytest`), not just the runner name. */
  testCommand?: string;
  /** Runnable browser E2E command when evidenced separately from the unit-test suite. */
  e2eTestCommand?: string;
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
  "docs_src",
  "tests",
  "test",
  "spec",
  "__tests__",
  "examples",
  "example",
  "demo",
  "demos",
  "fixtures",
  "playground",
  "playgrounds",
  ".github",
  ".circleci",
]);

const LOW_VALUE_ROOTS = new Set([
  ...NON_SOURCE_DIRS,
  "sample",
  "samples",
  "testdata",
  "benchmark",
  "benchmarks",
  "template",
  "templates",
]);

const MAX_ARCHITECTURE_MODULES = 12;

function isLowValueRoot(seg: string): boolean {
  return LOW_VALUE_ROOTS.has(seg) || /^docs?[_-]/.test(seg) || /[_-](demo|example|fixture)s?$/.test(seg);
}

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
  if (rel === ".mcp.json" || rel === ".vscode/mcp.json" || rel === "portability.gap.yml") return true;
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

function rootSourceDirs(files: string[], extensionPattern: RegExp): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    if (!extensionPattern.test(f)) continue;
    const slash = f.indexOf("/");
    if (slash > 0) dirs.add(f.slice(0, slash));
  }
  return [...dirs].filter((dir) => !isLowValueRoot(dir)).sort();
}

function commonPathPrefix(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const prefix = paths[0]!.split("/");
  for (const path of paths.slice(1)) {
    const parts = path.split("/");
    let i = 0;
    while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i++;
    prefix.length = i;
  }
  return prefix.length > 0 ? prefix.join("/") : undefined;
}

function jvmSourceRoot(files: string[], sourceBase: string): string | undefined {
  const prefix = `${sourceBase}/`;
  const sourceDirs = files
    .filter((f) => f.startsWith(prefix) && /\.(java|kt)$/.test(f))
    .map((f) => f.slice(0, f.lastIndexOf("/")))
    .filter((dir) => dir.length > sourceBase.length);
  return commonPathPrefix(sourceDirs) ?? (sourceDirs.length > 0 ? sourceBase : undefined);
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

  const entrypoints = mineEntrypoints(root, fileSet, evidence);
  const productHints = productRootHints(root, fileSet, entrypoints);
  const demotedRoots = [...bySeg.keys()].filter((seg) => seg !== "." && isLowValueRoot(seg)).sort();

  const jvmRoot = jvmSourceRoot(files, "src/main/java") ?? jvmSourceRoot(files, "src/main/kotlin");
  if (jvmRoot) {
    const modules = immediateSubdirs(files, jvmRoot);
    const boundedModules = (modules.length > 0 ? modules : ["."]).slice(0, MAX_ARCHITECTURE_MODULES);
    for (const m of boundedModules) {
      const path = m === "." ? jvmRoot : `${jvmRoot}/${m}`;
      addEvidence(evidence, `architecture:module:${m}`, path);
    }
    return {
      confidence: "high",
      reasons: ["jvm source root"],
      sourceRoot: jvmRoot,
      modules: boundedModules,
      demotedRoots,
      overflowModules: Math.max(0, modules.length - boundedModules.length),
      entrypoints,
    };
  }

  if (fileSet.has("go.mod")) {
    const modules = rootSourceDirs(files, /\.go$/).filter((dir) => dir !== ".");
    if (modules.length > 0) {
      const boundedModules = modules.slice(0, MAX_ARCHITECTURE_MODULES);
      for (const m of boundedModules) addEvidence(evidence, `architecture:module:${m}`, m);
      return {
        confidence: "high",
        reasons: ["go module root"],
        sourceRoot: ".",
        modules: boundedModules,
        demotedRoots,
        overflowModules: Math.max(0, modules.length - boundedModules.length),
        entrypoints,
      };
    }
  }

  const candidates = [...bySeg.entries()]
    .filter(([seg]) => seg !== ".")
    .map(([seg, count]) => {
      const product = productHints.has(seg);
      const demoted = isLowValueRoot(seg);
      return {
        seg,
        count,
        product,
        demoted,
        score: count + (product ? 10_000 : 0) - (demoted ? 10_000 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count || (a.seg < b.seg ? -1 : a.seg > b.seg ? 1 : 0));

  // Prefer repo-declared product hints over raw file count. A demoted/tutorial
  // tree may contain the most files, but it must not become authoritative
  // architecture unless no better evidence exists.
  let sourceRoot = candidates[0]?.seg;
  let modules: string[] = [];
  if (sourceRoot) modules = immediateSubdirs(files, sourceRoot);
  if (sourceRoot && modules.length === 0 && productHints.has(sourceRoot) && !isLowValueRoot(sourceRoot)) {
    modules = ["."];
  }

  // Root-level source: no dominant src/-style dir with submodules. Treat the
  // repo root as the source root and use its source subdirs as modules.
  if (modules.length === 0) {
    const rootDirs = [...bySeg.keys()].filter((s) => s !== "." && !isLowValueRoot(s));
    if (rootDirs.length === 0) return undefined; // genuinely flat — no claim
    sourceRoot = ".";
    modules = rootDirs.sort();
  }

  const selected = candidates.find((c) => c.seg === sourceRoot);
  const runnerUp = candidates.find((c) => c.seg !== sourceRoot);
  const reasons: string[] = [];
  if (sourceRoot === ".") reasons.push("root-level source directories");
  if (selected?.product) reasons.push("product evidence");
  if (selected?.demoted) reasons.push("selected root is demoted");
  if (runnerUp && selected && runnerUp.score === selected.score) reasons.push("tied root candidates");
  if (demotedRoots.length > 0) reasons.push(`demoted roots: ${demotedRoots.join(", ")}`);

  const confidence =
    sourceRoot !== "." &&
    selected &&
    !selected.demoted &&
    selected.product &&
    (!runnerUp || selected.score > runnerUp.score)
      ? "high"
      : sourceRoot === "." && modules.length > 0
        ? "high"
        : "low";

  const boundedModules = modules.slice(0, MAX_ARCHITECTURE_MODULES);
  for (const m of boundedModules) {
    const path = m === "." ? sourceRoot! : sourceRoot === "." ? m : `${sourceRoot}/${m}`;
    addEvidence(evidence, `architecture:module:${m}`, path);
  }
  if (confidence === "low") {
    addEvidence(evidence, "architecture:low-confidence", sourceRoot === "." ? "." : sourceRoot!);
  }

  return {
    confidence,
    reasons: reasons.length > 0 ? reasons : ["file-count fallback"],
    sourceRoot: sourceRoot!,
    modules: boundedModules,
    demotedRoots,
    overflowModules: Math.max(0, modules.length - boundedModules.length),
    entrypoints,
  };
}

function productRootHints(root: string, fileSet: Set<string>, entrypoints: string[]): Set<string> {
  const hints = new Set<string>();
  for (const entry of entrypoints) {
    const slash = entry.indexOf("/");
    if (slash > 0) hints.add(entry.slice(0, slash));
  }
  for (const pkg of detectWorkspacePackages(root, [...fileSet], fileSet)) {
    const slash = pkg.indexOf("/");
    hints.add(slash === -1 ? pkg : pkg.slice(0, slash));
  }
  const pkg = safeJson(read(root, "package.json"));
  if (typeof pkg.name === "string") hints.add(pkg.name.split("/").pop()!.replace(/^@/, ""));
  const pyName = read(root, "pyproject.toml").match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1];
  if (pyName) hints.add(pyName.replace(/-/g, "_"));
  return hints;
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
  const tools = new Set<string>();
  const linters = new Set<string>();
  const packageManagers = new Set<string>();
  const manifests: string[] = [];
  const ciFiles: string[] = [];
  const docs: string[] = [];
  let testRunner: string | undefined;
  let pkgTestScript = "";
  let pkgScripts: Record<string, string> = {};
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
    else if (ext === ".rs") bumpLang("rust");
    else if (ext === ".java") bumpLang("java");
    else if (ext === ".kt" || ext === ".kts") bumpLang("kotlin");
    else if (ext === ".rb") bumpLang("ruby");
    else if (ext === ".cs" || ext === ".fs" || ext === ".vb") bumpLang("csharp");
  }
  const LANG_SHARE_FLOOR = 0.05;
  for (const [lang, count] of extLangCount) {
    if (count >= 2 || count / Math.max(files.length, 1) >= LANG_SHARE_FLOOR) {
      languages.add(lang);
    }
  }

  const ROOT_MANIFESTS = [
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    "Makefile",
    "package.json",
    "tsconfig.json",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle.kts",
    "Gemfile",
    "global.json",
  ];
  for (const m of ROOT_MANIFESTS) {
    if (fileSet.has(m)) manifests.push(m);
  }
  for (const f of files) {
    const base = f.slice(f.lastIndexOf("/") + 1);
    if (
      (base.endsWith(".csproj") || base.endsWith(".sln") || base.endsWith(".fsproj")) &&
      !manifests.includes(f)
    ) {
      manifests.push(f);
    }
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
    pkgScripts = scripts;
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
    const playwrightConfig = files.find((f) => PLAYWRIGHT_CONFIG.test(configBasename(f)));
    if ("@playwright/test" in deps || playwrightConfig) {
      tools.add("playwright");
      if ("@playwright/test" in deps) addEvidence(evidence, "tool:playwright", "package.json");
      if (playwrightConfig) addEvidence(evidence, "tool:playwright", playwrightConfig);
    }
    const cypressConfig = files.find((f) => CYPRESS_CONFIG.test(configBasename(f)));
    if ("cypress" in deps || cypressConfig) {
      tools.add("cypress");
      if ("cypress" in deps) addEvidence(evidence, "tool:cypress", "package.json");
      if (cypressConfig) addEvidence(evidence, "tool:cypress", cypressConfig);
    }
  }
  if (fileSet.has("tsconfig.json")) {
    languages.add("typescript");
    addEvidence(evidence, "typescript", "tsconfig.json");
  }

  // ---- Rust signals ----
  const cargoToml = read(root, "Cargo.toml");
  const hasRustIntegrationTests = files.some((f) => /^tests\/[^/]+\.rs$/.test(f));
  if (fileSet.has("Cargo.toml")) {
    languages.add("rust");
    packageManagers.add("cargo");
    addEvidence(evidence, "rust", "Cargo.toml");
    if (
      cargoToml.includes("[[test]]") ||
      hasRustIntegrationTests ||
      /\b(mockall|proptest|rstest|tokio-test)\b/.test(cargoToml)
    ) {
      testRunner = testRunner ?? "cargo";
      if (cargoToml.includes("[[test]]")) addEvidence(evidence, "test-runner:cargo", "Cargo.toml");
      if (hasRustIntegrationTests) {
        const sample = files.find((f) => /^tests\/[^/]+\.rs$/.test(f))!;
        addEvidence(evidence, "test-runner:cargo", sample);
      }
    }
    if (cargoToml.includes("[lints.clippy]") || fileSet.has(".clippy.toml")) {
      linters.add("clippy");
      addEvidence(
        evidence,
        "linter:clippy",
        fileSet.has(".clippy.toml") ? ".clippy.toml" : "Cargo.toml",
      );
    }
    if (fileSet.has("rustfmt.toml") || fileSet.has(".rustfmt.toml")) {
      linters.add("rustfmt");
      addEvidence(
        evidence,
        "linter:rustfmt",
        fileSet.has("rustfmt.toml") ? "rustfmt.toml" : ".rustfmt.toml",
      );
    }
    const cargoRuntime = stripCargoDevDeps(cargoToml);
    for (const [name, re] of [
      ["actix-web", /\bactix-web\b/],
      ["axum", /\baxum\b/],
      ["rocket", /\brocket\b/],
    ] as const) {
      if (re.test(cargoRuntime)) {
        frameworks.add(name);
        addEvidence(evidence, `framework:${name}`, "Cargo.toml");
      }
    }
  }

  // ---- JVM signals (Maven / Gradle) ----
  const pomXml = read(root, "pom.xml");
  const buildGradle = fileSet.has("build.gradle.kts")
    ? read(root, "build.gradle.kts")
    : read(root, "build.gradle");
  const hasGradlew = fileSet.has("gradlew");
  if (fileSet.has("pom.xml")) {
    languages.add("java");
    packageManagers.add("maven");
    addEvidence(evidence, "java", "pom.xml");
    if (/\bjunit\b/i.test(pomXml) || pomXml.includes("maven-surefire-plugin")) {
      testRunner = testRunner ?? "maven";
      addEvidence(evidence, "test-runner:maven", "pom.xml");
    }
    if (/\bspring-boot\b/i.test(pomXml)) {
      frameworks.add("spring-boot");
      addEvidence(evidence, "framework:spring-boot", "pom.xml");
    }
  }
  if (fileSet.has("build.gradle") || fileSet.has("build.gradle.kts")) {
    const gradleManifest = fileSet.has("build.gradle.kts") ? "build.gradle.kts" : "build.gradle";
    if (/\bkotlin\b/i.test(buildGradle) || languages.has("kotlin")) {
      languages.add("kotlin");
      addEvidence(evidence, "kotlin", gradleManifest);
    } else {
      languages.add("java");
      addEvidence(evidence, "java", gradleManifest);
    }
    packageManagers.add("gradle");
    if (
      /\bjunit\b/i.test(buildGradle) ||
      buildGradle.includes("useJUnitPlatform") ||
      buildGradle.includes("testImplementation")
    ) {
      testRunner = testRunner ?? "gradle";
      addEvidence(evidence, "test-runner:gradle", gradleManifest);
    }
    if (/\bspring-boot\b/i.test(buildGradle)) {
      frameworks.add("spring-boot");
      addEvidence(evidence, "framework:spring-boot", gradleManifest);
    }
  }
  if (fileSet.has("checkstyle.xml")) {
    linters.add("checkstyle");
    addEvidence(evidence, "linter:checkstyle", "checkstyle.xml");
  }

  // ---- Ruby signals ----
  const gemfile = read(root, "Gemfile");
  const rakefile = read(root, "Rakefile");
  if (fileSet.has("Gemfile")) {
    languages.add("ruby");
    packageManagers.add("bundler");
    addEvidence(evidence, "ruby", "Gemfile");
    if (/\bgem\s+['"]rails['"]/.test(gemfile)) {
      frameworks.add("rails");
      addEvidence(evidence, "framework:rails", "Gemfile");
    }
    if (/\bgem\s+['"]rspec/.test(gemfile)) {
      testRunner = testRunner ?? "rspec";
      addEvidence(evidence, "test-runner:rspec", "Gemfile");
    } else if (/\bgem\s+['"]minitest['"]/.test(gemfile) && /task\s+:test\b/.test(rakefile)) {
      testRunner = testRunner ?? "minitest";
      addEvidence(evidence, "test-runner:minitest", "Gemfile");
      addEvidence(evidence, "test-runner:minitest", "Rakefile");
    }
    if (/\bgem\s+['"]rubocop['"]/.test(gemfile) || fileSet.has(".rubocop.yml")) {
      linters.add("rubocop");
      addEvidence(evidence, "linter:rubocop", fileSet.has(".rubocop.yml") ? ".rubocop.yml" : "Gemfile");
    }
  }

  // ---- .NET signals ----
  const csprojPath = files.find((f) => f.endsWith(".csproj") || f.endsWith(".fsproj"));
  const csproj = csprojPath ? read(root, csprojPath) : "";
  if (csprojPath || fileSet.has("global.json")) {
    languages.add("csharp");
    packageManagers.add("dotnet");
    if (csprojPath) addEvidence(evidence, "csharp", csprojPath);
    else addEvidence(evidence, "csharp", "global.json");
    if (
      /\bMicrosoft\.NET\.Test\.Sdk\b/.test(csproj) ||
      /\bxunit\b/i.test(csproj) ||
      /\bnunit\b/i.test(csproj) ||
      /\bMSTest\b/.test(csproj)
    ) {
      testRunner = testRunner ?? "dotnet";
      addEvidence(evidence, "test-runner:dotnet", csprojPath ?? "global.json");
    }
  }
  const dotnetBuildScript = dotnetBuildScriptTestCommand(fileSet, read(root, "eng/build.sh"));
  if (dotnetBuildScript) {
    testRunner = testRunner ?? "dotnet";
    addEvidence(evidence, "test-runner:dotnet", dotnetBuildScript.evidence);
  }

  // ---- Go signals ----
  if (fileSet.has("go.mod")) {
    languages.add("go");
    addEvidence(evidence, "go", "go.mod");
    const hasGoTestFiles = files.some((f) => f.endsWith("_test.go"));
    if (hasGoTestFiles || makefile.includes("go test")) {
      testRunner = testRunner ?? "go";
      if (hasGoTestFiles) {
        const sample = files.find((f) => f.endsWith("_test.go"))!;
        addEvidence(evidence, "test-runner:go", sample);
      }
      if (makefile.includes("go test")) addEvidence(evidence, "test-runner:go", "Makefile");
    }
    if (fileSet.has(".golangci.yml") || fileSet.has(".golangci.yaml")) {
      linters.add("golangci-lint");
      addEvidence(
        evidence,
        "linter:golangci-lint",
        fileSet.has(".golangci.yml") ? ".golangci.yml" : ".golangci.yaml",
      );
    }
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
    hasGradlew,
    csprojPath,
    dotnetBuildScript,
    langShares,
    sourceFileTotal,
  });
  if (testCommand) addEvidence(evidence, "test-command", testCommand.evidence);

  const e2eTestCommand = resolveE2eTestCommand(root, {
    ciFiles,
    fileSet,
    pkgScripts,
    tools,
    langShares,
    sourceFileTotal,
  });
  if (e2eTestCommand) addEvidence(evidence, "e2e-test-command", e2eTestCommand.evidence);

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
    tools: [...tools].sort(),
    testRunner,
    testCommand: testCommand?.command,
    e2eTestCommand: e2eTestCommand?.command,
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
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
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
    if (dir !== "." && (PACKAGE_MANIFESTS.has(name) || name.endsWith(".csproj"))) dirs.add(dir);
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
function stripCargoDevDeps(toml: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of toml.split("\n")) {
    const header = line.match(/^\s*\[+\s*([^\]]+?)\s*\]+/);
    if (header) {
      const name = header[1]!;
      skipping = name === "dev-dependencies" || name.startsWith("dev-dependencies.");
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

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

/** Matches the runnable invocation of a common unit-test runner inside a shell line. */
const TEST_TOOL =
  /(^|\s)(pytest|vitest|jest|tox|mocha)\b|(npm|yarn|pnpm)\s+(run\s+)?test\b|\bgo\s+test\b|\bcargo\s+test\b|\bmvn\s+test\b|\b(?:\.\/)?gradlew?\s+test\b|\bbundle\s+exec\s+(rspec|rake)\b|\bdotnet\s+test\b|\bmake\s+test\b/;

/** Playwright / Cypress config filenames at repo root or nested paths. */
const PLAYWRIGHT_CONFIG = /^playwright\.config\.(ts|js|mjs|cjs)$/;
const CYPRESS_CONFIG = /^cypress\.config\.(ts|js|mjs|cjs)$/;

const E2E_SCRIPT_KEYS = ["test:e2e", "e2e", "test:e2e:ci"] as const;

function configBasename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

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
  hasGradlew: boolean;
  csprojPath: string | undefined;
  dotnetBuildScript: { command: string; evidence: string } | undefined;
  /** Extension-based language share (0..1), keyed by language. Empty when no source. */
  langShares: Map<string, number>;
  /** Total extension-classified source files; 0 for a manifest-only repo. */
  sourceFileTotal: number;
}

/** The language toolchain a test command belongs to, or `undefined` if neutral. */
type Ecosystem = "js" | "python" | "go" | "rust" | "jvm" | "ruby" | "dotnet" | undefined;

/** Below this extension share a language is a minority — its test command can't be the suite. */
const LANG_PRIMARY_FLOOR = 0.15;

/** Classify a shell test command by toolchain so a minority-language command can be rejected. */
function commandEcosystem(command: string): Ecosystem {
  const c = command.toLowerCase();
  if (/\bcargo\s+test\b/.test(c)) return "rust";
  if (/\bgo\s+test\b/.test(c)) return "go";
  if (/\b(mvn|gradle|gradlew)\b/.test(c)) return "jvm";
  if (/\b(rspec|minitest|bundle\s+exec)\b/.test(c) || /\brake\s+test\b/.test(c)) return "ruby";
  if (/\bdotnet\s+test\b/.test(c)) return "dotnet";
  if (/\b(pytest|tox|nox)\b/.test(c) || /\bpython3?\s+-m\b/.test(c) || /\buv\s+run\b/.test(c)) {
    return "python";
  }
  if (/\b(npm|yarn|pnpm|npx|node)\b/.test(c) || /\b(jest|vitest|mocha|playwright|cypress)\b/.test(c)) {
    return "js";
  }
  return undefined;
}

/**
 * Whether a command's toolchain language is a primary language of the repo.
 * A neutral command (`make test`, a bare script) is always allowed. When no
 * source files are classified (manifest-only repo) the share is unknowable, so
 * nothing is rejected. Otherwise the toolchain's language must clear the floor —
 * this is what keeps a Python repo's auxiliary `npm test` from being chosen.
 */
function ecosystemAllowed(
  command: string,
  signals: Pick<TestCommandSignals, "langShares" | "sourceFileTotal">,
): boolean {
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
    case "rust":
      return share("rust") >= LANG_PRIMARY_FLOOR;
    case "jvm":
      return share("java") >= LANG_PRIMARY_FLOOR || share("kotlin") >= LANG_PRIMARY_FLOOR;
    case "ruby":
      return share("ruby") >= LANG_PRIMARY_FLOOR;
    case "dotnet":
      return share("csharp") >= LANG_PRIMARY_FLOOR;
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

/** Top-level GitLab CI keys that are never runnable jobs. */
const GITLAB_CI_RESERVED_KEYS = new Set([
  "stages",
  "variables",
  "before_script",
  "after_script",
  "default",
  "include",
  "workflow",
  "image",
  "services",
  "cache",
  "pages",
  "spec",
]);

/**
 * Pick a runnable test command by fixed source priority **CI > Makefile >
 * package.json/pyproject**. CI is most authoritative because it gates merges.
 * Never prompts on conflict; an inferred runner yields a sensible default so a
 * runner-only repo still resolves a command. CI mining covers GitHub Actions
 * and GitLab CI in v1.
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
  // GitLab CI — same gating rules; consulted after ranked GitHub workflows.
  for (const gf of signals.ciFiles.filter((f) => f === ".gitlab-ci.yml").sort()) {
    const command = testCommandFromGitLabCi(read(root, gf));
    if (command && ecosystemAllowed(command, signals)) {
      return { command: trimTrailingSeparator(command), evidence: gf };
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
  const fallback = runnerDefaultCommand(signals.testRunner, signals);
  if (fallback && ecosystemAllowed(fallback, signals)) {
    const evidence = runnerDefaultEvidence(signals);
    return { command: fallback, evidence };
  }
  return undefined;
}

interface E2eCommandSignals {
  ciFiles: string[];
  fileSet: Set<string>;
  pkgScripts: Record<string, string>;
  tools: Set<string>;
  langShares: Map<string, number>;
  sourceFileTotal: number;
}

/** Rank CI workflow files so E2E-named jobs are consulted before generic test workflows. */
function e2eWorkflowRank(path: string): number {
  const base = path.slice(path.lastIndexOf("/") + 1).replace(/\.(ya?ml)$/, "").toLowerCase();
  if (base === "e2e" || base.includes("e2e")) return 0;
  if (base.includes("playwright") || base.includes("cypress")) return 1;
  return 2;
}

/**
 * Pick a browser E2E command separately from the unit-test suite. Priority:
 * package.json E2E scripts > CI E2E jobs > inferred default when a tool is known.
 */
function resolveE2eTestCommand(
  root: string,
  signals: E2eCommandSignals,
): { command: string; evidence: string } | undefined {
  if (signals.tools.size === 0 && !hasE2eScript(signals.pkgScripts)) return undefined;

  for (const key of E2E_SCRIPT_KEYS) {
    const script = signals.pkgScripts[key]?.trim();
    if (!script) continue;
    const segment = pickE2eSegment(script) ?? pickTestSegment(script);
    if (segment && ecosystemAllowed(segment, signals)) {
      return { command: trimTrailingSeparator(segment), evidence: "package.json" };
    }
  }

  const workflows = signals.ciFiles
    .filter((f) => f.startsWith(".github/workflows/"))
    .sort((a, b) => e2eWorkflowRank(a) - e2eWorkflowRank(b) || (a < b ? -1 : a > b ? 1 : 0));
  for (const wf of workflows) {
    const command = e2eCommandFromWorkflow(read(root, wf));
    if (command && ecosystemAllowed(command, signals)) {
      return { command: trimTrailingSeparator(command), evidence: wf };
    }
  }

  if (signals.tools.has("playwright")) {
    return {
      command: "npx playwright test",
      evidence: findPlaywrightConfigEvidence(signals.fileSet) ?? "package.json",
    };
  }
  if (signals.tools.has("cypress")) {
    return {
      command: "npx cypress run",
      evidence: findCypressConfigEvidence(signals.fileSet) ?? "package.json",
    };
  }
  return undefined;
}

function hasE2eScript(scripts: Record<string, string>): boolean {
  return E2E_SCRIPT_KEYS.some((key) => Boolean(scripts[key]?.trim()));
}

function findPlaywrightConfigEvidence(fileSet: Set<string>): string | undefined {
  for (const name of ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"]) {
    if (fileSet.has(name)) return name;
  }
  return undefined;
}

function findCypressConfigEvidence(fileSet: Set<string>): string | undefined {
  for (const name of ["cypress.config.ts", "cypress.config.js", "cypress.config.mjs"]) {
    if (fileSet.has(name)) return name;
  }
  return undefined;
}

function e2eCommandFromWorkflow(text: string): string | undefined {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return undefined;
  }
  const jobs = (doc as { jobs?: Record<string, unknown> } | null)?.jobs;
  if (!jobs || typeof jobs !== "object") return undefined;

  const ranked = Object.entries(jobs).sort(([a], [b]) => e2eJobRank(a) - e2eJobRank(b));
  for (const [, job] of ranked) {
    const steps = (job as { steps?: unknown })?.steps;
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      const run = typeof (step as { run?: unknown })?.run === "string" ? (step as { run: string }).run : undefined;
      if (!run) continue;
      const command = pickE2eSegment(run);
      if (command) return command;
    }
  }
  return undefined;
}

function e2eJobRank(name: string): number {
  const n = name.toLowerCase();
  if (n === "e2e" || n.includes("e2e")) return 0;
  if (n.includes("playwright") || n.includes("cypress")) return 1;
  return 2;
}

/** Like {@link pickTestSegment} but only returns browser E2E invocations. */
function pickE2eSegment(run: string): string | undefined {
  const segments = run
    .split(/\n|&&|;/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const raw of segments) {
    if (raw.includes("${{")) continue;
    const segment = raw.replace(ENV_ASSIGN_PREFIX, "").trim();
    if (!segment || isInstallCommand(segment)) continue;
    if (/\bplaywright\s+test\b/.test(segment) || /\bcypress\s+run\b/.test(segment)) return segment;
    if (/\bnpm\s+run\s+(test:e2e|e2e)\b/.test(segment)) return segment;
  }
  return undefined;
}

function runnerDefaultEvidence(signals: TestCommandSignals): string {
  if (signals.testRunner === "cargo" && signals.fileSet.has("Cargo.toml")) return "Cargo.toml";
  if (signals.testRunner === "maven" && signals.fileSet.has("pom.xml")) return "pom.xml";
  if (
    signals.testRunner === "gradle" &&
    (signals.fileSet.has("build.gradle.kts") || signals.fileSet.has("build.gradle"))
  ) {
    return signals.fileSet.has("build.gradle.kts") ? "build.gradle.kts" : "build.gradle";
  }
  if (signals.testRunner === "rspec" && signals.fileSet.has("Gemfile")) return "Gemfile";
  if (signals.testRunner === "minitest" && signals.fileSet.has("Gemfile")) return "Gemfile";
  if (signals.testRunner === "dotnet" && signals.csprojPath) return signals.csprojPath;
  if (signals.testRunner === "dotnet" && signals.dotnetBuildScript) return signals.dotnetBuildScript.evidence;
  if (signals.testRunner === "go" && signals.fileSet.has("go.mod")) return "go.mod";
  if (signals.fileSet.has("pyproject.toml")) return "pyproject.toml";
  if (signals.fileSet.has("package.json")) return "package.json";
  return "tests/";
}

function dotnetBuildScriptTestCommand(
  fileSet: Set<string>,
  engBuildSh: string,
): { command: string; evidence: string } | undefined {
  if (!fileSet.has("eng/build.sh")) return undefined;
  if (!/--\[no-\]test|--test\b/.test(engBuildSh)) return undefined;
  return { command: "./eng/build.sh --test", evidence: "eng/build.sh" };
}

function runnerDefaultCommand(
  runner: string | undefined,
  signals: TestCommandSignals,
): string | undefined {
  switch (runner) {
    case "pytest":
      return "pytest";
    case "vitest":
      return "vitest run";
    case "jest":
      return "jest";
    case "cargo":
      return "cargo test";
    case "go":
      return "go test ./...";
    case "maven":
      return "mvn test";
    case "gradle":
      return signals.hasGradlew ? "./gradlew test" : "gradle test";
    case "rspec":
      return "bundle exec rspec";
    case "minitest":
      return "bundle exec rake test";
    case "dotnet":
      if (signals.dotnetBuildScript) return signals.dotnetBuildScript.command;
      return "dotnet test";
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

function isGitLabCiJob(name: string, value: unknown): value is { script?: unknown } {
  if (name.startsWith(".") || GITLAB_CI_RESERVED_KEYS.has(name)) return false;
  if (!value || typeof value !== "object") return false;
  const script = (value as { script?: unknown }).script;
  return typeof script === "string" || (Array.isArray(script) && script.length > 0);
}

function gitLabCiScriptLines(job: { script?: unknown }): string[] {
  const { script } = job;
  if (typeof script === "string") return [script];
  if (!Array.isArray(script)) return [];
  return script.filter((line): line is string => typeof line === "string");
}

function testCommandFromGitLabCi(text: string): string | undefined {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return undefined;
  }
  if (!doc || typeof doc !== "object") return undefined;
  const jobs: Array<[string, { script?: unknown }]> = [];
  for (const [name, value] of Object.entries(doc as Record<string, unknown>)) {
    if (isGitLabCiJob(name, value)) jobs.push([name, value]);
  }
  jobs.sort(
    ([a], [b]) =>
      workflowRank(`.gitlab-ci.yml/${a}`) - workflowRank(`.gitlab-ci.yml/${b}`) || (a < b ? -1 : a > b ? 1 : 0),
  );
  for (const [, job] of jobs) {
    for (const line of gitLabCiScriptLines(job)) {
      const command = pickTestSegment(line);
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
