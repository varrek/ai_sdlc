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

const CI_WORKFLOW_HEADER = `name: SDLC Gate
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
`;

/**
 * Best-effort CI runtime setup for the mined test command. The command string is
 * the only language signal available at compile time, so we key the toolchain
 * off it: a Node-flavored command gets `setup-node` + install; a Python-flavored
 * one gets `setup-python` + a conditional dependency install. Anything else runs
 * as-is (the command is expected to be self-contained, e.g. `make test`).
 */
function runtimeSetupSteps(testCommand: string): string {
  if (/\b(npm|pnpm|yarn|npx|vitest|jest|node)\b/.test(testCommand)) {
    return [
      "      - uses: actions/setup-node@v4",
      "        with:",
      "          node-version: lts/*",
      "      - name: Install dependencies",
      "        run: npm ci || npm install",
    ].join("\n");
  }
  if (/\b(pytest|python|pip|tox|nox|uv)\b/.test(testCommand)) {
    return [
      "      - uses: actions/setup-python@v5",
      "        with:",
      '          python-version: "3.x"',
      "      - name: Install dependencies",
      "        run: |",
      "          python -m pip install --upgrade pip",
      "          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi",
      "          if [ -f pyproject.toml ]; then pip install -e . || true; fi",
    ].join("\n");
  }
  return "";
}

/**
 * The CI tests-pass gate. When the overlay carries a mined/answered test command
 * we run it for real (this is the only tests gate on the Copilot IDE path);
 * otherwise we emit the placeholder that prompts the team to wire one in. The
 * no-command form is byte-identical to the historical workflow.
 */
function buildCiWorkflow(model: NeutralModel): string {
  const testCommand = model.overlay.interviewAnswers?.["test-command"]?.trim();
  if (!testCommand) {
    return `${CI_WORKFLOW_HEADER}      - name: Tests must pass
        run: echo "Run the project test command here (tests-must-pass gate)."
`;
  }
  const setup = runtimeSetupSteps(testCommand);
  return (
    CI_WORKFLOW_HEADER +
    (setup ? `${setup}\n` : "") +
    "      - name: Tests must pass\n" +
    `        run: ${testCommand}\n`
  );
}

export function emitGates(model: NeutralModel): EmittedFile[] {
  const gateMode = model.manifest.options?.copilot?.gateMode ?? "ci";
  const files: EmittedFile[] = [
    { path: ".github/hooks/approved-gate.json", contents: stableJson(CLOUD_HOOK) },
    { path: ".github/hooks/approved-gate.mjs", contents: APPROVED_GATE_SCRIPT },
  ];
  // The cloud-agent hook above always applies; the CI backstop is only emitted
  // when gateMode is "ci". Under "instructions" the gate relies solely on the
  // copilot-instructions checklist (e.g. when CI is owned elsewhere).
  if (gateMode === "ci") {
    files.push({ path: ".github/workflows/sdlc-gate.yml", contents: buildCiWorkflow(model) });
  }
  return files;
}
