import {
  HostManifest,
  IntegrationContract,
  Overlay,
  Role,
  Skill,
  type ToolPosture,
} from "../../src/schema/index.js";
import type { NeutralModel } from "../../src/core/types.js";

export function makeRole(
  name: string,
  posture: ToolPosture,
  integrations: string[] = [],
): Role {
  return Role.parse({
    frontmatter: { name, description: `Role ${name}.`, posture, integrations },
    body: `You are the ${name}.`,
  });
}

export function makeContract(name: string): IntegrationContract {
  return IntegrationContract.parse({
    name,
    description: `Contract ${name}.`,
    operations: [{ id: "do-thing", tool: `${name}_do_thing` }],
  });
}

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
