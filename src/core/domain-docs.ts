import { join } from "node:path";
import type { ProjectContext } from "./project-context.js";

export interface DomainDocEntry {
  domain: string;
  docPath: string;
  codePaths: string[];
  evidence: string[];
}

export interface DomainDocScaffold {
  entries: DomainDocEntry[];
  mapPath: string;
}

const MIN_ARCHITECTURE_ROOTS = 2;

/**
 * Scaffold domain docs when miner finds multiple architecture roots with evidence (R8).
 * Returns undefined when signal is too weak — no boilerplate for small repos.
 */
export function scaffoldDomainDocs(
  projectContext: ProjectContext | undefined,
  overlayDir: string,
  minRoots = MIN_ARCHITECTURE_ROOTS,
): DomainDocScaffold | undefined {
  const map = projectContext?.map ?? [];
  if (map.length < minRoots) return undefined;

  const entries: DomainDocEntry[] = [];
  for (const entry of map) {
    const domain = sanitizeDomain(entry.role || entry.path);
    entries.push({
      domain,
      docPath: join(".sdlc", "overlay", "domain-docs", `${domain}.md`),
      codePaths: [entry.path],
      evidence: [entry.path],
    });
  }

  if (entries.length < minRoots) return undefined;

  return {
    entries,
    mapPath: join(overlayDir, "code-path-map.yaml"),
  };
}

function sanitizeDomain(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
