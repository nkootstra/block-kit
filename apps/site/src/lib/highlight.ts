/** A run of JSON (or of a source that quotes it) and how to colour it. */
export type Token = { text: string; kind: "key" | "string" | "punct" | "other"; start: number };

/**
 * Splits JSON-like source into keys, strings, punctuation and the rest, with their offsets, for the
 * page's code panels (`.tok-*` in site.css). Not a parser: it only has to colour well-formed JSON.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],:])|([^"{}[\],:]+)/g;
  for (const m of source.matchAll(re)) {
    const start = m.index ?? 0;
    if (m[1] !== undefined) {
      tokens.push({ text: m[1], kind: m[2] ? "key" : "string", start });
      if (m[2]) tokens.push({ text: m[2], kind: "punct", start: start + m[1].length });
    } else if (m[3] !== undefined) tokens.push({ text: m[3], kind: "punct", start });
    else tokens.push({ text: m[0], kind: "other", start });
  }
  return tokens;
}
