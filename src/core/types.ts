import type {
  HostId,
  HostManifest,
  IntegrationContract,
  Overlay,
  Role,
  Skill,
} from "../schema/index.js";

/**
 * The fully-resolved, host-neutral model produced by loading `sdlc-base/` and
 * merging the project overlay. Every adapter reads this and nothing else — it
 * is the single source of truth the compiler dispatches from.
 */
export interface NeutralModel {
  manifest: HostManifest;
  /** Raw constitution markdown (AGENTS.md), with overlay standards appended. */
  constitution: string;
  roles: Role[];
  skills: Skill[];
  integrations: IntegrationContract[];
  overlay: Overlay;
}

/** A single file an adapter wants written, with a path relative to the target repo root. */
export interface EmittedFile {
  /** POSIX-style path relative to the compile output directory. */
  path: string;
  contents: string;
}

/** A capability that could not be mapped cleanly to a host (honest degradation). */
export interface Gap {
  host: HostId;
  capability: string;
  reason: string;
}

export interface EmitResult {
  files: EmittedFile[];
  gaps: Gap[];
}

/**
 * Adapters are pure: given the neutral model they return the files + gaps they
 * would emit. The engine owns all disk I/O, which keeps emit deterministic and
 * trivially golden-testable.
 */
export interface Adapter {
  readonly host: HostId;
  emit(model: NeutralModel): EmitResult;
}
