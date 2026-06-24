export function stripMarkdown(content: string): string {
  let result = content;

  // Remove code fences (``` blocks)
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    const lines = match.split("\n");
    // Strip the opening ``` line (with optional language tag) and closing ```
    return lines.slice(1, lines.length - 1).join("\n");
  });

  // Remove inline code backticks
  result = result.replace(/`([^`]+)`/g, "$1");

  // Remove headings (# markers)
  result = result.replace(/^#{1,6}\s+/gm, "");

  // Remove bold (**text** or __text__)
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");

  // Remove italic (*text* or _text_)
  result = result.replace(/\*(.+?)\*/g, "$1");
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1");

  // Convert links [text](url) -> text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove images ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, "");

  // Remove blockquote markers
  result = result.replace(/^>\s?/gm, "");

  // Collapse multiple blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}
