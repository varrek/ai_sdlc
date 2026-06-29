import type { PackageContext, ProjectContext } from "./project-context.js";

export const LSP_GUIDANCE_PATH = ".sdlc/lsp-guidance.md";

export interface LspRecommendation {
  language: string;
  server: string;
  installHint: string;
  packagePaths: string[];
}

export interface LspGuidance {
  recommendations: LspRecommendation[];
  unknownLanguages: string[];
}

const LSP_BY_LANGUAGE: Record<string, Omit<LspRecommendation, "language" | "packagePaths">> = {
  typescript: {
    server: "typescript-language-server",
    installHint: "Use the workspace TypeScript SDK and typescript-language-server.",
  },
  javascript: {
    server: "typescript-language-server",
    installHint: "Use typescript-language-server for JavaScript and TypeScript navigation.",
  },
  python: {
    server: "pyright",
    installHint: "Use pyright with the repo's virtualenv or configured Python interpreter.",
  },
  go: {
    server: "gopls",
    installHint: "Use gopls with module/workspace roots from this repo.",
  },
  java: {
    server: "jdtls",
    installHint: "Use Eclipse JDT Language Server with the repo's Maven or Gradle configuration.",
  },
  kotlin: {
    server: "kotlin-language-server",
    installHint: "Use kotlin-language-server when Kotlin sources are present.",
  },
  csharp: {
    server: "csharp-ls",
    installHint: "Use csharp-ls or the host's C# language-server plugin for solution navigation.",
  },
  rust: {
    server: "rust-analyzer",
    installHint: "Use rust-analyzer with the repo's Cargo workspace.",
  },
};

export function buildLspGuidance(context: ProjectContext | undefined): LspGuidance {
  const byLanguage = new Map<string, Set<string>>();
  const unknown = new Set<string>();
  const packages = context?.packages ?? [];

  for (const language of context?.languages ?? []) addLanguage(byLanguage, unknown, language, ".");
  if (packages.length > 0) {
    for (const pkg of packages) addPackageLanguages(byLanguage, unknown, pkg);
  }

  const recommendations: LspRecommendation[] = [...byLanguage.entries()]
    .map(([language, paths]) => ({
      language,
      packagePaths: [...paths].sort(),
      ...LSP_BY_LANGUAGE[language]!,
    }))
    .sort((a, b) => a.language.localeCompare(b.language));

  return { recommendations, unknownLanguages: [...unknown].sort() };
}

export function renderLspGuidance(context: ProjectContext | undefined): string {
  const guidance = buildLspGuidance(context);
  const lines = [
    "# LSP guidance",
    "",
    "Generated from ai-sdlc's mined project context. Install and run language servers through your IDE or host plugin; ai-sdlc only emits setup guidance.",
    "",
  ];

  if (guidance.recommendations.length === 0 && guidance.unknownLanguages.length === 0) {
    lines.push("No language-specific LSP recommendations were mined for this repo.");
  }

  for (const rec of guidance.recommendations) {
    lines.push(
      `## ${capitalize(rec.language)}`,
      "",
      `- Server: \`${rec.server}\``,
      `- Applies to: ${rec.packagePaths.map((p) => `\`${p}\``).join(", ")}`,
      `- Setup note: ${rec.installHint}`,
      "",
    );
  }

  if (guidance.unknownLanguages.length > 0) {
    lines.push(
      "## No mapped recommendation",
      "",
      `ai-sdlc does not yet carry LSP guidance for: ${guidance.unknownLanguages.map((l) => `\`${l}\``).join(", ")}.`,
      "Add a mapping once the language-server choice is stable for this ecosystem.",
      "",
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function addPackageLanguages(
  byLanguage: Map<string, Set<string>>,
  unknown: Set<string>,
  pkg: PackageContext,
): void {
  for (const language of pkg.languages ?? []) addLanguage(byLanguage, unknown, language, pkg.path);
}

function addLanguage(
  byLanguage: Map<string, Set<string>>,
  unknown: Set<string>,
  rawLanguage: string,
  packagePath: string,
): void {
  const language = normalizeLanguage(rawLanguage);
  if (!language) return;
  if (!LSP_BY_LANGUAGE[language]) {
    unknown.add(language);
    return;
  }
  const paths = byLanguage.get(language) ?? new Set<string>();
  paths.add(packagePath);
  byLanguage.set(language, paths);
}

function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase().replace("#", "sharp");
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
