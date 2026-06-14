#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { parseArgs } from "./args.js";
import { runCompile } from "./compile.js";
import { buildRegistry } from "../adapters/registry.js";
import { renderCapabilityMatrix } from "../core/capability-matrix.js";
import { HostId } from "../schema/index.js";

const HELP = `aisdlc — internal AI SDLC framework compiler

Usage:
  aisdlc compile --base <dir> --out <dir> [--overlay <file>] [--hosts cursor,claude-code,copilot]

Commands:
  compile     Compile the host-neutral base (+ overlay) to host-native config.
  gen-matrix  Regenerate docs/capability-matrix.md from adapter capabilities.
  customize   Adapt the base to the current repository (U6).
  upgrade     Re-pin the base and replay compile, flagging overlay conflicts (U5).
  smoke       Run the smoke validation gate (U7).
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function cmdCompile(rest: string[]): void {
  const { options } = parseArgs(rest);
  const baseDir = options.get("base") ?? "sdlc-base";
  const outDir = options.get("out");
  if (!outDir) fail("compile: --out <dir> is required");

  const hostsRaw = options.get("hosts");
  const hosts = hostsRaw
    ? hostsRaw.split(",").map((h) => HostId.parse(h.trim()))
    : undefined;

  const result = runCompile({
    baseDir,
    outDir: outDir!,
    overlayPath: options.get("overlay"),
    hosts,
  });

  process.stdout.write(
    `Compiled ${result.files.length} file(s) to ${outDir}` +
      (result.gaps.length ? `, ${result.gaps.length} gap(s) recorded` : "") +
      (result.pruned.length ? `, ${result.pruned.length} orphan(s) pruned` : "") +
      "\n",
  );
}

function cmdGenMatrix(rest: string[]): void {
  const { options } = parseArgs(rest);
  const out = options.get("out") ?? "docs/capability-matrix.md";
  const contents = renderCapabilityMatrix(buildRegistry().all());
  writeFileSync(out, contents, "utf8");
  process.stdout.write(`Wrote ${out}\n`);
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "compile":
      cmdCompile(rest);
      return;
    case "gen-matrix":
      cmdGenMatrix(rest);
      return;
    case "customize":
    case "upgrade":
    case "smoke":
      fail(`'${command}' is not implemented yet.`);
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return;
    default:
      fail(`Unknown command '${command}'.\n\n${HELP}`);
  }
}

main();
