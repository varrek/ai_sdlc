import type { EmittedFile } from "../../core/types.js";

export const LOOP_EVENT_RECORDER_PATH = ".sdlc/hooks/record-loop-event.mjs";

export const LOOP_EVENT_RECORDER_SCRIPT = `#!/usr/bin/env node
// Local ai-sdlc loop event recorder. Generated with host hooks so gate-time
// recording never resolves a registry or globally linked aisdlc binary.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function option(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function readEvents(sdlcDir) {
  const path = join(sdlcDir, "loop_history", "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return undefined; }
    })
    .filter(Boolean);
}

function approvalEventKey(event) {
  if (event.type !== "approval_gate" || event.verdict !== "approved") return undefined;
  const evidence = [...(event.evidence ?? [])].sort().join("\\0");
  const checkpoint = event.checkpoint ?? event.stage;
  if (!checkpoint) return undefined;
  return [event.taskId ?? "unknown", event.role ?? "", checkpoint, evidence].join("\\0");
}

const eventJson = option("--event");
const sdlcDir = option("--sdlc-dir") ?? join(process.cwd(), ".sdlc");
if (!eventJson) {
  console.error("record-loop-event: --event <json> is required");
  process.exit(1);
}

let event;
try {
  event = JSON.parse(eventJson);
} catch (error) {
  console.error("record-loop-event: invalid JSON:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
if (!event.timestamp) event.timestamp = new Date().toISOString();

const key = approvalEventKey(event);
if (key && readEvents(sdlcDir).some((recorded) => approvalEventKey(recorded) === key)) {
  process.exit(0);
}

const path = join(sdlcDir, "loop_history", "events.jsonl");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, \`\${JSON.stringify(event)}\\n\`, { encoding: "utf8", flag: "a" });
`;

export function emitLoopEventRecorder(): EmittedFile {
  return { path: LOOP_EVENT_RECORDER_PATH, contents: LOOP_EVENT_RECORDER_SCRIPT };
}

export function approvedGateScript(hostLabel: string): string {
  return `#!/usr/bin/env node
// ${hostLabel} Approved? gate. Blocks mutating actions until the orchestration
// loop sets SDLC_APPROVED=1 (after human approval).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const approved = process.env.SDLC_APPROVED === "1";

function findSdlcDir() {
  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, ".sdlc");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return join(process.cwd(), ".sdlc");
    dir = parent;
  }
}

function gateStage() {
  const stage = process.env.SDLC_GATE_STAGE || process.env.SDLC_STAGE;
  return ["architect", "engineer", "test", "reviewer", "wrap-up"].includes(stage) ? stage : undefined;
}

if (!approved) {
  console.error("SDLC gate: changes are not Approved? yet. Halting before write/MCP.");
  process.exit(2);
}

const taskId = process.env.SDLC_TASK_ID || "unknown";
const scope = process.env.SDLC_SCOPE || "workspace";
const role = process.env.SDLC_ACTIVE_ROLE || "unknown";
const sdlcDir = process.env.SDLC_DIR || findSdlcDir();
const stage = gateStage();
const checkpoint = process.env.SDLC_CHECKPOINT;
const label = checkpoint || stage || scope;

const event = JSON.stringify({
  type: "approval_gate",
  taskId,
  verdict: "approved",
  role,
  stage,
  checkpoint,
  reason: \`Human approved via SDLC_APPROVED=1 (\${label})\`,
  evidence: [scope, label].filter(Boolean),
});

try {
  const recorder = join(dirname(sdlcDir), "${LOOP_EVENT_RECORDER_PATH}");
  execFileSync("node", [recorder, "--event", event, "--sdlc-dir", sdlcDir], { stdio: "ignore" });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn("Warning: failed to record approval event:", message);
}

process.exit(0);
`;
}
