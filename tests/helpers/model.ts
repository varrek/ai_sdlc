import { HostManifest, Overlay, Skill, type Role } from "../../src/schema/index.js";
import type { NeutralModel } from "../../src/core/types.js";

export function makeSkill(name: string, opts: { disableModelInvocation?: boolean; paths?: string | string[] } = {}): Skill {
  return Skill.parse({
    frontmatter: {
      name,
      description: `Test skill ${name}.`,
      ...(opts.paths !== undefined ? { paths: opts.paths } : {}),
      ...(opts.disableModelInvocation !== undefined
        ? { disableModelInvocation: opts.disableModelInvocation }
        : {}),
    },
    body: `Body of ${name}.`,
  });
}

export function makeModel(overrides: Partial<NeutralModel> = {}): NeutralModel {
  return {
    manifest: HostManifest.parse({ version: 1, hosts: ["cursor", "claude-code", "copilot"] }),
    constitution: [
      "# AI SDLC Constitution (base)",
      "",
      "## Non-negotiable gates",
      "",
      "1. Review required.",
      "2. Tests must pass.",
      "",
      "## Configurable edges (set via overlay)",
      "",
      "- Default ceremony track.",
    ].join("\n"),
    roles: [] as Role[],
    skills: [],
    integrations: [],
    overlay: Overlay.parse({ version: 1 }),
    ...overrides,
  };
}
