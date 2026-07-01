import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ReviewLens = z
  .object({
    id: z.string().min(1),
    always: z.boolean().optional(),
    paths: z.array(z.string()).optional(),
    pack: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

const ReviewMatrix = z
  .object({
    version: z.literal(1),
    lenses: z.array(ReviewLens).min(1),
  })
  .strict();

export type ReviewLensDef = z.infer<typeof ReviewLens>;

let cachedMatrix: z.infer<typeof ReviewMatrix> | undefined;

export function loadReviewMatrix(baseDir: string): z.infer<typeof ReviewMatrix> {
  if (cachedMatrix) return cachedMatrix;
  const path = join(baseDir, "review-matrix.yaml");
  const raw = parseYaml(readFileSync(path, "utf8"));
  cachedMatrix = ReviewMatrix.parse(raw);
  return cachedMatrix;
}

/** Reset cached matrix (tests). */
export function resetReviewMatrixCache(): void {
  cachedMatrix = undefined;
}

function pathMatchesGlob(changedPath: string, pattern: string): boolean {
  const normalized = changedPath.replace(/\\/g, "/");
  const regex = globToRegex(pattern);
  return regex.test(normalized);
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/** Return active review lens ids for the given changed paths (R4). */
export function activeReviewLenses(changedPaths: string[], baseDir: string): string[] {
  const matrix = loadReviewMatrix(baseDir);
  const active = new Set<string>();
  for (const lens of matrix.lenses) {
    if (lens.always) {
      active.add(lens.id);
      continue;
    }
    if (!lens.paths?.length) continue;
    for (const changed of changedPaths) {
      if (lens.paths.some((pattern) => pathMatchesGlob(changed, pattern))) {
        active.add(lens.id);
        break;
      }
    }
  }
  return [...active].sort();
}

export function allReviewLensIds(baseDir: string): string[] {
  return loadReviewMatrix(baseDir).lenses.map((l) => l.id);
}
