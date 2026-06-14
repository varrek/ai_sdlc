import type { EmittedFile, NeutralModel } from "../../core/types.js";
import { extractSection } from "../shared/markdown.js";

/**
 * Copilot reads `AGENTS.md` natively and also a `.github/copilot-instructions.md`.
 * We emit the full constitution as `AGENTS.md` and a concise excerpt for Copilot
 * that foregrounds the non-negotiable gates (Copilot weights this file heavily
 * and prefers short, imperative guidance).
 */
export function emitInstructions(model: NeutralModel): EmittedFile[] {
  const gates =
    extractSection(model.constitution, "Non-negotiable gates") ??
    "See AGENTS.md for the full constitution.";

  // Copilot weights this file heavily but does not reliably follow `@import`-style
  // references, so we inline the mined project standards instead of relying solely
  // on AGENTS.md. Only emitted when the overlay actually contributed standards.
  const standards = extractSection(model.constitution, "Project standards (from overlay)");

  const excerpt = [
    "# Copilot instructions",
    "",
    "This repository follows the internal AI SDLC constitution in `AGENTS.md`.",
    "Always honor the non-negotiable gates below; they are not optional.",
    "",
    gates,
    ...(standards ? ["", standards] : []),
    "",
    "Note: Copilot's IDE has no pre-tool gate hook, so the `Approved?` gate is",
    "enforced through this checklist plus branch-protection / CI. Do not push",
    "changes that skip review or fail tests.",
    "",
  ].join("\n");

  return [
    { path: "AGENTS.md", contents: model.constitution },
    { path: ".github/copilot-instructions.md", contents: excerpt },
  ];
}
