export const npmDefaultFiles = new Set(["package.json", "README.md", "LICENSE", "LICENSE.md"]);

const directorySentinels = new Map([
  ["sdlc-base", "sdlc-base/AGENTS.md"],
  ["packs", "packs/security/pack.yaml"],
  ["templates", "templates/overlay/README.md"],
]);

export function stripPackagePrefix(path) {
  return path.replace(/^package\//, "");
}

export function stripLeadingDotSlash(path) {
  return path.replace(/^\.\//, "");
}

export function buildPackContract(packageJson) {
  const packageFiles = packageJson.files ?? [];
  const binPaths = Object.values(packageJson.bin ?? {}).map(stripLeadingDotSlash);
  const requiredPaths = new Set([
    ...binPaths,
    ...packageFiles.filter((entry) => entry.includes(".")),
  ]);

  for (const [directory, sentinel] of directorySentinels) {
    if (packageFiles.includes(directory)) {
      requiredPaths.add(sentinel);
    }
  }

  return { binPaths, packageFiles, requiredPaths };
}

export function isAllowedPackageFile(path, contract) {
  if (npmDefaultFiles.has(path) || contract.binPaths.includes(path)) return true;

  return contract.packageFiles.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

export function validatePackedFiles(packedFiles, contract) {
  const errors = [];

  for (const requiredPath of contract.requiredPaths) {
    if (!packedFiles.has(requiredPath)) {
      errors.push(`expected ${requiredPath} to be included in the package`);
    }
  }

  for (const packedFile of packedFiles) {
    if (!isAllowedPackageFile(packedFile, contract)) {
      errors.push(`unexpected development-only file in package: ${packedFile}`);
    }
  }

  return errors;
}
