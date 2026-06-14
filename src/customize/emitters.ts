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

/** A stage in the compiled loop. `wrap-up` is the MCP MR/Jira step. */
export type LoopStage = "architect" | "engineer" | "reviewer" | "wrap-up";

/**
 * Map a ceremony track to the loop stages it runs. Quick is the minimal
 * single-writer slice (Engineer -> Reviewer); Standard adds up-front planning;
 * Full adds the integration wrap-up.
 */
export function stagesForTrack(track: CeremonyTrack): LoopStage[] {
  switch (track) {
    case "quick":
      return ["engineer", "reviewer"];
    case "standard":
      return ["architect", "engineer", "reviewer"];
    case "full":
      return ["architect", "engineer", "reviewer", "wrap-up"];
    default: {
      const _exhaustive: never = track;
      return _exhaustive;
    }
  }
}

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

  if (profile.testRunner) {
    standards.push({
      statement: `Tests run with ${profile.testRunner}; the test suite must pass before a change ships.`,
      sources: ev[`test-runner:${profile.testRunner}`] ?? [],
    });
  }
  for (const linter of profile.linters) {
    standards.push({
      statement: `Lint/format with ${linter}.`,
      sources: ev[`linter:${linter}`] ?? [],
    });
  }
  for (const fw of profile.frameworks) {
    standards.push({ statement: `Built with ${fw}; follow its conventions.`, sources: [] });
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
