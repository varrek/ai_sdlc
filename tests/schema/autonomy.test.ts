import { describe, expect, it } from "vitest";
import { resolveAutonomy } from "../../src/core/autonomy.js";
import { AutonomyTier, OverlayAutonomy } from "../../src/schema/autonomy.js";

describe("autonomy schema", () => {
  it("defaults to assistive tier with base no-delegation categories", () => {
    const resolved = resolveAutonomy(undefined);
    expect(resolved.tier).toBe("assistive");
    expect(resolved.noDelegation).toContain("production-data");
    expect(resolved.noDelegation).toContain("history-rewrites");
  });

  it("merges overlay additional no-delegation entries", () => {
    const overlay = OverlayAutonomy.parse({
      tier: "drafting",
      additionalNoDelegation: ["customer-pii"],
    });
    const resolved = resolveAutonomy(overlay);
    expect(resolved.tier).toBe("drafting");
    expect(resolved.noDelegation).toContain("customer-pii");
  });

  it("rejects invalid tiers", () => {
    expect(AutonomyTier.safeParse("autonomous").success).toBe(false);
  });
});
