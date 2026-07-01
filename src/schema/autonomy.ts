import { z } from "zod";

/** Delegation autonomy tier — how much unsupervised execution a role may perform. */
export const AutonomyTier = z.enum(["assistive", "drafting", "executing"]);
export type AutonomyTier = z.infer<typeof AutonomyTier>;

/** Canonical no-delegation categories enforced on every project. */
export const BASE_NO_DELEGATION_CATEGORIES = [
  "production-data",
  "secret-material",
  "deploy-approvals",
  "history-rewrites",
] as const;

export type BaseNoDelegationCategory = (typeof BASE_NO_DELEGATION_CATEGORIES)[number];

/** Overlay tunable autonomy policy (configurable edge). */
export const OverlayAutonomy = z
  .object({
    tier: AutonomyTier.optional(),
    /** Project-specific no-delegation categories merged with base categories. */
    additionalNoDelegation: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type OverlayAutonomy = z.infer<typeof OverlayAutonomy>;

/** Resolved autonomy after merging constitution defaults with overlay. */
export interface ResolvedAutonomy {
  tier: AutonomyTier;
  noDelegation: string[];
}

export const DEFAULT_AUTONOMY_TIER: AutonomyTier = "assistive";
