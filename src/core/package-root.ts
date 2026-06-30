import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function bundledPath(...segments: string[]): string {
  return join(PACKAGE_ROOT, ...segments);
}

export function resolveDefaultBaseDir(): string {
  return resolveDefaultBaseDirFrom(PACKAGE_ROOT, process.cwd());
}

export function resolveDefaultBaseDirFrom(packageRoot: string, cwd: string): string {
  const bundledBase = join(packageRoot, "sdlc-base");
  if (isBaseDir(bundledBase)) return bundledBase;

  const checkoutBase = join(cwd, "sdlc-base");
  if (isBaseDir(checkoutBase)) return checkoutBase;

  throw new Error(
    "Could not find bundled sdlc-base. Pass --base <dir> or reinstall ai-sdlc with runtime assets.",
  );
}

function isBaseDir(path: string): boolean {
  return existsSync(join(path, "host-manifest.yaml"));
}
