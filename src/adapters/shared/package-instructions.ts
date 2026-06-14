import { stringify } from "yaml";
import type { EmittedFile, NeutralModel } from "../../core/types.js";

/**
 * Per-package instruction files for hosts that read a nested instruction file by
 * name (Claude `CLAUDE.md`, Cursor `AGENTS.md`). One file per detected workspace
 * package, placed inside the package directory. Empty when there is no
 * ProjectContext or no packages — single-package repos are unaffected.
 */
export function packageInstructionFiles(model: NeutralModel, fileName: string): EmittedFile[] {
  const packages = model.projectContext?.packages ?? [];
  return packages.map((pkg) => ({
    path: `${pkg.path}/${fileName}`,
    contents: pkg.instructionBody,
  }));
}

/**
 * Per-package instruction files for Copilot, which scopes instructions via a
 * frontmatter `applyTo` glob in `.github/instructions/<slug>.instructions.md`
 * rather than nested files. The package path is slugified for a flat filename.
 */
export function copilotPackageInstructionFiles(model: NeutralModel): EmittedFile[] {
  const packages = model.projectContext?.packages ?? [];
  return packages.map((pkg) => {
    const slug = pkg.path.replace(/[/\\]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "-");
    const frontmatter = stringify({ applyTo: `${pkg.path}/**` }, { sortMapEntries: false }).trim();
    return {
      path: `.github/instructions/${slug}.instructions.md`,
      contents: `---\n${frontmatter}\n---\n\n${pkg.instructionBody}`,
    };
  });
}
