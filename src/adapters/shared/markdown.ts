/**
 * Extract a top-level (`##`) section from a markdown document by heading text,
 * returning the heading plus its body up to the next `##`/`#` heading. Returns
 * undefined when the section is absent.
 */
export function extractSection(markdown: string, headingText: string): string | undefined {
  const lines = markdown.split("\n");
  const target = headingText.trim().toLowerCase();
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]!);
    if (m && m[2]!.trim().toLowerCase() === target) {
      start = i;
      break;
    }
  }
  if (start === -1) return undefined;

  const headingLevel = /^(#{1,6})/.exec(lines[start]!)![1]!.length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]!);
    if (m && m[1]!.length <= headingLevel) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}
