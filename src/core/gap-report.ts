import { stringify } from "yaml";
import type { Gap } from "./types.js";

/** Stable ordering so the gap report is byte-deterministic across compiles. */
export function sortGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => {
    if (a.host !== b.host) return a.host < b.host ? -1 : 1;
    if (a.capability !== b.capability) return a.capability < b.capability ? -1 : 1;
    return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
  });
}

/**
 * Serialize gaps to the `portability.gap.yml` document. Deterministic: gaps are
 * sorted and keys are emitted in a fixed order so re-compiles diff cleanly.
 */
export function serializeGapReport(gaps: Gap[]): string {
  const sorted = sortGaps(gaps);
  const doc = {
    version: 1,
    gaps: sorted.map((g) => ({ host: g.host, capability: g.capability, reason: g.reason })),
  };
  return stringify(doc, { sortMapEntries: false });
}
