import { stringify } from "yaml";
import {
  DEFAULT_EXCLUSIONS,
  GENERATED_INSTRUCTION_MARKER,
  hostTargetsForScope,
  type InstructionHierarchy,
  type InstructionScope,
  type MapEntry,
  type PackageContext,
  type ProjectContext,
} from "../core/project-context.js";
import {
  type CeremonyTrack,
  type IntegrationBinding,
  type OperatingMode,
  Overlay,
} from "../schema/index.js";
import type { PackageProfile, RepoProfile } from "./repo-miner.js";
import { buildTemplateRoleAddenda } from "./role-addenda-templates.js";

export interface StandardEntry {
  statement: string;
  /** Repo paths that justify the statement (evidence-backed). */
  sources: string[];
  /**
   * The workspace package this standard is scoped to (its repo-relative path).
   * Absent ⇒ a root / cross-cutting standard. Scoped standards are routed to
   * per-package instruction files rather than the root constitution.
   */
  scope?: string;
}

export interface StandardsIndex {
  version: 1;
  standards: StandardEntry[];
}

// The canonical track->stage mapping lives in core/loop.ts (it is shared with
// the per-host dispatch adapters). Re-exported here for the customize surface.
export { type LoopStage, stagesForTrack } from "../core/loop.js";

/**
 * Suggest a ceremony track from repo richness. A thin POC (few files, no tests,
 * no CI) gets Quick — not an over-built config; a repo with CI and a runnable
 * test command gets Full; everything else lands on Standard. Keying Full on the
 * resolved `testCommand` (not just a recognized `testRunner`) means Go, mocha,
 * and tox projects — whose runner isn't one of pytest/jest/vitest — still reach
 * Full when CI proves they have a real, gating suite.
 */
export function suggestTrack(profile: RepoProfile): CeremonyTrack {
  const thin = !profile.testRunner && profile.fileCount <= 6 && profile.ciFiles.length === 0;
  if (thin) return "quick";
  if (profile.ciFiles.length > 0 && (profile.testRunner || profile.testCommand)) return "full";
  return "standard";
}

/** Build an evidence-backed standards index from the mined profile. */
export function buildStandardsIndex(profile: RepoProfile): StandardsIndex {
  const standards: StandardEntry[] = [];
  const ev = profile.evidence;

  if (profile.testRunner || profile.testCommand) {
    const how = profile.testCommand ? `\`${profile.testCommand}\`` : profile.testRunner!;
    const runnerSources = profile.testRunner ? (ev[`test-runner:${profile.testRunner}`] ?? []) : [];
    const sources = [...new Set([...runnerSources, ...(ev["test-command"] ?? [])])];
    standards.push({
      statement: `Run tests with ${how}; the test suite must pass before a change ships.`,
      sources,
    });
  }
  for (const linter of profile.linters) {
    standards.push({
      statement: `Lint/format with ${linter}.`,
      sources: ev[`linter:${linter}`] ?? [],
    });
  }
  for (const fw of profile.frameworks) {
    standards.push({
      statement: `Built with ${fw}; follow its conventions.`,
      sources: ev[`framework:${fw}`] ?? [],
    });
  }
  for (const tool of profile.tools) {
    standards.push({
      statement: `Browser E2E with ${tool}; run E2E tests when user-visible behavior changes.`,
      sources: ev[`tool:${tool}`] ?? [],
    });
  }
  if (profile.e2eTestCommand) {
    standards.push({
      statement: `Run browser E2E tests with \`${profile.e2eTestCommand}\` when UI behavior changes.`,
      sources: ev["e2e-test-command"] ?? [],
    });
  }
  if (profile.ciFiles.length > 0) {
    standards.push({ statement: "CI runs on every change.", sources: profile.ciFiles });
  }
  if (profile.codeowners) {
    standards.push({
      statement: "Respect code ownership defined in CODEOWNERS.",
      sources: [profile.codeowners],
    });
  }

  if (profile.architecture?.confidence === "high") {
    const { sourceRoot, modules, entrypoints, overflowModules } = profile.architecture;
    const where = sourceRoot === "." ? "the repo root" : `\`${sourceRoot}/\``;
    const moduleList = modules.map((m) => `\`${m}\``).join(", ");
    const entry =
      entrypoints.length > 0
        ? ` Entrypoints: ${entrypoints.map((e) => `\`${e}\``).join(", ")}.`
        : "";
    const overflow =
      overflowModules > 0
        ? ` ${overflowModules} additional modules are available in the codebase map.`
        : "";
    const archSources = Object.entries(profile.evidence)
      .filter(([k]) => k.startsWith("architecture:"))
      .flatMap(([, v]) => v);
    standards.push({
      statement: `Project architecture: modules ${moduleList} under ${where}; respect these module boundaries.${entry}${overflow}`,
      sources: [...new Set(archSources)],
    });
  } else if (profile.architecture?.confidence === "low") {
    standards.push({
      statement: `Project architecture confidence is low; do not treat any single directory as authoritative. Reasons: ${profile.architecture.reasons.join("; ")}.`,
      sources: profile.evidence["architecture:low-confidence"] ?? [],
    });
  }
  if (profile.conventions?.commits === "conventional") {
    standards.push({
      statement: "Write commit messages in Conventional Commits format.",
      sources: profile.evidence["convention:commits"] ?? [],
    });
  }
  if (profile.conventions?.testLayout) {
    const statement =
      profile.conventions.testLayout === "co-located"
        ? "Co-locate tests with the code they cover (e.g. `*.test.*`)."
        : "Place tests under a dedicated `tests/` directory.";
    standards.push({ statement, sources: profile.evidence["convention:test-layout"] ?? [] });
  }

  // Per-package (scoped) standards for a detected workspace. These carry a
  // `scope` so the overlay/root constitution excludes them and they instead
  // flow into per-package instruction files (e.g. `packages/api/CLAUDE.md`).
  for (const pkg of profile.packages ?? []) {
    if (pkg.testCommand) {
      standards.push({
        statement: `In \`${pkg.path}\`, run tests with \`${pkg.testCommand}\`.`,
        sources: pkg.evidence["test-command"] ?? [],
        scope: pkg.path,
      });
    }
    for (const linter of pkg.linters) {
      standards.push({
        statement: `In \`${pkg.path}\`, lint/format with ${linter}.`,
        sources: pkg.evidence[`linter:${linter}`] ?? [],
        scope: pkg.path,
      });
    }
    for (const fw of pkg.frameworks) {
      standards.push({
        statement: `\`${pkg.path}\` is built with ${fw}; follow its conventions.`,
        sources: pkg.evidence[`framework:${fw}`] ?? [],
        scope: pkg.path,
      });
    }
  }

  return { version: 1, standards };
}

/**
 * Build a schema-valid project overlay from mining + interview answers. The
 * returned object is parsed through the U1 Overlay schema, so a malformed
 * artifact fails here rather than at compile time.
 *
 * Re-runs are non-destructive: a `prior` overlay (the previously emitted, then
 * possibly hand-edited `.customize.yaml`) wins for the user-owned edges —
 * existing integration bindings, role-model overrides, the chosen track,
 * operating mode, and accepted role addenda are preserved rather than
 * overwritten. Mined standards are always regenerated (drift is reported
 * separately).
 */
export function buildOverlay(
  profile: RepoProfile,
  answers: Record<string, string> = {},
  prior?: Overlay,
  gapClosureProvenance: Overlay["gapClosureProvenance"] = {},
  operatingMode?: OperatingMode,
): Overlay {
  const index = buildStandardsIndex(profile);
  const integrations: Record<string, IntegrationBinding> = { ...(prior?.integrations ?? {}) };
  // Synthesize a binding from an interview answer only when the user has not
  // already provided (or hand-edited) one — prior bindings are authoritative.
  if (answers["gitlab-server"] && !integrations.gitlab) {
    integrations.gitlab = { serverId: answers["gitlab-server"], allowedRoles: ["engineer"] };
  }
  if (answers["jira-server"] && !integrations.jira) {
    integrations.jira = { serverId: answers["jira-server"], allowedRoles: [] };
  }

  const projectContext = buildProjectContext(profile, index);
  const templateAddenda = buildTemplateRoleAddenda(profile, projectContext, answers, {
    ...(prior?.gapClosureProvenance ?? {}),
    ...gapClosureProvenance,
  });

  return Overlay.parse({
    version: 1,
    operatingMode: operatingMode ?? prior?.operatingMode ?? "plugin",
    defaultTrack: prior?.defaultTrack ?? suggestTrack(profile),
    // Only unscoped (root / cross-cutting) standards land in the constitution;
    // package-scoped ones flow into per-package instruction files via the
    // ProjectContext instead, keeping the root lean in a monorepo.
    standards: index.standards.filter((s) => !s.scope).map((s) => s.statement),
    integrations,
    roleModels: prior?.roleModels ?? {},
    roleAddenda: mergeRoleAddenda(prior?.roleAddenda, templateAddenda),
    interviewAnswers: answers,
    gapClosureProvenance: { ...(prior?.gapClosureProvenance ?? {}), ...gapClosureProvenance },
  });
}

/** Prior user/plugin addenda win per role; templates fill only empty keys. */
export function mergeRoleAddenda(
  prior: Overlay["roleAddenda"] | undefined,
  templates: Partial<Record<string, string>>,
): Overlay["roleAddenda"] {
  const merged: Overlay["roleAddenda"] = { ...(prior ?? {}) };
  for (const [role, text] of Object.entries(templates)) {
    if (!merged[role]?.trim()) merged[role] = text;
  }
  return merged;
}

/**
 * Build the navigable codebase map from the mined profile. Prefers workspace
 * packages (one row per package); falls back to the architecture module map for
 * a single-package repo; empty for a genuinely flat repo. Every row cites
 * evidence so the map stays trustworthy.
 */
export function buildCodebaseMap(profile: RepoProfile): MapEntry[] {
  if (profile.architecture?.confidence === "low") return [];
  const map = new Map<string, MapEntry>();
  if (profile.architecture?.confidence === "high") {
    const { sourceRoot, modules } = profile.architecture;
    for (const m of modules) {
      const path = m === "." ? sourceRoot : sourceRoot === "." ? m : `${sourceRoot}/${m}`;
      const cited = profile.evidence[`architecture:module:${m}`]?.[0];
      map.set(path, { path, role: "Source module", sources: [cited ?? path] });
    }
  }
  if (profile.packages && profile.packages.length > 0) {
    for (const pkg of profile.packages) {
      map.set(pkg.path, {
        path: pkg.path,
        role: packageRole(pkg),
        sources: packageMapSources(pkg),
      });
    }
  }
  return [...map.values()].sort(compareMapEntries);
}

function packageRole(pkg: PackageProfile): string {
  const lang = packagePrimaryLanguage(pkg);
  const fw = pkg.frameworks.length > 0 ? ` (${pkg.frameworks.join(", ")})` : "";
  const test = pkg.testCommand ? `, tests via \`${pkg.testCommand}\`` : "";
  return `${lang}${fw}${test}`;
}

function packagePrimaryLanguage(pkg: PackageProfile): string {
  const evidenceText = Object.values(pkg.evidence).flat().join("\n");
  const jsTooling =
    /\b(jest|vitest|eslint)\b/.test(pkg.testCommand ?? "") ||
    pkg.linters.includes("eslint") ||
    /(^|\/)(package\.json|tsconfig\.json|\.eslintrc)/.test(evidenceText);
  if (jsTooling) {
    return pkg.languages.includes("typescript") || /tsconfig\.json/.test(evidenceText)
      ? "Typescript"
      : "Javascript";
  }
  return pkg.languages[0] ? capitalize(pkg.languages[0]) : "Package";
}

function compareMapEntries(a: MapEntry, b: MapEntry): number {
  const aSource = a.role === "Source module";
  const bSource = b.role === "Source module";
  const aParentOfB = b.path.startsWith(`${a.path}/`);
  const bParentOfA = a.path.startsWith(`${b.path}/`);
  if (aParentOfB && aSource !== bSource) return -1;
  if (bParentOfA && aSource !== bSource) return 1;
  return a.path.localeCompare(b.path);
}

function packageMapSources(pkg: PackageProfile): string[] {
  for (const paths of Object.values(pkg.evidence)) {
    if (paths.length > 0) return [paths[0]!];
  }
  return [pkg.path];
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Build the structured ProjectContext handed to the compiler: a rendered
 * instruction body per workspace package (carrying that package's scoped
 * standards), the codebase map, and the exclusion set. For a single-package
 * repo `packages` is empty and only the map + exclusions carry information.
 */
export function buildProjectContext(profile: RepoProfile, index: StandardsIndex): ProjectContext {
  const map = buildCodebaseMap(profile);
  const scopedStandards = standardsByScope(index);
  const instructionHierarchy = buildInstructionHierarchy(profile, index, map, scopedStandards);
  const instructionBodyByPath = new Map(
    instructionHierarchy.scopes.map((scope) => [scope.path, scope.instructionBody]),
  );
  const packages: PackageContext[] = (profile.packages ?? []).map((pkg) => {
    const scoped = scopedStandards.get(pkg.path) ?? [];
    return {
      path: pkg.path,
      languages: pkg.languages,
      testCommand: pkg.testCommand,
      instructionBody:
        instructionBodyByPath.get(pkg.path) ?? renderPackageInstructionBody(pkg.path, scoped),
    };
  });
  return {
    languages: profile.languages,
    packages,
    instructionHierarchy,
    map,
    exclusions: [...DEFAULT_EXCLUSIONS],
  };
}

export function buildInstructionHierarchy(
  profile: RepoProfile,
  index: StandardsIndex,
  map: MapEntry[] = buildCodebaseMap(profile),
  scopedStandards: Map<string, StandardEntry[]> = standardsByScope(index),
): InstructionHierarchy {
  const packagePaths = new Set((profile.packages ?? []).map((pkg) => pkg.path));
  const scopes: InstructionScope[] = [];
  for (const entry of map) {
    if (entry.path === ".") continue;
    const scoped = scopedStandards.get(entry.path) ?? [];
    const kind = packagePaths.has(entry.path) ? "package" : "module";
    scopes.push({
      path: entry.path,
      kind,
      role: entry.role,
      sources: entry.sources,
      instructionBody: renderScopeInstructionBody(entry, kind, scoped),
      hostTargets: hostTargetsForScope(entry.path),
      ownership: "generated",
      accepted: true,
    });
  }
  return { version: 1, scopes };
}

function standardsByScope(index: StandardsIndex): Map<string, StandardEntry[]> {
  const byScope = new Map<string, StandardEntry[]>();
  for (const standard of index.standards) {
    if (!standard.scope) continue;
    const scoped = byScope.get(standard.scope) ?? [];
    scoped.push(standard);
    byScope.set(standard.scope, scoped);
  }
  return byScope;
}

function renderPackageInstructionBody(pkgPath: string, scoped: StandardEntry[]): string {
  const entry: MapEntry = { path: pkgPath, role: "Package", sources: [pkgPath] };
  return renderScopeInstructionBody(entry, "package", scoped);
}

function renderScopeInstructionBody(
  entry: MapEntry,
  kind: InstructionScope["kind"],
  scoped: StandardEntry[],
): string {
  const lines = [
    GENERATED_INSTRUCTION_MARKER,
    "",
    `# \`${entry.path}\` — local ${kind} guidance`,
    "",
    `Role: ${entry.role}.`,
    "",
    "The repo-wide constitution still applies; this file adds local detail compiled",
    "from evidence for this scope.",
    "",
    "## Evidence",
    "",
    ...entry.sources.map((source) => `- \`${source}\``),
    "",
    "## Local standards",
    "",
  ];
  if (scoped.length === 0) {
    lines.push("- No scope-specific standards were mined; follow the root constitution.");
  } else {
    for (const s of scoped) lines.push(`- ${s.statement}`);
  }
  return `${lines.join("\n")}\n`;
}

export function serializeOverlay(overlay: Overlay): string {
  return stringify(overlay, { sortMapEntries: false });
}

export function serializeStandardsIndex(index: StandardsIndex): string {
  return stringify(index, { sortMapEntries: false });
}

export interface EvidenceCoverage {
  total: number;
  covered: number;
  /** Statements with zero cited sources (an evidence-coverage regression). */
  uncited: string[];
}

export interface EvidenceQuality {
  /** Evidence paths that come from roots demoted during architecture mining. */
  lowValueSources: string[];
}

/** Fraction of standards that cite at least one source — the strategy evidence metric. */
export function evidenceCoverage(index: StandardsIndex): EvidenceCoverage {
  const uncited = index.standards.filter((s) => s.sources.length === 0).map((s) => s.statement);
  return {
    total: index.standards.length,
    covered: index.standards.length - uncited.length,
    uncited,
  };
}

export function evidenceQuality(profile: RepoProfile, index: StandardsIndex): EvidenceQuality {
  const demoted = new Set(
    (profile.architecture?.demotedRoots ?? []).filter(
      (root) => ![".circleci", ".github", "tests", "test", "spec", "__tests__"].includes(root),
    ),
  );
  const lowValueSources = new Set<string>();
  for (const standard of index.standards) {
    for (const source of standard.sources) {
      const root = source.split("/")[0] ?? source;
      if (demoted.has(root)) lowValueSources.add(source);
    }
  }
  return { lowValueSources: [...lowValueSources].sort() };
}

/** Root instructions larger than this (lines OR chars) trigger a lean-root advisory. */
const ROOT_ADVISORY_MAX_LINES = 200;
const ROOT_ADVISORY_MAX_CHARS = 10000;

/**
 * Advisory string when the root instruction surface has grown large enough that
 * package-specific guidance should move into per-package files. Returns
 * `undefined` when the root is comfortably within budget. Purely advisory — it
 * never blocks or rewrites anything.
 */
export function rootInstructionAdvisory(rootBody: string): string | undefined {
  const lineCount = rootBody.split("\n").length;
  if (lineCount <= ROOT_ADVISORY_MAX_LINES && rootBody.length <= ROOT_ADVISORY_MAX_CHARS) {
    return undefined;
  }
  return (
    `Root instructions are large (${lineCount} lines, ${rootBody.length} chars). ` +
    "Consider moving package-specific standards into per-package instruction files to keep the root lean."
  );
}

export interface StandardsDrift {
  added: string[];
  removed: string[];
  changed: boolean;
}

/**
 * Drift-aware re-run: compare a freshly built standards index to the prior one
 * and report what changed, so a re-run is a reviewable delta rather than a
 * silent full rewrite.
 */
export function diffStandardsIndex(next: StandardsIndex, prev?: StandardsIndex): StandardsDrift {
  const prevSet = new Set((prev?.standards ?? []).map((s) => s.statement));
  const nextSet = new Set(next.standards.map((s) => s.statement));
  const added = [...nextSet].filter((s) => !prevSet.has(s)).sort();
  const removed = [...prevSet].filter((s) => !nextSet.has(s)).sort();
  const prevByStatement = new Map(
    (prev?.standards ?? []).map((standard) => [standard.statement, standard]),
  );
  const changedMetadata = next.standards.some((standard) => {
    const prior = prevByStatement.get(standard.statement);
    return prior !== undefined && standardMetadataKey(standard) !== standardMetadataKey(prior);
  });
  return { added, removed, changed: added.length > 0 || removed.length > 0 || changedMetadata };
}

function standardMetadataKey(standard: StandardEntry): string {
  return JSON.stringify({
    scope: standard.scope ?? "",
    sources: [...new Set(standard.sources)].sort(),
  });
}
