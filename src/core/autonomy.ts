import {
  AutonomyTier,
  BASE_NO_DELEGATION_CATEGORIES,
  DEFAULT_AUTONOMY_TIER,
  type OverlayAutonomy,
  type ResolvedAutonomy,
} from "../schema/autonomy.js";

/** Merge overlay autonomy with base no-delegation categories. */
export function resolveAutonomy(overlayAutonomy?: OverlayAutonomy): ResolvedAutonomy {
  const tier = overlayAutonomy?.tier ?? DEFAULT_AUTONOMY_TIER;
  const additional = overlayAutonomy?.additionalNoDelegation ?? [];
  const noDelegation = [...new Set([...BASE_NO_DELEGATION_CATEGORIES, ...additional])].sort();
  return { tier, noDelegation };
}

export function isAutonomyTier(value: string): value is AutonomyTier {
  return AutonomyTier.safeParse(value).success;
}
