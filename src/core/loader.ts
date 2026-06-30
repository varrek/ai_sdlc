import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  HostManifest,
  IntegrationContract,
  loadMarkdown,
  loadYaml,
  Overlay,
  PackManifest,
  Role,
  Skill,
} from "../schema/index.js";
import {
  type InstructionHierarchy,
  type ProjectContext,
  parseInstructionHierarchy,
  parseProjectContext,
} from "./project-context.js";
import type { NeutralModel } from "./types.js";

/** Filename of the persisted ProjectContext, written beside the overlay. */
export const PROJECT_CONTEXT_FILE = "project-context.json";
/** Reviewable accepted instruction hierarchy, written beside the overlay. */
export const INSTRUCTION_HIERARCHY_FILE = "instruction-hierarchy.json";

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
  packs: LoadedPack[];
}

export interface LoadedPack {
  manifest: PackManifest;
  dir: string;
  constitution: string;
  roles: Role[];
  skills: Skill[];
  integrations: IntegrationContract[];
}

/** Load the neutral source tree under `baseDir` (typically `sdlc-base/`). */
export function loadBase(baseDir: string, packDirs: string[] = []): LoadedBase {
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

  const packs = packDirs.map(loadPack);
  assertUniqueByName("pack", packs, (pack) => pack.manifest.name);

  return {
    manifest,
    constitution: appendPackConstitutions(constitution, packs),
    roles: assertUniqueByName(
      "role",
      [...roles, ...packs.flatMap((pack) => pack.roles)],
      (role) => role.frontmatter.name,
    ),
    skills: assertUniqueByName(
      "skill",
      [...skills, ...packs.flatMap((pack) => pack.skills)],
      (skill) => skill.frontmatter.name,
    ),
    integrations: assertUniqueByName(
      "integration",
      [...integrations, ...packs.flatMap((pack) => pack.integrations)],
      (integration) => integration.name,
    ),
    packs,
  };
}

function loadPack(packDir: string): LoadedPack {
  const manifest = loadYaml(join(packDir, "pack.yaml"), PackManifest);
  const constitutionPath = join(packDir, "AGENTS.md");
  const constitution = existsSync(constitutionPath)
    ? readFileSync(constitutionPath, "utf8").trim()
    : "";
  const roles = listFiles(join(packDir, "roles"), (n) => n.endsWith(".md")).map((p) =>
    loadMarkdown(p, Role),
  );
  const skills = listSkillFiles(join(packDir, "skills")).map((p) => loadMarkdown(p, Skill));
  const integrations = listFiles(
    join(packDir, "integrations"),
    (n) => n.endsWith(".contract.yaml") || n.endsWith(".contract.yml"),
  ).map((p) => loadYaml(p, IntegrationContract));

  return { manifest, dir: packDir, constitution, roles, skills, integrations };
}

function appendPackConstitutions(constitution: string, packs: LoadedPack[]): string {
  const sections = packs
    .filter((pack) => pack.constitution.length > 0)
    .map((pack) => `## Pack guidance: ${pack.manifest.name}\n\n${pack.constitution}`);
  if (sections.length === 0) return constitution;
  return `${constitution}\n\n${sections.join("\n\n")}`;
}

function assertUniqueByName<T>(kind: string, items: T[], nameOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    const name = nameOf(item);
    if (seen.has(name)) {
      throw new Error(`Duplicate ${kind} '${name}' found while loading base packs.`);
    }
    seen.add(name);
  }
  return items;
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

/** The InstructionHierarchy path that sits beside a given overlay file, if any. */
export function instructionHierarchyPathFor(overlayPath: string | undefined): string | undefined {
  if (!overlayPath) return undefined;
  return join(dirname(overlayPath), INSTRUCTION_HIERARCHY_FILE);
}

/** Load a persisted ProjectContext, or `undefined` when absent or malformed. */
export function loadProjectContext(path: string | undefined): ProjectContext | undefined {
  if (!path || !existsSync(path)) return undefined;
  return parseProjectContext(readFileSync(path, "utf8"));
}

/** Load a persisted InstructionHierarchy, or `undefined` when absent or malformed. */
export function loadInstructionHierarchy(
  path: string | undefined,
): InstructionHierarchy | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    return parseInstructionHierarchy(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

export type { NeutralModel };
export { EMPTY_OVERLAY };
