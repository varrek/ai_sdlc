import { stringify } from "yaml";
import { Overlay, type CeremonyTrack, type IntegrationBinding } from "../schema/index.js";
import type { RepoProfile } from "./repo-miner.js";

export interface StandardEntry {
  statement: string;
  /** Repo paths that justify the statement (evidence-backed). */
  sources: string[];
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
 * no CI) gets Quick — not an over-built config; a repo with both CI and a test
 * runner gets Full; everything else lands on Standard.
 */
export function suggestTrack(profile: RepoProfile): CeremonyTrack {
  const thin = !profile.testRunner && profile.fileCount <= 6 && profile.ciFiles.length === 0;
  if (thin) return "quick";
  if (profile.ciFiles.length > 0 && profile.testRunner) return "full";
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
  if (profile.ciFiles.length > 0) {
    standards.push({ statement: "CI runs on every change.", sources: profile.ciFiles });
  }
  if (profile.codeowners) {
    standards.push({
      statement: "Respect code ownership defined in CODEOWNERS.",
      sources: [profile.codeowners],
    });
  }

  if (profile.architecture) {
    const { sourceRoot, modules, entrypoints } = profile.architecture;
    const where = sourceRoot === "." ? "the repo root" : `\`${sourceRoot}/\``;
    const moduleList = modules.map((m) => `\`${m}\``).join(", ");
    const entry = entrypoints.length > 0 ? ` Entrypoints: ${entrypoints.map((e) => `\`${e}\``).join(", ")}.` : "";
    const archSources = Object.entries(profile.evidence)
      .filter(([k]) => k.startsWith("architecture:"))
      .flatMap(([, v]) => v);
    standards.push({
      statement: `Project architecture: modules ${moduleList} under ${where}; respect these module boundaries.${entry}`,
      sources: [...new Set(archSources)],
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

  return { version: 1, standards };
}

/**
 * Build a schema-valid project overlay from mining + interview answers. The
 * returned object is parsed through the U1 Overlay schema, so a malformed
 * artifact fails here rather than at compile time.
 *
 * Re-runs are non-destructive: a `prior` overlay (the previously emitted, then
 * possibly hand-edited `.customize.yaml`) wins for the user-owned edges —
 * existing integration bindings, role-model overrides, and the chosen track are
 * preserved rather than overwritten. Mined standards are always regenerated
 * (drift is reported separately).
 */
export function buildOverlay(
  profile: RepoProfile,
  answers: Record<string, string> = {},
  prior?: Overlay,
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

  return Overlay.parse({
    version: 1,
    defaultTrack: prior?.defaultTrack ?? suggestTrack(profile),
    standards: index.standards.map((s) => s.statement),
    integrations,
    roleModels: prior?.roleModels ?? {},
    interviewAnswers: answers,
  });
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

/** Fraction of standards that cite at least one source — the strategy evidence metric. */
export function evidenceCoverage(index: StandardsIndex): EvidenceCoverage {
  const uncited = index.standards.filter((s) => s.sources.length === 0).map((s) => s.statement);
  return { total: index.standards.length, covered: index.standards.length - uncited.length, uncited };
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
export function diffStandardsIndex(
  next: StandardsIndex,
  prev?: StandardsIndex,
): StandardsDrift {
  const prevSet = new Set((prev?.standards ?? []).map((s) => s.statement));
  const nextSet = new Set(next.standards.map((s) => s.statement));
  const added = [...nextSet].filter((s) => !prevSet.has(s)).sort();
  const removed = [...prevSet].filter((s) => !nextSet.has(s)).sort();
  return { added, removed, changed: added.length > 0 || removed.length > 0 };
}
