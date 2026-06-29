import { AdapterRegistry } from "../core/adapter-registry.js";
import { ClaudeCodeAdapter } from "./claude-code/index.js";
import { CodexAdapter } from "./codex/index.js";
import { CopilotAdapter } from "./copilot/index.js";
import { CursorAdapter } from "./cursor/index.js";

/** Build the registry with every host adapter the framework ships. */
export function buildRegistry(): AdapterRegistry {
  return new AdapterRegistry()
    .register(new CursorAdapter())
    .register(new ClaudeCodeAdapter())
    .register(new CopilotAdapter())
    .register(new CodexAdapter());
}
