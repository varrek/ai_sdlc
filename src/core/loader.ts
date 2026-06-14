import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  HostManifest,
  IntegrationContract,
  Overlay,
  Role,
  Skill,
  loadMarkdown,
  loadYaml,
} from "../schema/index.js";
import { parseProjectContext, type ProjectContext } from "./project-context.js";
import type { NeutralModel } from "./types.js";

/** Filename of the persisted ProjectContext, written beside the overlay. */
export const PROJECT_CONTEXT_FILE = "project-context.json";

/** Default empty overlay (a repo that has not run /customize yet). */
const EMPTY_OVERLAY: Overlay = Overlay.parse({ version: 1 });

function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(predicate)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isFile())
    .sort();
}

/** Skill bodies live at `skills/<name>/SKILL.md`. */
function listSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name, "SKILL.md"))
    .filter((p) => existsSync(p) && statSync(p).isFile())
    .sort();
}

export interface LoadedBase {
  manifest: HostManifest;
  constitution: string;
  roles: Role[];
  skills: Skill[];
  integrations: IntegrationContract[];
}

/** Load the neutral source tree under `baseDir` (typically `sdlc-base/`). */
export function loadBase(baseDir: string): LoadedBase {
  const manifest = loadYaml(join(baseDir, "host-manifest.yaml"), HostManifest);
  const constitutionPath = join(baseDir, "AGENTS.md");
  const constitution = existsSync(constitutionPath)
    ? readFileSync(constitutionPath, "utf8").trim()
    : "";

  const roles = listFiles(join(baseDir, "roles"), (n) => n.endsWith(".md")).map((p) =>
    loadMarkdown(p, Role),
  );
  const skills = listSkillFiles(join(baseDir, "skills")).map((p) => loadMarkdown(p, Skill));
  const integrations = listFiles(
    join(baseDir, "integrations"),
    (n) => n.endsWith(".contract.yaml") || n.endsWith(".contract.yml"),
  ).map((p) => loadYaml(p, IntegrationContract));

  return { manifest, constitution, roles, skills, integrations };
}

/** Load an overlay file, or the empty overlay if none exists. */
export function loadOverlay(overlayPath: string | undefined): Overlay {
  if (!overlayPath || !existsSync(overlayPath)) return EMPTY_OVERLAY;
  return loadYaml(overlayPath, Overlay);
}

/** The ProjectContext path that sits beside a given overlay file, if any. */
export function projectContextPathFor(overlayPath: string | undefined): string | undefined {
  if (!overlayPath) return undefined;
  return join(dirname(overlayPath), PROJECT_CONTEXT_FILE);
}

/** Load a persisted ProjectContext, or `undefined` when absent or malformed. */
export function loadProjectContext(path: string | undefined): ProjectContext | undefined {
  if (!path || !existsSync(path)) return undefined;
  return parseProjectContext(readFileSync(path, "utf8"));
}

export { EMPTY_OVERLAY };
export type { NeutralModel };
