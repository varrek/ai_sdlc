/** Escape a string for a TOML basic string literal. */
export function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/** Render a multiline TOML literal string (deterministic; no trailing newline inside). */
export function tomlMultilineString(value: string): string {
  const body = value.replace(/\r\n/g, "\n").trimEnd();
  return `"""\n${body}\n"""`;
}

/** Render a sorted inline table of string values. */
export function tomlInlineTable(values: Record<string, string>): string {
  const pairs = Object.keys(values)
    .sort()
    .map((key) => `${key} = ${tomlString(values[key]!)}`);
  return `{ ${pairs.join(", ")} }`;
}

/** Render a sorted TOML array of strings. */
export function tomlStringArray(values: string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

/** Join non-empty sections with a blank line; always ends with a trailing newline. */
export function joinTomlSections(sections: string[]): string {
  const body = sections.filter((section) => section.trim().length > 0).join("\n\n");
  return body.length > 0 ? `${body}\n` : "\n";
}
