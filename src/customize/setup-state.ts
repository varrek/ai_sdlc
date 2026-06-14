import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify } from "yaml";

/**
 * First-run phases, in execution order. Resume re-runs from the earliest stale
 * phase, so order is load-bearing: a stale phase forces every later phase stale.
 */
export const PHASE_ORDER = ["mined", "overlay-written", "compiled", "smoke-passed"] as const;
export type SetupPhase = (typeof PHASE_ORDER)[number];

export interface PhaseRecord {
  /** Stable hash of the phase's load-bearing inputs. */
  fingerprint: string;
  /** ISO timestamp of when the phase last completed. */
  updatedAt: string;
}

export interface SetupState {
  version: 1;
  phases: Partial<Record<SetupPhase, PhaseRecord>>;
}

/** Where the phase cache lives, relative to a `.sdlc` directory. */
const STATE_FILE = "setup-state.yaml";

function statePath(sdlcDir: string): string {
  return join(sdlcDir, STATE_FILE);
}

const EMPTY_STATE: SetupState = { version: 1, phases: {} };

/**
 * Read the phase cache. A missing file yields empty state silently (a fresh
 * repo); a corrupt file yields empty state too — but warns, so a parse failure
 * is never silently equated with "never run" (which would mask tampering).
 */
export function readSetupState(sdlcDir: string): SetupState {
  const path = statePath(sdlcDir);
  if (!existsSync(path)) return { version: 1, phases: {} };
  try {
    const parsed = parseYaml(readFileSync(path, "utf8")) as Partial<SetupState> | null;
    if (parsed && parsed.phases && typeof parsed.phases === "object") {
      return { version: 1, phases: parsed.phases as SetupState["phases"] };
    }
  } catch {
    process.stderr.write(`Warning: ${path} is unreadable; treating setup as not yet run.\n`);
    return { version: 1, phases: {} };
  }
  return { version: 1, phases: {} };
}

/**
 * Record one or more phase fingerprints atomically (temp-file + rename), so a
 * crash mid-write never leaves a half-updated multi-phase state that a later
 * run could mistake for a completed phase.
 */
export function writeSetupPhases(
  sdlcDir: string,
  records: Partial<Record<SetupPhase, string>>,
): SetupState {
  const state = readSetupState(sdlcDir);
  const now = new Date().toISOString();
  for (const [phase, fingerprint] of Object.entries(records) as [SetupPhase, string][]) {
    state.phases[phase] = { fingerprint, updatedAt: now };
  }
  const path = statePath(sdlcDir);
  mkdirSync(sdlcDir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, stringify({ version: 1, phases: state.phases }, { sortMapEntries: false }), "utf8");
  renameSync(tmp, path);
  return state;
}

/** Stable hash of the given parts (order-sensitive). */
export function fingerprint(parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\u0000");
  }
  return hash.digest("hex").slice(0, 32);
}

/** A single phase is fresh when its recorded fingerprint matches AND its artifact exists. */
export function isPhaseFresh(
  state: SetupState,
  phase: SetupPhase,
  current: string,
  artifactPresent = true,
): boolean {
  const recorded = state.phases[phase];
  return Boolean(recorded) && recorded!.fingerprint === current && artifactPresent;
}

/**
 * Compute which phases are stale (need re-running), in execution order. A phase
 * is stale when its fingerprint differs, its expected artifact is missing, or it
 * was never recorded; once any phase is stale, every later phase is stale too
 * (downstream invalidation). Callers pass current fingerprints only for the
 * phases they can compute — a phase with no current fingerprint is treated as
 * stale only if it was never recorded or an earlier phase forced it.
 */
export function stalePhases(
  state: SetupState,
  current: Partial<Record<SetupPhase, string>>,
  artifactPresent: Partial<Record<SetupPhase, boolean>> = {},
): SetupPhase[] {
  const stale: SetupPhase[] = [];
  let forced = false;
  for (const phase of PHASE_ORDER) {
    const expected = current[phase];
    const recorded = state.phases[phase];
    const artifactOk = artifactPresent[phase] !== false;
    const selfStale =
      expected !== undefined
        ? !recorded || recorded.fingerprint !== expected || !artifactOk
        : !recorded || !artifactOk;
    if (forced || selfStale) {
      stale.push(phase);
      forced = true;
    }
  }
  return stale;
}
