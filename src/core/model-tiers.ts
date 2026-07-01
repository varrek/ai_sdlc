import type { ModelTier } from "../schema/role.js";

/** Default abstract tier per base role when frontmatter omits modelTier (R10). */
export const DEFAULT_ROLE_MODEL_TIER: Record<string, ModelTier> = {
  architect: "high-reasoning",
  debugger: "high-reasoning",
  reviewer: "standard",
  tester: "narrow-fast",
  engineer: "standard",
};
