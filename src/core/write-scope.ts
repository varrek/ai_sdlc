import type { Role, ToolPosture, WriteScope } from "../schema/index.js";

/** Default glob patterns for Tester path-scoped writes (R3). */
export const TESTER_DEFAULT_WRITE_ALLOW = [
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/*.{test,spec}.{ts,tsx,js,jsx,py,go,rs,java,rb,php}",
  "**/*_test.go",
  "**/test_*.py",
] as const;

/** Read-only roles emit no write capability. */
export const READ_ONLY_ROLES = new Set(["architect", "reviewer", "debugger"]);

export function defaultWriteScopeForRole(
  name: string,
  posture: ToolPosture,
): WriteScope | undefined {
  if (READ_ONLY_ROLES.has(name)) {
    return { allow: [], deny: ["**"] };
  }
  if (name === "tester") {
    return { allow: [...TESTER_DEFAULT_WRITE_ALLOW], deny: ["**/src/**", "**/lib/**"] };
  }
  if (posture === "write") {
    return { allow: ["**"], deny: [] };
  }
  return undefined;
}

/** Apply merge-time writeScope defaults when the role omits an explicit scope. */
export function resolveWriteScope(role: Role): WriteScope | undefined {
  const explicit = role.frontmatter.writeScope;
  if (explicit) return explicit;
  return defaultWriteScopeForRole(role.frontmatter.name, role.frontmatter.posture);
}
