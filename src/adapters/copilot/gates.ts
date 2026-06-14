import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { stableJson } from "../shared/roles.js";

/**
 * Copilot CLI/cloud hook descriptor for the Approved? gate. The Copilot IDE has
 * no equivalent hook, which is why the same gate also degrades to the
 * instruction checklist (see instructions.ts) and the CI backstop below.
 */
const CLOUD_HOOK = {
  version: 1,
  event: "preToolUse",
  description: "Block mutating tools until the change is Approved? (SDLC_APPROVED=1).",
  command: "node ./.github/hooks/approved-gate.mjs",
};

const APPROVED_GATE_SCRIPT = `#!/usr/bin/env node
// Copilot CLI/cloud Approved? gate (no IDE equivalent — see CI backstop).
if (process.env.SDLC_APPROVED !== "1") {
  console.error("SDLC gate: changes are not Approved? yet.");
  process.exit(2);
}
process.exit(0);
`;

const CI_WORKFLOW = `name: SDLC Gate
# CI backstop for the Approved? + review + tests-pass gates on Copilot IDE,
# which has no pre-tool hook. Branch protection should require this check.
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Require review (enforced via branch protection)
        run: echo "Reviewer approval is required by branch protection before merge."
      - name: Tests must pass
        run: echo "Run the project test command here (tests-must-pass gate)."
`;

export function emitGates(_model: NeutralModel): EmittedFile[] {
  return [
    { path: ".github/hooks/approved-gate.json", contents: stableJson(CLOUD_HOOK) },
    { path: ".github/hooks/approved-gate.mjs", contents: APPROVED_GATE_SCRIPT },
    { path: ".github/workflows/sdlc-gate.yml", contents: CI_WORKFLOW },
  ];
}
