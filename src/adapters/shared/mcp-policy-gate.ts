/** Emitted script fragment: fail closed when a role policy file exists but is invalid. */
export function mcpPolicyLoaderScript(policyPath: string): string {
  return `let policy = {};
if (existsSync("${policyPath}")) {
  try {
    policy = JSON.parse(readFileSync("${policyPath}", "utf8"));
  } catch {
    console.error("SDLC gate: role policy exists but could not be parsed.");
    process.exit(2);
  }
}
const hasPolicy = Object.keys(policy).length > 0;`;
}
