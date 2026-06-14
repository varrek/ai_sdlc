/** Minimal `--key value` / `--flag` parser shared by the CLI subcommands. */
export interface ParsedArgs {
  flags: Set<string>;
  options: Map<string, string>;
  positionals: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options.set(key, next);
        i++;
      } else {
        flags.add(key);
      }
    } else {
      positionals.push(arg);
    }
  }

  return { flags, options, positionals };
}
