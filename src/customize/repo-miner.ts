import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Directories never mined — vendored deps, virtualenvs, caches, build output. */
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
]);

const WALK_DEPTH = 4;

export interface RepoProfile {
  root: string;
  languages: string[];
  frameworks: string[];
  testRunner?: string;
  linters: string[];
  packageManagers: string[];
  manifests: string[];
  ciFiles: string[];
  codeowners?: string;
  docs: string[];
  /** Total non-ignored files seen (drives thin-repo / track suggestion). */
  fileCount: number;
  /** claim -> repo-relative paths that justify it (evidence-backed artifacts). */
  evidence: Record<string, string[]>;
}

function walk(root: string): string[] {
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
        out.push(relative(root, abs));
      }
    }
  };
  visit(root, 0);
  return out.sort();
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

/**
 * Statically mine a repository into a RepoProfile. Detection is language-aware
 * (not language-specific): the same scan recognizes Python, TS/JS, and falls
 * back gracefully. Every claim records the repo paths that justify it so
 * downstream artifacts are evidence-backed.
 */
export function mineRepo(root: string): RepoProfile {
  const files = walk(root);
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
  if (/\bstreamlit\b/.test(requirements) || /\bstreamlit\b/.test(pyproject)) {
    frameworks.add("streamlit");
    addEvidence(evidence, "framework:streamlit", fileSet.has("requirements.txt") ? "requirements.txt" : "pyproject.toml");
  }
  if (/\bfastapi\b/.test(requirements) || /\bfastapi\b/.test(pyproject)) frameworks.add("fastapi");
  if (/\bflask\b/.test(requirements) || /\bflask\b/.test(pyproject)) frameworks.add("flask");
  if (/\bdjango\b/i.test(requirements) || /\bdjango\b/i.test(pyproject)) frameworks.add("django");

  // ---- JS/TS signals ----
  if (fileSet.has("package.json")) {
    packageManagers.add(fileSet.has("pnpm-lock.yaml") ? "pnpm" : fileSet.has("yarn.lock") ? "yarn" : "npm");
    const pkg = safeJson(read(root, "package.json"));
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } as Record<string, string>;
    const testScript = scripts.test ?? "";
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
    if ("react" in deps) frameworks.add("react");
    if ("next" in deps) frameworks.add("next");
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

  return {
    root,
    languages: [...languages].sort(),
    frameworks: [...frameworks].sort(),
    testRunner,
    linters: [...linters].sort(),
    packageManagers: [...packageManagers].sort(),
    manifests: manifests.sort(),
    ciFiles: ciFiles.sort(),
    codeowners,
    docs: docs.sort(),
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

export { IGNORE_DIRS };
