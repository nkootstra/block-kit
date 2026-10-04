/**
 * Renders the inline Markdown that type-table descriptions are written in (`code`, [links](/path)
 * and **bold**) to HTML. Everything else is escaped, so a description can't inject markup.
 */
export function inlineMarkdown(text: string): string {
  const parts: string[] = [];
  // Code spans first: what's inside them is literal, links and bold included.
  for (const [i, piece] of text.split(/(`[^`]+`)/).entries()) {
    if (i % 2 === 1) {
      parts.push(`<code>${escape(piece.slice(1, -1))}</code>`);
      continue;
    }
    parts.push(
      escape(piece)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
          safeHref(href) ? `<a href="${href}">${label}</a>` : label,
        )
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"),
    );
  }
  return parts.join("");
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Site paths, anchors and http(s) URLs; never `javascript:` or other schemes. */
function safeHref(href: string): boolean {
  return /^(\/|#|https?:\/\/)/.test(href);
}
