import { existsSync, readFileSync } from "node:fs";

/** Read newline-delimited JSON records, skipping blank lines and parse failures. */
export function readJsonlFile<T>(
  path: string,
  parseLine: (value: unknown) => T | undefined = (value) => value as T,
): T[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return parseLine(JSON.parse(line));
      } catch {
        return undefined;
      }
    })
    .filter((record): record is T => record !== undefined);
}
