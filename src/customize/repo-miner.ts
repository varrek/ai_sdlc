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
  /** Total non-ignored files seen (drives thin-repo / track suggestion). */
  fileCount: number;
  /** claim -> repo-relative paths that justify it (evidence-backed artifacts). */
  evidence: Record<string, string[]>;
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
        if (excluded.has(rel)) continue;
        out.push(rel);
      }
    }
  };
  visit(root, 0);
  return out.sort();
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
export function mineRepo(root: string): RepoProfile {
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

  for (const f of files) {
    const ext = f.slice(f.lastIndexOf("."));
    if (ext === ".py") {
      languages.add("python");
    } else if (ext === ".ts" || ext === ".tsx") {
      languages.add("typescript");
    } else if (ext === ".js" || ext === ".jsx" || ext === ".mjs") {
      languages.add("javascript");
    } else if (ext === ".go") {
      languages.add("go");
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
  const hasTestsDir = files.some((f) => f.startsWith("tests/") || f.startsWith("test/"));

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
  const pytestNamed =
    pyproject.includes("pytest") ||
    requirements.includes("pytest") ||
    makefile.includes("pytest");
  if (languages.has("python") && (pytestNamed || hasTestsDir)) {
    testRunner = "pytest";
    if (pyproject.includes("pytest")) addEvidence(evidence, "test-runner:pytest", "pyproject.toml");
    if (makefile.includes("pytest")) addEvidence(evidence, "test-runner:pytest", "Makefile");
    if (hasTestsDir) addEvidence(evidence, "test-runner:pytest", "tests/");
  }
  const pyDepFile = fileSet.has("requirements.txt") ? "requirements.txt" : "pyproject.toml";
  const addPyFramework = (name: string, re: RegExp): void => {
    if (re.test(requirements) || re.test(pyproject)) {
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
    if ("prettier" in deps) linters.add("prettier");
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
  const testCommand = resolveTestCommand(root, {
    ciFiles,
    fileSet,
    makefile,
    pkgTestScript,
    testRunner,
  });
  if (testCommand) addEvidence(evidence, "test-command", testCommand.evidence);

  // ---- Architecture + conventions ----
  const architecture = mineArchitecture(root, files, fileSet, evidence);
  const conventions = mineConventions(root, files, evidence);

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
    fileCount: files.length,
    evidence,
  };
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

interface TestCommandSignals {
  ciFiles: string[];
  fileSet: Set<string>;
  makefile: string;
  pkgTestScript: string;
  testRunner: string | undefined;
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
  // 1. CI — first GitHub Actions workflow (lexicographic) with a test step.
  const workflows = signals.ciFiles.filter((f) => f.startsWith(".github/workflows/")).sort();
  for (const wf of workflows) {
    const command = testCommandFromWorkflow(read(root, wf));
    if (command) return { command, evidence: wf };
  }
  // 2. Makefile `test:` target recipe.
  const mk = testCommandFromMakefile(signals.makefile);
  if (mk) return { command: mk, evidence: "Makefile" };
  // 3. package.json scripts.test.
  const script = signals.pkgTestScript.trim();
  if (script && !/no test specified/i.test(script)) {
    return { command: pickTestSegment(script) ?? script, evidence: "package.json" };
  }
  // 4. Inferred runner default (e.g. a pytest repo with no scripts).
  const fallback = runnerDefaultCommand(signals.testRunner);
  if (fallback) {
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

/** Normalize a shell line to the test invocation, dropping `&&`-chained prefixes. */
function pickTestSegment(run: string): string | undefined {
  const segments = run
    .split(/\n|&&/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const segment of segments) {
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
