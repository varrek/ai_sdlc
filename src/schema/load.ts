import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * Raised when a source artifact fails schema validation. The message always
 * names the offending file and the zod path(s) within it, so authors can jump
 * straight to the bad field instead of guessing.
 */
export class SchemaValidationError extends Error {
  readonly filePath: string;
  readonly issues: z.ZodIssue[];

  constructor(filePath: string, issues: z.ZodIssue[]) {
    const detail = issues
      .map((issue) => {
        const at = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `  - ${at}: ${issue.message}`;
      })
      .join("\n");
    super(`Invalid schema in ${filePath}:\n${detail}`);
    this.name = "SchemaValidationError";
    this.filePath = filePath;
    this.issues = issues;
  }
}

function validate<S extends z.ZodTypeAny>(filePath: string, schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SchemaValidationError(filePath, result.error.issues);
  }
  return result.data;
}

/** Parse + validate a YAML document (host manifest, integration contract, overlay). */
export function loadYaml<S extends z.ZodTypeAny>(filePath: string, schema: S): z.infer<S> {
  const raw = readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SchemaValidationError(filePath, [
      { code: z.ZodIssueCode.custom, path: [], message: `YAML parse error: ${message}` },
    ]);
  }
  return validate(filePath, schema, parsed);
}

/**
 * Parse a markdown-with-frontmatter artifact (role, skill) into
 * `{ frontmatter, body }` and validate against the given schema.
 */
export function loadMarkdown<S extends z.ZodTypeAny>(filePath: string, schema: S): z.infer<S> {
  const raw = readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return validate(filePath, schema, { frontmatter: data, body: content.trim() });
}

export { z };
