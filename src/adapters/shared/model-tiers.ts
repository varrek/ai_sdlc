import type { HostId } from "../../schema/index.js";
import type { ModelTier } from "../../schema/role.js";
import { DEFAULT_ROLE_MODEL_TIER } from "../../core/model-tiers.js";

/** Host-specific model SKU mapping for abstract tiers (R10). */
export interface TierMapping {
  "narrow-fast": string;
  standard: string;
  "high-reasoning": string;
}

const HOST_TIER_MAP: Partial<Record<HostId, TierMapping>> = {
  cursor: {
    "narrow-fast": "composer-2.5-fast",
    standard: "claude-4.6-sonnet-medium-thinking",
    "high-reasoning": "claude-opus-4-8-thinking-xhigh",
  },
  "claude-code": {
    "narrow-fast": "claude-haiku-4-5",
    standard: "claude-sonnet-4-6",
    "high-reasoning": "claude-opus-4-6",
  },
  copilot: {
    "narrow-fast": "gpt-4.1-mini",
    standard: "gpt-4.1",
    "high-reasoning": "gpt-5.3-codex",
  },
  codex: {
    "narrow-fast": "gpt-5.3-codex-mini",
    standard: "gpt-5.3-codex",
    "high-reasoning": "gpt-5.5-extra-high",
  },
  kiro: {
    "narrow-fast": "standard",
    standard: "standard",
    "high-reasoning": "standard",
  },
};

export { DEFAULT_ROLE_MODEL_TIER };

export function resolveModelForHost(
  host: HostId,
  tier: ModelTier,
  explicitModel?: string,
): { model: string; degraded?: boolean } {
  if (explicitModel) return { model: explicitModel };
  const mapping = HOST_TIER_MAP[host];
  if (!mapping) return { model: tier, degraded: true };
  const model = mapping[tier];
  if (!model) {
    const fallback = mapping.standard;
    return { model: fallback, degraded: true };
  }
  return { model };
}
