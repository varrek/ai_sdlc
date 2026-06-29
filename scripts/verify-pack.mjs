#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { accessSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackContract, stripPackagePrefix, validatePackedFiles } from "./pack-rules.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const contract = buildPackContract(packageJson);

function fail(message) {
  console.error(`verify:pack failed: ${message}`);
  process.exit(1);
}

for (const binPath of contract.binPaths) {
  try {
    accessSync(join(repoRoot, binPath));
  } catch {
    fail(`expected ${binPath} to exist; run npm run build before verifying the package`);
  }
}

let packOutput;
try {
  packOutput = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  const stderr = error?.stderr ? String(error.stderr) : "";
  fail(`npm pack --dry-run failed${stderr ? `: ${stderr.trim()}` : ""}`);
}

let packEntries;
try {
  packEntries = JSON.parse(packOutput);
} catch {
  fail("npm pack --dry-run did not return JSON output");
}

const [packInfo] = packEntries;
if (!packInfo || !Array.isArray(packInfo.files)) {
  fail("npm pack output did not include a files list");
}

const packedFiles = new Set(packInfo.files.map((entry) => stripPackagePrefix(entry.path)));
const validationErrors = validatePackedFiles(packedFiles, contract);
if (validationErrors.length > 0) fail(validationErrors.join("\n"));

console.log(
  `verify:pack checked ${packedFiles.size} files and ${contract.requiredPaths.size} required paths`,
);
