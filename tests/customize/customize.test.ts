import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify } from "yaml";
import { runCompileCli } from "../../src/cli/compile.js";
import { loadAnswersFile, runCustomize } from "../../src/cli/customize.js";
import { buildStatus } from "../../src/cli/status.js";
import { parseProjectContext } from "../../src/core/project-context.js";
import {
  buildCodebaseMap,
  buildProjectContext,
  buildStandardsIndex,
  diffStandardsIndex,
  suggestTrack,
} from "../../src/customize/emitters.js";
import { computeGaps, DEFERRED_INTEGRATIONS } from "../../src/customize/gap-interview.js";
import { mineRepo } from "../../src/customize/repo-miner.js";
import { Overlay } from "../../src/schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repos = resolve(here, "..", "fixtures", "sample-repos");
const repo = (name: string) => join(repos, name);
const baseDir = resolve(here, "..", "..", "sdlc-base");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function tmpOverlay(): string {
  // Return `<root>/overlay` so the setup-state cache (written to dirname) lands
  // in a unique per-test tmp root rather than a shared dir or a fixture.
  const root = mkdtempSync(join(tmpdir(), "aisdlc-cust-"));
  tmpDirs.push(root);
  return join(root, "overlay");
}

describe("repo miner", () => {
  it("detects framework, test runner, and linter on a Python repo with evidence", () => {
    const p = mineRepo(repo("python-rags"));
    expect(p.languages).toContain("python");
    expect(p.frameworks).toContain("fastapi");
    expect(p.testRunner).toBe("pytest");
    expect(p.linters).toContain("ruff");
    // standards cite real repo paths
    const index = buildStandardsIndex(p);
    const pytestStd = index.standards.find((s) => s.statement.includes("pytest"))!;
    expect(pytestStd.sources).toEqual(expect.arrayContaining(["pyproject.toml"]));
    expect(pytestStd.sources).toEqual(expect.arrayContaining(["Makefile"]));
  });

  it("ignores vendored/env dirs (venv/, __pycache__/)", () => {
    const p = mineRepo(repo("streamlit-venv"));
    expect(p.frameworks).toContain("streamlit");
    expect(p.fileCount).toBe(2); // app.py + requirements.txt only
    for (const paths of Object.values(p.evidence)) {
      for (const path of paths) {
        expect(path).not.toMatch(/venv|__pycache__/);
      }
    }
  });

  it("detects a non-Python stack (TS) — language-agnostic mining", () => {
    const p = mineRepo(repo("ts-app"));
    expect(p.languages).toContain("typescript");
    expect(p.testRunner).toBe("vitest");
    expect(p.linters).toContain("eslint");
  });

  it("ignores a framework named only under an optional/dev dependency group", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-fw-"));
    tmpDirs.push(dir);
    writeFileSync(
      join(dir, "pyproject.toml"),
      [
        "[project]",
        'name = "fastapi"',
        "dependencies = [",
        '  "starlette",',
        "]",
        "",
        "[dependency-groups]",
        "dev = [",
        '  "flask >=3.0.0",', // benchmark/test dep, not the project framework
        "]",
        "",
      ].join("\n"),
      "utf8",
    );
    const p = mineRepo(dir);
    expect(p.frameworks).toContain("fastapi");
    expect(p.frameworks).not.toContain("flask");
  });

  it("does not count a single stray-language file in a large repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-stray-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }), "utf8");
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "analyze.py"), "print(1)\n", "utf8"); // lone .py
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `m${i}.js`), "export {};\n", "utf8");
    const p = mineRepo(dir);
    expect(p.languages).toContain("javascript");
    expect(p.languages).not.toContain("python");
  });

  it("suggests the Quick track for a thin POC and emits a minimal set", () => {
    const p = mineRepo(repo("thin-poc"));
    expect(suggestTrack(p)).toBe("quick");
    expect(buildStandardsIndex(p).standards).toHaveLength(0);
  });

  it("suggests Full for a CI repo with a resolved test command but no known runner (Go)", () => {
    // CI can supply `go test` even when no `_test.go` files exist yet.
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-go-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "go.mod"), "module example.com/x\n\ngo 1.22\n", "utf8");
    writeFileSync(join(dir, "main.go"), "package main\n\nfunc main() {}\n", "utf8");
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "ci.yml"),
      [
        "name: ci",
        "on: [push]",
        "jobs:",
        "  t:",
        "    steps:",
        "      - run: go test ./...",
        "",
      ].join("\n"),
      "utf8",
    );
    const p = mineRepo(dir);
    expect(p.testRunner).toBeUndefined();
    expect(p.testCommand).toBe("go test ./...");
    expect(suggestTrack(p)).toBe("full");
  });

  it("detects Rust/Cargo with integration tests, axum, and clippy", () => {
    const p = mineRepo(repo("rust-cargo"));
    expect(p.languages).toContain("rust");
    expect(p.packageManagers).toContain("cargo");
    expect(p.frameworks).toContain("axum");
    expect(p.testRunner).toBe("cargo");
    expect(p.testCommand).toBe("cargo test");
    expect(p.linters).toContain("clippy");
    expect(p.evidence["test-runner:cargo"]).toEqual(
      expect.arrayContaining(["tests/integration.rs"]),
    );
  });

  it("does not infer cargo test from Cargo.toml alone without test evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-rust-bare-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "Cargo.toml"), '[package]\nname = "x"\nversion = "0.1.0"\n', "utf8");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "lib.rs"), "pub fn x() {}\n", "utf8");
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "tests", "README.md"), "manual tests\n", "utf8");
    const p = mineRepo(dir);
    expect(p.languages).toContain("rust");
    expect(p.testRunner).toBeUndefined();
    expect(p.testCommand).toBeUndefined();
  });

  it("detects Java/Maven with spring-boot and mvn test default", () => {
    const p = mineRepo(repo("java-maven"));
    expect(p.languages).toContain("java");
    expect(p.packageManagers).toContain("maven");
    expect(p.frameworks).toContain("spring-boot");
    expect(p.testRunner).toBe("maven");
    expect(p.testCommand).toBe("mvn test");
    expect(p.architecture?.confidence).toBe("high");
    expect(p.architecture?.sourceRoot).toBe("src/main/java/com/example");
    expect(p.architecture?.modules).toEqual(["owner", "vet"]);
  });

  it("detects Kotlin/Gradle with gradlew test default", () => {
    const p = mineRepo(repo("kotlin-gradle"));
    expect(p.languages).toContain("kotlin");
    expect(p.packageManagers).toContain("gradle");
    expect(p.testRunner).toBe("gradle");
    expect(p.testCommand).toBe("./gradlew test");
  });

  it("detects Ruby/Rails with rspec and rubocop", () => {
    const p = mineRepo(repo("ruby-rails"));
    expect(p.languages).toContain("ruby");
    expect(p.packageManagers).toContain("bundler");
    expect(p.frameworks).toContain("rails");
    expect(p.testRunner).toBe("rspec");
    expect(p.testCommand).toBe("bundle exec rspec");
    expect(p.linters).toContain("rubocop");
  });

  it("detects .NET with dotnet test default from test SDK", () => {
    const p = mineRepo(repo("dotnet-app"));
    expect(p.languages).toContain("csharp");
    expect(p.packageManagers).toContain("dotnet");
    expect(p.testRunner).toBe("dotnet");
    expect(p.testCommand).toBe("dotnet test");
    expect(p.evidence["test-runner:dotnet"]).toEqual(["SampleApp.csproj"]);
  });

  it("detects .NET monorepo test command from eng build script", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-dotnet-eng-"));
    tmpDirs.push(dir);
    mkdirSync(join(dir, "eng"), { recursive: true });
    writeFileSync(
      join(dir, "eng", "build.sh"),
      "#!/usr/bin/env bash\n# Usage:\n#   --[no-]test Run tests.\n",
      "utf8",
    );
    mkdirSync(join(dir, "src", "App"), { recursive: true });
    writeFileSync(
      join(dir, "src", "App", "App.csproj"),
      '<Project Sdk="Microsoft.NET.Sdk" />\n',
      "utf8",
    );
    writeFileSync(join(dir, "src", "App", "Program.cs"), "class Program {}\n", "utf8");

    const p = mineRepo(dir);

    expect(p.languages).toContain("csharp");
    expect(p.testRunner).toBe("dotnet");
    expect(p.testCommand).toBe("./eng/build.sh --test");
    expect(p.evidence["test-runner:dotnet"]).toEqual(["eng/build.sh"]);
  });

  it("detects Go test runner default and golangci-lint from explicit signals", () => {
    const p = mineRepo(repo("go-app"));
    expect(p.languages).toContain("go");
    expect(p.testRunner).toBe("go");
    expect(p.testCommand).toBe("go test ./...");
    expect(p.linters).toContain("golangci-lint");
    expect(p.architecture?.confidence).toBe("high");
    expect(p.architecture?.sourceRoot).toBe(".");
    expect(p.architecture?.modules).toEqual(["internal", "pkg"]);
  });

  it("does not infer minitest from Gemfile alone without a Rakefile test task", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-ruby-minitest-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "Gemfile"), "gem 'minitest'\n", "utf8");
    writeFileSync(join(dir, "app.rb"), "class App; end\n", "utf8");
    mkdirSync(join(dir, "test"), { recursive: true });
    writeFileSync(join(dir, "test", "app_test.rb"), "require 'minitest/autorun'\n", "utf8");
    const p = mineRepo(dir);
    expect(p.languages).toContain("ruby");
    expect(p.testRunner).toBeUndefined();
    expect(p.testCommand).toBeUndefined();
  });

  it("detects Playwright E2E tool without replacing the unit-test command", () => {
    const p = mineRepo(repo("ts-playwright-e2e"));
    expect(p.tools).toContain("playwright");
    expect(p.testRunner).toBe("vitest");
    expect(p.testCommand).toBe("vitest run");
    expect(p.e2eTestCommand).toBe("playwright test");
    expect(p.evidence["tool:playwright"]).toEqual(
      expect.arrayContaining(["package.json", "playwright.config.ts"]),
    );
    const index = buildStandardsIndex(p);
    expect(index.standards.some((s) => s.statement.includes("playwright"))).toBe(true);
    expect(index.standards.some((s) => s.statement.includes("vitest run"))).toBe(true);
  });

  it("detects Cypress from config without inferring from a bare e2e/ directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-cypress-"));
    tmpDirs.push(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "cypress-app", devDependencies: { cypress: "^13.0.0" } }),
      "utf8",
    );
    writeFileSync(join(dir, "cypress.config.ts"), "export default {};\n", "utf8");
    mkdirSync(join(dir, "e2e"), { recursive: true });
    writeFileSync(join(dir, "e2e", "placeholder.txt"), "not a manifest\n", "utf8");
    const withConfig = mineRepo(dir);
    expect(withConfig.tools).toContain("cypress");
    expect(withConfig.e2eTestCommand).toBe("npx cypress run");

    const bare = mkdtempSync(join(tmpdir(), "aisdlc-bare-e2e-"));
    tmpDirs.push(bare);
    writeFileSync(join(bare, "package.json"), JSON.stringify({ name: "bare-e2e" }), "utf8");
    mkdirSync(join(bare, "e2e"), { recursive: true });
    writeFileSync(join(bare, "e2e", "smoke.spec.ts"), "// no tool evidence\n", "utf8");
    const bareProfile = mineRepo(bare);
    expect(bareProfile.tools).toEqual([]);
    expect(bareProfile.e2eTestCommand).toBeUndefined();
  });

  it("does not mine its own emitted config (mining is stable across an in-repo compile)", () => {
    // Regression: real single-repo usage compiles SDLC config (.claude/, .cursor/,
    // AGENTS.md, …) into the repo root. A re-mine must ignore those generated
    // files, or language/track detection drifts and the mined fingerprint changes,
    // breaking freshness/idempotency.
    const work = mkdtempSync(join(tmpdir(), "aisdlc-pollute-"));
    tmpDirs.push(work);
    cpSync(repo("ts-app"), work, { recursive: true });

    const before = mineRepo(work);
    runCompileCli({ baseDir, overlayPath: undefined, outDir: work, sdlcDir: join(work, ".sdlc") });
    const after = mineRepo(work);

    expect(after.fileCount).toBe(before.fileCount);
    expect(after.languages).toEqual(before.languages);
    expect(suggestTrack(after)).toBe(suggestTrack(before));
  });

  it("stays idempotent when compile overwrites pre-existing generated root files", () => {
    // Repos commonly ship their own AGENTS.md / CLAUDE.md (and .claude/.cursor)
    // before adopting the SDLC. Compile overwrites those in place and records
    // them in emitted.json — so the manifest alone can't keep mining stable: the
    // first compile would turn a counted source file into an excluded one. The
    // mined fileCount must not move across an in-repo compile.
    const work = mkdtempSync(join(tmpdir(), "aisdlc-pre-"));
    tmpDirs.push(work);
    cpSync(repo("ts-app"), work, { recursive: true });
    writeFileSync(join(work, "AGENTS.md"), "# hand-written constitution\n", "utf8");
    writeFileSync(join(work, "CLAUDE.md"), "# hand-written guide\n", "utf8");
    writeFileSync(join(work, ".mcp.json"), "{}\n", "utf8");
    writeFileSync(join(work, "portability.gap.yml"), "version: 1\ngaps: []\n", "utf8");
    mkdirSync(join(work, ".claude"), { recursive: true });
    writeFileSync(join(work, ".claude", "settings.json"), "{}\n", "utf8");
    mkdirSync(join(work, ".vscode"), { recursive: true });
    writeFileSync(join(work, ".vscode", "mcp.json"), "{}\n", "utf8");

    const before = mineRepo(work);
    runCompileCli({ baseDir, overlayPath: undefined, outDir: work, sdlcDir: join(work, ".sdlc") });
    const after = mineRepo(work);

    expect(after.fileCount).toBe(before.fileCount);
    expect(after.languages).toEqual(before.languages);
    expect(suggestTrack(after)).toBe(suggestTrack(before));
  });
});

describe("workspace mining (monorepo)", () => {
  it("detects workspace packages from declared globs and mines each independently", () => {
    const p = mineRepo(repo("monorepo"));
    expect(p.packages?.map((pkg) => pkg.path).sort()).toEqual(["packages/api", "packages/web"]);

    const api = p.packages!.find((pkg) => pkg.path === "packages/api")!;
    expect(api.languages).toContain("python");
    expect(api.frameworks).toContain("fastapi");
    expect(api.testCommand).toBe("pytest");

    const web = p.packages!.find((pkg) => pkg.path === "packages/web")!;
    expect(web.languages).toContain("typescript");
    expect(web.frameworks).toContain("next");
    expect(web.testCommand).toBe("vitest run");
  });

  it("re-prefixes per-package evidence so paths stay repo-relative", () => {
    const p = mineRepo(repo("monorepo"));
    for (const pkg of p.packages!) {
      for (const paths of Object.values(pkg.evidence)) {
        for (const path of paths) {
          if (!path.startsWith("git log")) expect(path.startsWith(`${pkg.path}/`)).toBe(true);
        }
      }
    }
  });

  it("scopes per-package standards out of the root and into the project context", () => {
    const p = mineRepo(repo("monorepo"));
    const index = buildStandardsIndex(p);
    const scoped = index.standards.filter((s) => s.scope);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((s) => s.scope === "packages/api" || s.scope === "packages/web")).toBe(
      true,
    );

    // The codebase map has one row per package, each citing evidence.
    const map = buildCodebaseMap(p);
    expect(map.map((m) => m.path).sort()).toEqual(["packages/api", "packages/web"]);
    expect(map.every((m) => m.sources.length > 0)).toBe(true);

    // Per-package instruction bodies carry that package's scoped standards.
    const ctx = buildProjectContext(p, index);
    const apiCtx = ctx.packages.find((pkg) => pkg.path === "packages/api")!;
    expect(apiCtx.instructionBody).toContain("pytest");
    expect(apiCtx.testCommand).toBe("pytest");
  });

  it("leaves packages undefined for a single-package repo (common case unchanged)", () => {
    expect(mineRepo(repo("ts-app")).packages).toBeUndefined();
  });

  it("keeps architecture modules in the map when nested packages are also detected", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-map-merge-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "go.mod"), "module example.com/app\n", "utf8");
    mkdirSync(join(dir, "internal"), { recursive: true });
    writeFileSync(join(dir, "internal", "auth.go"), "package internal\n", "utf8");
    mkdirSync(join(dir, "pkg"), { recursive: true });
    writeFileSync(join(dir, "pkg", "cmd.go"), "package pkg\n", "utf8");
    mkdirSync(join(dir, "web"), { recursive: true });
    writeFileSync(
      join(dir, "web", "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } }),
      "utf8",
    );
    writeFileSync(join(dir, "web", "index.ts"), "export const x = 1;\n", "utf8");
    mkdirSync(join(dir, "tools"), { recursive: true });
    writeFileSync(
      join(dir, "tools", "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } }),
      "utf8",
    );
    writeFileSync(join(dir, "tools", "index.ts"), "export const x = 1;\n", "utf8");

    const map = buildCodebaseMap(mineRepo(dir));

    expect(map.map((entry) => entry.path)).toEqual(["internal", "pkg", "tools", "web"]);
    expect(map.find((entry) => entry.path === "web")?.role).toBe(
      "Typescript, tests via `vitest run`",
    );
  });

  it("excludes playground/demo/__tests__ dirs matched by a declared workspace glob", () => {
    // Mirrors Vite: `playground/**` and `packages/**/__tests__/**` globs also
    // match demo apps and test fixtures — those must not each become a package.
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-ws-"));
    tmpDirs.push(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ workspaces: ["packages/*", "playground/**"] }),
      "utf8",
    );
    for (const real of ["api", "web"]) {
      mkdirSync(join(dir, "packages", real), { recursive: true });
      writeFileSync(
        join(dir, "packages", real, "package.json"),
        JSON.stringify({ name: real }),
        "utf8",
      );
    }
    mkdirSync(join(dir, "packages", "web", "__tests__", "fixture"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "web", "__tests__", "fixture", "package.json"),
      "{}",
      "utf8",
    );
    mkdirSync(join(dir, "playground", "demo"), { recursive: true });
    writeFileSync(join(dir, "playground", "demo", "package.json"), "{}", "utf8");

    const p = mineRepo(dir);
    expect(p.packages?.map((pkg) => pkg.path).sort()).toEqual(["packages/api", "packages/web"]);
  });

  it("does not treat examples/* as workspace packages without a declared workspace", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-ex-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "pyproject.toml"), '[project]\nname = "lib"\n', "utf8");
    for (const name of ["a", "b"]) {
      mkdirSync(join(dir, "examples", name), { recursive: true });
      writeFileSync(
        join(dir, "examples", name, "pyproject.toml"),
        `[project]\nname = "${name}"\n`,
        "utf8",
      );
    }
    expect(mineRepo(dir).packages).toBeUndefined();
  });
});

describe("workspace customize → compile handoff", () => {
  it("persists a parseable project-context.json and emits per-package instruction files", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({ repoRoot: repo("monorepo"), overlayDir });
    expect(result.packageCount).toBe(2);

    const ctxPath = join(overlayDir, "project-context.json");
    const ctx = parseProjectContext(readFileSync(ctxPath, "utf8"));
    expect(ctx?.packages.map((p) => p.path).sort()).toEqual(["packages/api", "packages/web"]);

    // Compile reads the context and writes nested instruction files per host.
    const outDir = mkdtempSync(join(tmpdir(), "aisdlc-mono-out-"));
    tmpDirs.push(outDir);
    runCompileCli({
      baseDir,
      overlayPath: join(overlayDir, ".customize.yaml"),
      outDir,
      sdlcDir: join(overlayDir, ".."),
    });
    expect(existsSync(join(outDir, "packages", "api", "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(outDir, "packages", "web", "AGENTS.md"))).toBe(true);
    expect(
      existsSync(join(outDir, ".github", "instructions", "packages-api.instructions.md")),
    ).toBe(true);

    const apiClaude = readFileSync(join(outDir, "packages", "api", "CLAUDE.md"), "utf8");
    expect(apiClaude).toContain("pytest");
  });
});

describe("test command mining", () => {
  it("records the Makefile recipe when no CI workflow defines tests", () => {
    const p = mineRepo(repo("python-rags"));
    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual(["Makefile"]);
  });

  it("records the package.json script when there is no CI or Makefile", () => {
    const p = mineRepo(repo("ts-app"));
    expect(p.testCommand).toBe("vitest run");
    expect(p.evidence["test-command"]).toEqual(["package.json"]);
  });

  it("prefers CI over package.json, skips non-test workflows, and normalizes && chains", () => {
    const p = mineRepo(repo("ci-repo"));
    // 01-lint.yml has no test step; 02-test.yml (lexicographically first with a
    // test step) wins over the package.json `vitest run` and 03-extra.yml.
    expect(p.testCommand).toBe("npm test");
    expect(p.evidence["test-command"]).toEqual([".github/workflows/02-test.yml"]);
  });

  it("falls back to an inferred runner default for a runner-only repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-runner-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "pyproject.toml"), "[tool.pytest.ini_options]\n", "utf8");
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "tests", "test_x.py"), "def test_x():\n    assert True\n", "utf8");
    const p = mineRepo(dir);
    expect(p.testRunner).toBe("pytest");
    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual(["pyproject.toml"]);
  });

  it("leaves testCommand undefined when there is no test signal", () => {
    const p = mineRepo(repo("thin-poc"));
    expect(p.testCommand).toBeUndefined();
  });

  it("does not fabricate pytest for a tests/ dir with no pytest signal (custom runner)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-custom-runner-"));
    tmpDirs.push(dir);
    writeFileSync(
      join(dir, "pyproject.toml"),
      '[project]\nname = "x"\ndependencies = []\n',
      "utf8",
    );
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "tests", "runtests.py"), "print('custom runner')\n", "utf8");
    writeFileSync(join(dir, "tests", "test_app.py"), "def test_x():\n    assert True\n", "utf8");
    const p = mineRepo(dir);
    expect(p.testRunner).toBeUndefined(); // tests/ alone must not assert pytest
    expect(p.testCommand).toBeUndefined();
    expect(computeGaps(p).map((g) => g.id)).toEqual(["test-command"]); // fall open
  });

  it("skips install steps and normalizes env/CI-template lines in a CI test command", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-ci-norm-"));
    tmpDirs.push(dir);
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "workflows", "ci.yml"),
      [
        "name: ci",
        "on: [push]",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: python -m pip install --upgrade tox", // install: must be ignored
        "      - run: |",
        "          tox run -f py${{ matrix.python-version }}", // CI expression: not runnable
        "          CI=true tox -e py3", // env prefix must be stripped
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(join(dir, "pyproject.toml"), '[project]\nname = "x"\n', "utf8");
    const p = mineRepo(dir);
    expect(p.testCommand).toBe("tox -e py3");
    expect(p.evidence["test-command"]).toEqual([".github/workflows/ci.yml"]);
  });

  it("skips setup lines in a Makefile test recipe", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-make-test-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "pyproject.toml"), "[tool.pytest.ini_options]\n", "utf8");
    writeFileSync(
      join(dir, "Makefile"),
      ["test:", "\tpython -m pip install --upgrade tox", "\tCI=true pytest", ""].join("\n"),
      "utf8",
    );

    const p = mineRepo(dir);

    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual(["Makefile"]);
  });

  it("falls back to a custom Makefile test wrapper when no known runner segment exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-make-wrapper-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "pyproject.toml"), '[project]\nname = "x"\n', "utf8");
    writeFileSync(join(dir, "src.py"), "print('x')\n", "utf8");
    writeFileSync(
      join(dir, "Makefile"),
      ["test:", "\tpython -m pip install -r requirements.txt", "\t./scripts/test.sh", ""].join("\n"),
      "utf8",
    );

    const p = mineRepo(dir);

    expect(p.testCommand).toBe("./scripts/test.sh");
    expect(p.evidence["test-command"]).toEqual(["Makefile"]);
  });
});

describe("test command mining — language & workflow heuristics", () => {
  /** Write a minimal repo at a fresh tmp dir and return its path. */
  function scaffold(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-tc-"));
    tmpDirs.push(dir);
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body, "utf8");
    }
    return dir;
  }

  /** A workflow whose only test step runs `cmd`. */
  const wf = (cmd: string): string =>
    ["name: x", "on: [push]", "jobs:", "  t:", "    steps:", `      - run: ${cmd}`, ""].join("\n");

  it("rejects a minority-language test command (Python repo with an auxiliary npm test)", () => {
    // Mirrors Django: a ~95% Python repo ships a package.json (asset build) and a
    // CI workflow that runs the JS suite via `npm test`. That must NOT be chosen
    // as the project's test command — the gap stays open instead.
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ scripts: { test: "node run-js-tests.js" } }),
      ".github/workflows/ci.yml": wf("npm test"),
    };
    for (let i = 0; i < 12; i++) files[`pkg/mod${i}.py`] = "x = 1\n";
    const p = mineRepo(scaffold(files));
    expect(p.languages).toEqual(expect.arrayContaining(["python", "javascript"]));
    expect(p.testCommand).toBeUndefined(); // npm test rejected, package.json script gated out
    expect(computeGaps(p).map((g) => g.id)).toEqual(["test-command"]); // falls open
  });

  it("keeps a JS test command when JS/TS is a primary language", () => {
    // The mirror case: JS dominates, so `npm test` is legitimately the suite.
    const files: Record<string, string> = { ".github/workflows/ci.yml": wf("npm test") };
    for (let i = 0; i < 12; i++) files[`src/mod${i}.js`] = "export const x = 1;\n";
    files["scripts/analyze.py"] = "print(1)\n"; // lone minority Python file
    const p = mineRepo(scaffold(files));
    expect(p.testCommand).toBe("npm test");
  });

  it("prefers a test/ci-named workflow over an alphabetically-earlier incidental one", () => {
    const p = mineRepo(
      scaffold({
        "pyproject.toml": "[tool.pytest.ini_options]\n",
        ".github/workflows/aaa-nightly.yml": wf("pytest tests/perf/huge.py"),
        ".github/workflows/ci.yml": wf("pytest"),
      }),
    );
    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual([".github/workflows/ci.yml"]);
  });

  it("prefers a test/ci-named job over an earlier incidental job in the same workflow", () => {
    const p = mineRepo(
      scaffold({
        "pyproject.toml": "[tool.pytest.ini_options]\n",
        ".github/workflows/ci.yml": [
          "name: x",
          "on: [push]",
          "jobs:",
          "  aaa-nightly:",
          "    steps:",
          "      - run: pytest tests/perf/huge.py",
          "  test:",
          "    steps:",
          "      - run: pytest",
          "",
        ].join("\n"),
      }),
    );

    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual([".github/workflows/ci.yml"]);
  });

  it("skips shell comments and unexpanded array placeholders in a CI run block", () => {
    const p = mineRepo(
      scaffold({
        "pyproject.toml": "[tool.pytest.ini_options]\n",
        ".github/workflows/ci.yml": [
          "name: x",
          "on: [push]",
          "jobs:",
          "  t:",
          "    steps:",
          "      - run: |",
          "          # build pytest args carefully",
          '          pytest scenarios/ "${PYTEST_ARGS[@]}"',
          "          pytest",
          "",
        ].join("\n"),
      }),
    );
    expect(p.testCommand).toBe("pytest"); // not the comment, not the array-laden line
  });

  it("trims a trailing bare `--` argument separator", () => {
    const p = mineRepo(
      scaffold({ "package.json": "{}", ".github/workflows/ci.yml": wf("npm test --") }),
    );
    expect(p.testCommand).toBe("npm test");
  });
});

describe("test command mining — GitLab CI", () => {
  function scaffold(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-gl-"));
    tmpDirs.push(dir);
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body, "utf8");
    }
    return dir;
  }

  it("extracts pytest from a GitLab CI test job script array", () => {
    const p = mineRepo(
      scaffold({
        "pyproject.toml": "[tool.pytest.ini_options]\n",
        ".gitlab-ci.yml": [
          "stages:",
          "  - test",
          "lint:",
          "  script:",
          "    - flake8 .",
          "test:",
          "  stage: test",
          "  script:",
          "    - pip install -r requirements.txt",
          "    - pytest",
          "",
        ].join("\n"),
      }),
    );
    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual([".gitlab-ci.yml"]);
  });

  it("prefers a test/ci-named GitLab job over an alphabetically earlier incidental job", () => {
    const p = mineRepo(
      scaffold({
        "pyproject.toml": "[tool.pytest.ini_options]\n",
        ".gitlab-ci.yml": [
          "aaa-nightly:",
          "  script:",
          "    - pytest tests/perf/huge.py",
          "ci:",
          "  script:",
          "    - pytest",
          "",
        ].join("\n"),
      }),
    );
    expect(p.testCommand).toBe("pytest");
    expect(p.evidence["test-command"]).toEqual([".gitlab-ci.yml"]);
  });

  it("rejects a minority-language GitLab test command on a Python-primary repo", () => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ scripts: { test: "node run-js-tests.js" } }),
      ".gitlab-ci.yml": ["test:", "  script:", "    - npm test", ""].join("\n"),
    };
    for (let i = 0; i < 12; i++) files[`pkg/mod${i}.py`] = "x = 1\n";
    const p = mineRepo(scaffold(files));
    expect(p.testCommand).toBeUndefined();
    expect(computeGaps(p).map((g) => g.id)).toEqual(["test-command"]);
  });

  it("leaves testCommand undefined when GitLab jobs have no test invocation", () => {
    const p = mineRepo(
      scaffold({
        "pyproject.toml": '[project]\nname = "x"\n',
        ".gitlab-ci.yml": [
          "lint:",
          "  script:",
          "    - flake8 .",
          "deploy:",
          "  script:",
          "    - ./deploy.sh",
          "",
        ].join("\n"),
      }),
    );
    expect(p.testCommand).toBeUndefined();
    expect(computeGaps(p).map((g) => g.id)).toEqual(["test-command"]);
  });

  it("keeps GitHub Actions precedence when both GitHub and GitLab CI are present", () => {
    const wf = (cmd: string): string =>
      ["name: x", "on: [push]", "jobs:", "  t:", "    steps:", `      - run: ${cmd}`, ""].join(
        "\n",
      );
    const p = mineRepo(
      scaffold({
        "pyproject.toml": "[tool.pytest.ini_options]\n",
        ".github/workflows/ci.yml": wf("pytest --github"),
        ".gitlab-ci.yml": ["test:", "  script:", "    - pytest --gitlab", ""].join("\n"),
      }),
    );
    expect(p.testCommand).toBe("pytest --github");
    expect(p.evidence["test-command"]).toEqual([".github/workflows/ci.yml"]);
  });

  it("reports CI provenance for a GitLab-mined test command during customize", () => {
    const dir = scaffold({
      "pyproject.toml": "[tool.pytest.ini_options]\n",
      ".gitlab-ci.yml": ["test:", "  script:", "    - pytest", ""].join("\n"),
    });
    const overlayDir = tmpOverlay();
    const result = runCustomize({ repoRoot: dir, overlayDir });
    expect(result.ready).toBe(true);
    const overlay = Overlay.parse(
      parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8")),
    );
    expect(overlay.interviewAnswers["test-command"]).toBe("pytest");
    const report = buildStatus({ repoRoot: dir, overlayDir });
    expect(report.gapClosureProvenance["test-command"]).toBe("ci");
  });
});

describe("gap interview", () => {
  it("closes the test-command gap from mining and defers integrations (no prompts)", () => {
    const p = mineRepo(repo("python-rags")); // mined test command closes the only blocking gap
    const gaps = computeGaps(p);
    expect(gaps).toEqual([]); // gitlab/jira are deferred, not blocking
    expect(DEFERRED_INTEGRATIONS).toEqual(["gitlab", "jira"]);
  });

  it("keeps the test-command gap open when no command can be mined", () => {
    const p = mineRepo(repo("thin-poc"));
    const gaps = computeGaps(p).map((g) => g.id);
    expect(gaps).toEqual(["test-command"]);
  });

  it("does not close the test-command gap with an empty manual answer", () => {
    const p = mineRepo(repo("thin-poc"));
    const mined = mineRepo(repo("python-rags"));

    expect(computeGaps(p, { "test-command": "" }).map((g) => g.id)).toEqual(["test-command"]);
    expect(computeGaps(p, { "test-command": "   " }).map((g) => g.id)).toEqual(["test-command"]);
    expect(computeGaps(p, { "test-command": "npm test" })).toEqual([]);
    expect(computeGaps(mined, { "test-command": "" }).map((g) => g.id)).toEqual(["test-command"]);
  });
});

describe("standards drift", () => {
  it("reports source and scope changes even when statements stay stable", () => {
    const statement = "Run tests with `npm test`.";

    expect(
      diffStandardsIndex(
        { version: 1, standards: [{ statement, sources: ["package.json"] }] },
        { version: 1, standards: [{ statement, sources: ["package.json"] }] },
      ),
    ).toEqual({ added: [], removed: [], changed: false });

    expect(
      diffStandardsIndex(
        { version: 1, standards: [{ statement, sources: ["ci.yml"] }] },
        { version: 1, standards: [{ statement, sources: ["package.json"] }] },
      ),
    ).toEqual({ added: [], removed: [], changed: true });

    expect(
      diffStandardsIndex(
        {
          version: 1,
          standards: [{ statement, sources: ["package.json"], scope: "packages/api" }],
        },
        { version: 1, standards: [{ statement, sources: ["package.json"] }] },
      ),
    ).toEqual({ added: [], removed: [], changed: true });
  });
});

describe("runCustomize", () => {
  it("reaches setup-ready with integrations deferred and a mined test command", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(result.ready).toBe(true); // no blocking gaps; gitlab/jira deferred
    expect(result.gaps).toEqual([]);
    expect(result.deferredIntegrations).toEqual(["gitlab", "jira"]);
    const raw = parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8"));
    expect(() => Overlay.parse(raw)).not.toThrow();
    const overlay = Overlay.parse(raw);
    expect(overlay.defaultTrack).toBe("standard");
    expect(overlay.interviewAnswers["test-command"]).toBe("pytest"); // persisted for the gate
  });

  it("keeps a repo NOT ready when no test command can be mined", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({ repoRoot: repo("thin-poc"), overlayDir });
    expect(result.ready).toBe(false);
    expect(result.gaps.map((g) => g.id)).toEqual(["test-command"]);
  });

  it("keeps setup not ready when an explicit test-command answer is empty", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({
      repoRoot: repo("python-rags"),
      overlayDir,
      answers: { "test-command": "" },
    });

    expect(result.ready).toBe(false);
    expect(result.gaps.map((g) => g.id)).toEqual(["test-command"]);
    const overlay = Overlay.parse(
      parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8")),
    );
    expect(overlay.interviewAnswers["test-command"]).toBe("");
  });

  it("skips the overlay write on an unchanged re-run and records both phases", () => {
    const overlayDir = tmpOverlay();
    const first = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(first.freshnessSkipped).toBe(false);
    const overlayPath = join(overlayDir, ".customize.yaml");
    const firstWrite = readFileSync(overlayPath, "utf8");

    const state = parseYaml(readFileSync(join(overlayDir, "..", "setup-state.yaml"), "utf8"));
    expect(state.phases.mined?.fingerprint).toBeTruthy();
    expect(state.phases["overlay-written"]?.fingerprint).toBeTruthy();

    const second = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(second.freshnessSkipped).toBe(true);
    expect(readFileSync(overlayPath, "utf8")).toBe(firstWrite); // untouched
  });

  it("rewrites standards when only evidence metadata drifts", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const standardsPath = join(overlayDir, "standards-index.yaml");
    const edited = parseYaml(readFileSync(standardsPath, "utf8")) as StandardsIndex;
    edited.standards[0]!.sources = ["stale-source.txt"];
    writeFileSync(standardsPath, stringify(edited), "utf8");

    const second = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const rewritten = parseYaml(readFileSync(standardsPath, "utf8")) as StandardsIndex;

    expect(second.freshnessSkipped).toBe(false);
    expect(rewritten.standards[0]!.sources).not.toEqual(["stale-source.txt"]);
  });

  it("re-records overlay-written (mined stays fresh) when --answers-file adds a binding (AE4)", () => {
    const overlayDir = tmpOverlay();
    const statePath = join(overlayDir, "..", "setup-state.yaml");
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const minedBefore = parseYaml(readFileSync(statePath, "utf8")).phases.mined.fingerprint;

    const withAnswer = runCustomize({
      repoRoot: repo("python-rags"),
      overlayDir,
      answers: { "gitlab-server": "gitlab-mcp" },
    });
    expect(withAnswer.freshnessSkipped).toBe(false); // overlay changed -> not skipped
    const after = parseYaml(readFileSync(statePath, "utf8")).phases;
    expect(after.mined.fingerprint).toBe(minedBefore); // mining unchanged
    expect(after["overlay-written"].fingerprint).toBeTruthy();
    const overlay = Overlay.parse(
      parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8")),
    );
    expect(overlay.integrations.gitlab?.serverId).toBe("gitlab-mcp");
  });

  it("rewrites when --force is set even if inputs are unchanged", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const forced = runCustomize({ repoRoot: repo("python-rags"), overlayDir, force: true });
    expect(forced.freshnessSkipped).toBe(false);
  });

  it("defaults to Plugin Mode and preserves an explicit deterministic opt-out", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });

    const path = join(overlayDir, ".customize.yaml");
    const first = Overlay.parse(parseYaml(readFileSync(path, "utf8")));
    expect(first.operatingMode).toBe("plugin");

    runCustomize({ repoRoot: repo("python-rags"), overlayDir, operatingMode: "deterministic" });
    const optedOut = Overlay.parse(parseYaml(readFileSync(path, "utf8")));
    expect(optedOut.operatingMode).toBe("deterministic");

    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const preserved = Overlay.parse(parseYaml(readFileSync(path, "utf8")));
    expect(preserved.operatingMode).toBe("deterministic");
  });

  it("loadAnswersFile parses a YAML map and rejects non-string values", () => {
    const dir = mkdtempSync(join(tmpdir(), "aisdlc-ans-"));
    tmpDirs.push(dir);
    const good = join(dir, "answers.yaml");
    writeFileSync(good, "gitlab-server: gitlab-mcp\njira-server: jira-mcp\n", "utf8");
    expect(loadAnswersFile(good)).toEqual({
      "gitlab-server": "gitlab-mcp",
      "jira-server": "jira-mcp",
    });

    const bad = join(dir, "bad.yaml");
    writeFileSync(bad, "gitlab-server:\n  nested: true\n", "utf8");
    expect(() => loadAnswersFile(bad)).toThrow(/must be a string/);
    expect(() => loadAnswersFile(join(dir, "missing.yaml"))).toThrow();
  });

  it("reports a drift delta on re-run instead of a silent rewrite", () => {
    const overlayDir = tmpOverlay();
    runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    const second = runCustomize({ repoRoot: repo("thin-poc"), overlayDir });
    expect(second.drift.changed).toBe(true);
    expect(second.drift.removed.length).toBeGreaterThan(0); // rags standards dropped
  });

  it("binds integrations when interview answers supply them (and clears the deferred list)", () => {
    const overlayDir = tmpOverlay();
    const result = runCustomize({
      repoRoot: repo("python-rags"),
      overlayDir,
      answers: { "gitlab-server": "gitlab-mcp", "jira-server": "jira-mcp" },
    });
    expect(result.ready).toBe(true);
    expect(result.gaps).toHaveLength(0);
    expect(result.deferredIntegrations).toEqual([]); // both bound, nothing deferred
    const overlay = Overlay.parse(
      parseYaml(readFileSync(join(overlayDir, ".customize.yaml"), "utf8")),
    );
    expect(overlay.integrations.gitlab?.serverId).toBe("gitlab-mcp");
    expect(overlay.integrations.jira?.serverId).toBe("jira-mcp");
  });

  it("preserves prior overlay edits (bindings, role model, mode, role addenda) on re-run", () => {
    const overlayDir = tmpOverlay();
    const first = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(first.ready).toBe(true); // setup-ready from the start; integrations deferred

    // User hand-edits the overlay: binds the servers, pins a role model, opts
    // into Plugin Mode, and accepts generated role guidance.
    const path = join(overlayDir, ".customize.yaml");
    const edited = Overlay.parse(parseYaml(readFileSync(path, "utf8")));
    edited.interviewAnswers["gitlab-server"] = "gitlab-mcp";
    edited.integrations.jira = { serverId: "jira-mcp", allowedRoles: [] };
    edited.roleModels.engineer = "opus";
    edited.operatingMode = "plugin";
    edited.roleAddenda.engineer = "Use pytest from the repo root and keep FastAPI routes typed.";
    writeFileSync(path, stringify(edited), "utf8");

    // Re-run with no new answers: prior edits must survive (prior-wins).
    const second = runCustomize({ repoRoot: repo("python-rags"), overlayDir });
    expect(second.ready).toBe(true);
    expect(second.deferredIntegrations).toEqual([]); // both now bound
    const after = Overlay.parse(parseYaml(readFileSync(path, "utf8")));
    expect(after.integrations.gitlab?.serverId).toBe("gitlab-mcp");
    expect(after.integrations.jira?.serverId).toBe("jira-mcp");
    expect(after.roleModels.engineer).toBe("opus");
    expect(after.operatingMode).toBe("plugin");
    expect(after.roleAddenda.engineer).toContain("FastAPI routes");
  });
});
