import type {
  HostId,
  HostManifest,
  IntegrationContract,
  Overlay,
  Role,
  Skill,
} from "../schema/index.js";
import type { ResolvedAutonomy } from "../schema/autonomy.js";
import type { ProjectContext } from "./project-context.js";

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
  /**
   * Structured repo-shape context (per-package instructions, codebase map,
   * exclusions). Absent when compiling without a prior customize; adapters fall
   * back to today's output (single root instruction file) and the static
   * exclusion default.
   */
  projectContext?: ProjectContext;
  /** Resolved autonomy tier and no-delegation list after merge (R1). */
  autonomy?: ResolvedAutonomy;
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

/** How fully a host supports a given capability. Drives the capability matrix. */
export type CapabilityLevel = "native" | "partial" | "fallback" | "none";

/** Per-host support declaration for the orchestration capabilities that matter. */
export interface HostCapabilities {
  /** Project-wide instructions (AGENTS.md and friends). */
  instructions: CapabilityLevel;
  /** Folder- or glob-scoped instruction hierarchy. */
  hierarchicalInstructions: CapabilityLevel;
  /** Agent Skills (SKILL.md). */
  skills: CapabilityLevel;
  /** Role subagents + dispatch. */
  roleSubagents: CapabilityLevel;
  /** Per-role tool/MCP restriction (least-privilege). */
  perRoleToolRestriction: CapabilityLevel;
  /** The Approved? gate / pre-tool hooks. */
  gates: CapabilityLevel;
  /** MCP integration. */
  mcp: CapabilityLevel;
  /** Installable/distributable plugin bundle metadata. */
  pluginDistribution: CapabilityLevel;
  /** Emitted LSP setup guidance for symbol-level navigation. */
  lspGuidance: CapabilityLevel;
}

/**
 * Adapters are pure: given the neutral model they return the files + gaps they
 * would emit. The engine owns all disk I/O, which keeps emit deterministic and
 * trivially golden-testable.
 */
export interface Adapter {
  readonly host: HostId;
  /** Static capability declaration; the capability matrix is generated from this. */
  readonly capabilities: HostCapabilities;
  emit(model: NeutralModel): EmitResult;
}
