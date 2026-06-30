import { createHash } from "node:crypto";
import {
  type AcceptedLearningEntry,
  readAcceptedLearnings,
  writeAcceptedLearnings,
} from "../core/accepted-learnings.js";
import type { Overlay } from "../schema/index.js";
import type { StandardsDrift, StandardsIndex } from "./emitters.js";
import type { RepoProfile } from "./repo-miner.js";

export function syncAcceptedLearningsFromCustomize(
  sdlcDir: string,
  profile: RepoProfile,
  overlay: Overlay,
  standardsIndex: StandardsIndex,
  drift: StandardsDrift,
): string {
  const byKey = new Map(readAcceptedLearnings(sdlcDir).map((entry) => [entry.key, entry]));

  const testCommand = overlay.interviewAnswers["test-command"]?.trim();
  if (testCommand) {
    const provenance = overlay.gapClosureProvenance["test-command"] ?? "unknown";
    byKey.set("test-command", {
      key: "test-command",
      kind: "test-command",
      claim: `Accepted test command: \`${testCommand}\``,
      sources: profile.evidence["test-command"] ?? [],
      provenance,
    });
  }

  for (const root of profile.architecture?.demotedRoots ?? []) {
    byKey.set(`architecture:${root}`, {
      key: `architecture:${root}`,
      kind: "architecture-demotion",
      claim: `Do not treat \`${root}\` as primary source — demoted during mining.`,
      sources: profile.architecture?.reasons ?? [],
      provenance: "miner",
    });
  }

  const sourcesByStatement = new Map(
    standardsIndex.standards.map((standard) => [standard.statement, standard.sources]),
  );
  for (const statement of drift.added) {
    byKey.set(`standard:${stableHash(statement)}`, {
      key: `standard:${stableHash(statement)}`,
      kind: "standard-added",
      claim: statement,
      sources: sourcesByStatement.get(statement) ?? [],
      provenance: "miner",
    });
  }

  return writeAcceptedLearnings(sdlcDir, [...byKey.values()]);
}

function stableHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}
